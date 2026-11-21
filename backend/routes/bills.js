/**
 * routes/bills.js
 * Billing and Dashboard Routes
 * Warehouse & Rental Bill Management System
 */

const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const authenticateToken = require('../middleware/auth');

// All billing and dashboard routes are protected
router.use(authenticateToken);

// GET /api/bills/dashboard - Get key metrics, low stock alert, and 7-day revenue chart
router.get('/dashboard', billController.getDashboardStats);

// POST /api/bills/generate - Generate final bill and restore returned items
router.post('/generate', billController.generateBill);

// GET /api/bills/order/:order_id - Get bill details by order ID
router.get('/order/:order_id', billController.getBillByOrder);

// POST /api/bills/payment - Record remaining/partial payment against a bill
router.post('/payment', billController.recordPayment);

// POST /api/bills/return-remaining - Check in previously missing items and restore stock
router.post('/return-remaining', billController.returnRemainingItems);

module.exports = router;
