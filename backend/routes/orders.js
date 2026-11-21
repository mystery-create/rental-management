/**
 * routes/orders.js
 * Rental Order Routes
 * Warehouse & Rental Bill Management System
 */

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authenticateToken = require('../middleware/auth');

// All order routes are protected
router.use(authenticateToken);

// GET /api/orders - List all orders with optional ?status= filter
router.get('/', orderController.getOrders);

// POST /api/orders - Create a new rental booking order
router.post('/', orderController.createOrder);

// GET /api/orders/:id - Get full order details (items, payments, extensions, bill)
router.get('/:id', orderController.getOrderById);

// POST /api/orders/:id/extend - Extend an order's expected return date
router.post('/:id/extend', orderController.extendOrder);

// DELETE /api/orders/:id - Cancel an active order and restore items to stock
router.delete('/:id', orderController.cancelOrder);

module.exports = router;
