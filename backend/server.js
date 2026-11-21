/**
 * server.js
 * Main Express Application Entry Point
 * Warehouse & Rental Bill Management System
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config();

// Import database pool to initialize DB connection
require('./config/db');

// Import route modules
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const itemRoutes = require('./routes/items');
const orderRoutes = require('./routes/orders');
const billRoutes = require('./routes/bills');

// Initialize Express application
const app = express();

// Middleware setup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check / welcome route on /api
app.get('/api', async (req, res) => {
  try {
    const pool = require('./config/db');
    const [rows] = await pool.query('SELECT 1 + 1 AS test');
    res.status(200).json({
      success: true,
      message: 'Rental Management API running',
      database: 'Connected successfully to ' + (process.env.DB_NAME || 'rental_db'),
      env_check: {
        host: process.env.DB_HOST ? 'Set' : 'Missing',
        user: process.env.DB_USER ? 'Set' : 'Missing',
        port: process.env.DB_PORT || 3306,
        ssl: process.env.DB_SSL || 'unset'
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'API running but Database connection failed',
      error: err.message,
      code: err.code,
      hint: 'Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, and DB_SSL in Vercel Environment Variables'
    });
  }
});

// API Routes Mounting
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bills', billRoutes);

// Default fallback to index.html for non-API routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 404 Route Handler for undefined endpoints
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack || err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start Express server only when run directly (not in Vercel serverless environment)
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(` Warehouse & Rental Management API`);
    console.log(` Server running on http://localhost:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=============================================`);
  });

  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('Process terminated.');
    });
  });
}

module.exports = app;
