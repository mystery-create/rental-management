/**
 * routes/items.js
 * Item and Section Inventory Routes
 * Warehouse & Rental Bill Management System
 */

const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const authenticateToken = require('../middleware/auth');

// All item and section routes are protected
router.use(authenticateToken);

// Section endpoints
router.get('/sections', itemController.getAllSections);
router.post('/sections', itemController.createSection);
router.put('/sections/:id', itemController.updateSection);

// Item endpoints by section
router.get('/by-section/:section_id', itemController.getItemsBySection);

// Item inventory CRUD endpoints
router.get('/', itemController.getAllItems);
router.post('/', itemController.createItem);
router.put('/:id', itemController.updateItem);
router.patch('/:id/price', itemController.updateItemPrice);

module.exports = router;
