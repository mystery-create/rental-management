/**
 * routes/auth.js
 * Authentication Routes
 * Warehouse & Rental Bill Management System
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/auth');

// Public route: User login
router.post('/login', authController.login);

// Protected route: Current user details
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
