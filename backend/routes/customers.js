/**
 * routes/customers.js
 * Customer Management Routes
 * Warehouse & Rental Bill Management System
 */

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authenticateToken = require('../middleware/auth');

// All customer routes are protected
router.use(authenticateToken);

// GET /api/customers - List all customers with optional search (?search=)
router.get('/', customerController.getAllCustomers);

// GET /api/customers/:id - Get single customer with order count
router.get('/:id', customerController.getCustomerById);

// POST /api/customers - Create new customer
router.post('/', customerController.createCustomer);

// PUT /api/customers/:id - Update existing customer
router.put('/:id', customerController.updateCustomer);

// GET /api/customers/:id/orders - Get all orders for a customer
router.get('/:id/orders', customerController.getCustomerOrders);

module.exports = router;
