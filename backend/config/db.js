/**
 * config/db.js
 * MySQL2 Connection Pool Configuration
 * Warehouse & Rental Bill Management System
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create connection pool with promise support
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rental_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true, // Keep DECIMAL types as numbers where appropriate
  dateStrings: true     // Return dates as 'YYYY-MM-DD' strings to prevent timezone shifting
});

// Test the connection pool on initialization
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(' Successfully connected to MySQL database:', process.env.DB_NAME || 'rental_db');
    connection.release();
  } catch (err) {
    console.error(' MySQL Connection Pool Error:', err.message);
  }
})();

module.exports = pool;
