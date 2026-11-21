/**
 * server.js
 * Main Express Application Entry Point
 * Warehouse & Rental Bill Management System
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

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

// Health check / welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Rental Management API running'
  });
});

// API Routes Mounting
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bills', billRoutes);

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
