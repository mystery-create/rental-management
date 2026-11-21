/**
 * config/db.js
 * MySQL2 Connection Pool Configuration & Auto Schema Initialization
 * Warehouse & Rental Bill Management System
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Determine if SSL should be enabled (auto-enable for cloud databases like TiDB / Aiven)
const isLocalhost = ['localhost', '127.0.0.1'].includes(process.env.DB_HOST || 'localhost');
const useSSL = process.env.DB_SSL === 'true' || (!isLocalhost && process.env.DB_SSL !== 'false');

// Create connection pool with promise support
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rental_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  ssl: useSSL ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined,
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true, // Keep DECIMAL types as numbers where appropriate
  dateStrings: true     // Return dates as 'YYYY-MM-DD' strings to prevent timezone shifting
});

// Auto-initialize schema and default seeds on startup
let initPromise = null;
async function initDatabase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let connection;
    try {
      connection = await pool.getConnection();
      console.log(' Successfully connected to MySQL database:', process.env.DB_NAME || 'rental_db');

      // Create tables in order
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          user_id       INT AUTO_INCREMENT PRIMARY KEY,
          username      VARCHAR(50) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          full_name     VARCHAR(100) NOT NULL,
          role          ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
          created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS customers (
          customer_id INT AUTO_INCREMENT PRIMARY KEY,
          name        VARCHAR(100) NOT NULL,
          phone       VARCHAR(15) NOT NULL UNIQUE,
          address     TEXT,
          created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS sections (
          section_id   INT AUTO_INCREMENT PRIMARY KEY,
          section_name VARCHAR(100) NOT NULL UNIQUE,
          description  TEXT
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS items (
          item_id            INT AUTO_INCREMENT PRIMARY KEY,
          section_id         INT NOT NULL,
          item_name          VARCHAR(150) NOT NULL,
          price_per_day      DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          total_quantity     INT NOT NULL DEFAULT 0,
          available_quantity INT NOT NULL DEFAULT 0,
          updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (section_id) REFERENCES sections(section_id) ON DELETE RESTRICT
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS orders (
          order_id             INT AUTO_INCREMENT PRIMARY KEY,
          customer_id          INT NOT NULL,
          created_by           INT NOT NULL,
          start_date           DATE NOT NULL,
          expected_return_date DATE NOT NULL,
          actual_return_date   DATE,
          advance_amount       DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          status               ENUM('active', 'extended', 'returned', 'cancelled') NOT NULL DEFAULT 'active',
          notes                TEXT,
          created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE RESTRICT,
          FOREIGN KEY (created_by)  REFERENCES users(user_id) ON DELETE RESTRICT
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS order_items (
          order_item_id          INT AUTO_INCREMENT PRIMARY KEY,
          order_id               INT NOT NULL,
          item_id                INT NOT NULL,
          quantity               INT NOT NULL DEFAULT 1,
          returned_quantity      INT NULL DEFAULT NULL,
          price_per_day_snapshot DECIMAL(10, 2) NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
          FOREIGN KEY (item_id)  REFERENCES items(item_id) ON DELETE RESTRICT
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS order_extensions (
          extension_id    INT AUTO_INCREMENT PRIMARY KEY,
          order_id        INT NOT NULL,
          old_return_date DATE NOT NULL,
          new_return_date DATE NOT NULL,
          extended_by     INT NOT NULL,
          extended_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id)    REFERENCES orders(order_id) ON DELETE CASCADE,
          FOREIGN KEY (extended_by) REFERENCES users(user_id) ON DELETE RESTRICT
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS bills (
          bill_id          INT AUTO_INCREMENT PRIMARY KEY,
          order_id         INT NOT NULL UNIQUE,
          total_days       INT NOT NULL,
          subtotal         DECIMAL(10, 2) NOT NULL,
          penalty_amount   DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          penalty_waived   BOOLEAN NOT NULL DEFAULT FALSE,
          waive_reason     VARCHAR(255),
          total_amount     DECIMAL(10, 2) NOT NULL,
          advance_paid     DECIMAL(10, 2) NOT NULL,
          remaining_amount DECIMAL(10, 2) NOT NULL,
          payment_status   ENUM('pending', 'partial', 'paid') NOT NULL DEFAULT 'pending',
          generated_by     INT NOT NULL,
          generated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id)     REFERENCES orders(order_id) ON DELETE RESTRICT,
          FOREIGN KEY (generated_by) REFERENCES users(user_id) ON DELETE RESTRICT
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS payments (
          payment_id   INT AUTO_INCREMENT PRIMARY KEY,
          order_id     INT NOT NULL,
          amount       DECIMAL(10, 2) NOT NULL,
          payment_type ENUM('advance', 'remaining', 'partial') NOT NULL,
          received_by  INT NOT NULL,
          payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id)    REFERENCES orders(order_id) ON DELETE RESTRICT,
          FOREIGN KEY (received_by) REFERENCES users(user_id) ON DELETE RESTRICT
        )
      `);

      // Ensure default admin user
      const [adminRows] = await connection.query('SELECT user_id FROM users WHERE username = ?', ['admin']);
      if (adminRows.length === 0) {
        await connection.query(`
          INSERT INTO users (username, password_hash, full_name, role) VALUES
          ('admin', '$2b$10$wcyqxXlgh6ztgzxYSVnoW.M58VDqUfa06VJIMlVVA6sqVsbddISIe', 'Administrator', 'admin')
        `);
        console.log(' Seeded default admin user (admin / admin123)');
      }

      // Ensure default sections
      const [secRows] = await connection.query('SELECT COUNT(*) as count FROM sections');
      if (secRows[0].count === 0) {
        await connection.query(`
          INSERT INTO sections (section_name, description) VALUES
          ('Utensils',    'Plates, bowls, glasses, spoons, serving dishes etc.'),
          ('Cloth',       'Table cloth, shamiyana, curtains, chair covers etc.'),
          ('Electric',    'Lights, fans, generators, extension boards etc.'),
          ('Furniture',   'Chairs, tables, sofas, mandap etc.'),
          ('Decoration',  'Flowers, balloons, rangoli items etc.')
        `);
        console.log(' Seeded default sections.');
      }

      // Ensure sample items
      const [itemRows] = await connection.query('SELECT COUNT(*) as count FROM items');
      if (itemRows[0].count === 0) {
        const [allSecs] = await connection.query('SELECT section_id, section_name FROM sections');
        const secMap = {};
        allSecs.forEach(s => { secMap[s.section_name] = s.section_id; });

        const sampleItems = [
          { name: 'Dinner Plates (Stainless Steel)', sec: 'Utensils', price: 5, qty: 500 },
          { name: 'Serving Bowls (Large)', sec: 'Utensils', price: 15, qty: 100 },
          { name: 'Water Glasses (Set of 10)', sec: 'Utensils', price: 20, qty: 150 },
          { name: 'White Banquet Tablecloth (6x4 ft)', sec: 'Cloth', price: 30, qty: 80 },
          { name: 'Red Carpet Runner (50 ft)', sec: 'Cloth', price: 150, qty: 20 },
          { name: 'Waterproof Shamiyana Tent (20x20 ft)', sec: 'Cloth', price: 500, qty: 15 },
          { name: 'Satin Chair Covers', sec: 'Cloth', price: 10, qty: 400 },
          { name: 'LED Halogen Flood Light 100W', sec: 'Electric', price: 100, qty: 50 },
          { name: 'Stage Sound System 1000W + Mic', sec: 'Electric', price: 1200, qty: 8 },
          { name: 'Decorative Fairy Lights (50m String)', sec: 'Electric', price: 40, qty: 60 },
          { name: 'High-Velocity Pedestal Fan', sec: 'Electric', price: 150, qty: 30 },
          { name: 'Plastic Banquet Armless Chairs', sec: 'Furniture', price: 12, qty: 600 },
          { name: 'Round Dining Table (8-seater)', sec: 'Furniture', price: 200, qty: 40 },
          { name: 'Royal Stage Sofa (2-seater)', sec: 'Furniture', price: 1500, qty: 5 },
          { name: 'Artificial Flower Welcome Arch', sec: 'Decoration', price: 800, qty: 10 },
          { name: 'Balloon Backdrop Stand Kit', sec: 'Decoration', price: 350, qty: 12 }
        ];

        for (const it of sampleItems) {
          const secId = secMap[it.sec];
          if (secId) {
            await connection.query(
              'INSERT INTO items (section_id, item_name, price_per_day, total_quantity, available_quantity) VALUES (?, ?, ?, ?, ?)',
              [secId, it.name, it.price, it.qty, it.qty]
            );
          }
        }
        console.log(' Seeded initial warehouse inventory items.');
      }
    } catch (err) {
      console.error(' MySQL Connection / Initialization Error:', err.message);
    } finally {
      if (connection) connection.release();
    }
  })();

  return initPromise;
}

// Trigger initial connection test and schema check
initDatabase();

module.exports = pool;
