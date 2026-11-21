-- ============================================================
-- Warehouse & Rental Bill Management System
-- Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS rental_db;
USE rental_db;

-- ============================================================
-- 1. USERS — System staff accounts
-- ============================================================
CREATE TABLE users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    role          ENUM('admin', 'staff') NOT NULL DEFAULT 'staff',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. CUSTOMERS — Rental customers
-- ============================================================
CREATE TABLE customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    phone       VARCHAR(15) NOT NULL UNIQUE,
    address     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. SECTIONS — Item categories (Utensils, Cloth, Electric...)
-- ============================================================
CREATE TABLE sections (
    section_id   INT AUTO_INCREMENT PRIMARY KEY,
    section_name VARCHAR(100) NOT NULL UNIQUE,
    description  TEXT
);

-- ============================================================
-- 4. ITEMS — Rental inventory items
-- ============================================================
CREATE TABLE items (
    item_id            INT AUTO_INCREMENT PRIMARY KEY,
    section_id         INT NOT NULL,
    item_name          VARCHAR(150) NOT NULL,
    price_per_day      DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_quantity     INT NOT NULL DEFAULT 0,
    available_quantity INT NOT NULL DEFAULT 0,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(section_id) ON DELETE RESTRICT
);

-- ============================================================
-- 5. ORDERS — Rental bookings
-- ============================================================
CREATE TABLE orders (
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
);

-- ============================================================
-- 6. ORDER_ITEMS — Items included in each order
-- ============================================================
CREATE TABLE order_items (
    order_item_id          INT AUTO_INCREMENT PRIMARY KEY,
    order_id               INT NOT NULL,
    item_id                INT NOT NULL,
    quantity               INT NOT NULL DEFAULT 1,
    returned_quantity      INT NULL DEFAULT NULL,
    price_per_day_snapshot DECIMAL(10, 2) NOT NULL,  -- frozen at booking time
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id)  REFERENCES items(item_id) ON DELETE RESTRICT
);

-- ============================================================
-- 7. ORDER_EXTENSIONS — Track order date extensions
-- ============================================================
CREATE TABLE order_extensions (
    extension_id    INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    old_return_date DATE NOT NULL,
    new_return_date DATE NOT NULL,
    extended_by     INT NOT NULL,
    extended_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)    REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (extended_by) REFERENCES users(user_id) ON DELETE RESTRICT
);

-- ============================================================
-- 8. BILLS — Final bill per order
-- ============================================================
CREATE TABLE bills (
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
);

-- ============================================================
-- 9. PAYMENTS — Payment records (advance + remaining)
-- ============================================================
CREATE TABLE payments (
    payment_id   INT AUTO_INCREMENT PRIMARY KEY,
    order_id     INT NOT NULL,
    amount       DECIMAL(10, 2) NOT NULL,
    payment_type ENUM('advance', 'remaining', 'partial') NOT NULL,
    received_by  INT NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)    REFERENCES orders(order_id) ON DELETE RESTRICT,
    FOREIGN KEY (received_by) REFERENCES users(user_id) ON DELETE RESTRICT
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default admin user (password: admin123)
-- bcrypt hash of 'admin123' with 10 rounds
INSERT INTO users (username, password_hash, full_name, role) VALUES
('admin', '$2b$10$wcyqxXlgh6ztgzxYSVnoW.M58VDqUfa06VJIMlVVA6sqVsbddISIe', 'Administrator', 'admin');

-- Default sections
INSERT INTO sections (section_name, description) VALUES
('Utensils',    'Plates, bowls, glasses, spoons, serving dishes etc.'),
('Cloth',       'Table cloth, shamiyana, curtains, chair covers etc.'),
('Electric',    'Lights, fans, generators, extension boards etc.'),
('Furniture',   'Chairs, tables, sofas, mandap etc.'),
('Decoration',  'Flowers, balloons, rangoli items etc.');
