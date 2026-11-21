/**
 * controllers/itemController.js
 * Items and Sections Controller
 * Warehouse & Rental Bill Management System
 */

const pool = require('../config/db');

// ==========================================
// SECTIONS CONTROLLERS
// ==========================================

/**
 * Get all item sections with count of items
 * GET /api/items/sections
 */
const getAllSections = async (req, res) => {
  try {
    const query = `
      SELECT 
        s.section_id, 
        s.section_name, 
        s.description, 
        COUNT(i.item_id) AS item_count
      FROM sections s
      LEFT JOIN items i ON s.section_id = i.section_id
      GROUP BY s.section_id
      ORDER BY s.section_name ASC
    `;

    const [sections] = await pool.query(query);

    return res.status(200).json({
      success: true,
      count: sections.length,
      sections
    });
  } catch (error) {
    console.error('Error in getAllSections:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching sections.'
    });
  }
};

/**
 * Create a new section
 * POST /api/items/sections
 * Body: { section_name, description }
 */
const createSection = async (req, res) => {
  try {
    const { section_name, description } = req.body;

    if (!section_name || section_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Section name is required.'
      });
    }

    // Check unique section_name
    const [existing] = await pool.query(
      'SELECT section_id FROM sections WHERE section_name = ?',
      [section_name.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A section with this name already exists.'
      });
    }

    const [result] = await pool.query(
      'INSERT INTO sections (section_name, description) VALUES (?, ?)',
      [section_name.trim(), description ? description.trim() : null]
    );

    const [newSection] = await pool.query(
      'SELECT section_id, section_name, description FROM sections WHERE section_id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Section created successfully.',
      section: newSection[0]
    });
  } catch (error) {
    console.error('Error in createSection:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating section.'
    });
  }
};

/**
 * Update an existing section
 * PUT /api/items/sections/:id
 * Body: { section_name, description }
 */
const updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { section_name, description } = req.body;

    if (!section_name || section_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Section name is required.'
      });
    }

    // Check if section exists
    const [existing] = await pool.query(
      'SELECT section_id FROM sections WHERE section_id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Section not found.'
      });
    }

    // Check if name is taken by another section
    const [nameConflict] = await pool.query(
      'SELECT section_id FROM sections WHERE section_name = ? AND section_id != ?',
      [section_name.trim(), id]
    );

    if (nameConflict.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Another section with this name already exists.'
      });
    }

    await pool.query(
      'UPDATE sections SET section_name = ?, description = ? WHERE section_id = ?',
      [section_name.trim(), description ? description.trim() : null, id]
    );

    const [updated] = await pool.query(
      'SELECT section_id, section_name, description FROM sections WHERE section_id = ?',
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Section updated successfully.',
      section: updated[0]
    });
  } catch (error) {
    console.error('Error in updateSection:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating section.'
    });
  }
};

// ==========================================
// ITEMS CONTROLLERS
// ==========================================

/**
 * Get items by section ID including available quantity
 * GET /api/items/by-section/:section_id
 */
const getItemsBySection = async (req, res) => {
  try {
    const { section_id } = req.params;

    // Verify section exists
    const [section] = await pool.query(
      'SELECT section_id, section_name FROM sections WHERE section_id = ?',
      [section_id]
    );

    if (section.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Section not found.'
      });
    }

    const query = `
      SELECT 
        i.item_id, 
        i.section_id, 
        i.item_name, 
        i.price_per_day, 
        i.total_quantity, 
        i.available_quantity, 
        i.updated_at,
        s.section_name
      FROM items i
      JOIN sections s ON i.section_id = s.section_id
      WHERE i.section_id = ?
      ORDER BY i.item_name ASC
    `;

    const [items] = await pool.query(query, [section_id]);

    return res.status(200).json({
      success: true,
      section_id: Number(section_id),
      section_name: section[0].section_name,
      count: items.length,
      items
    });
  } catch (error) {
    console.error('Error in getItemsBySection:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching items by section.'
    });
  }
};

/**
 * Get all items with section name, supporting ?search= and ?section_id= filters
 * GET /api/items
 */
const getAllItems = async (req, res) => {
  try {
    const { search, section_id } = req.query;

    let query = `
      SELECT 
        i.item_id, 
        i.section_id, 
        i.item_name, 
        i.price_per_day, 
        i.total_quantity, 
        i.available_quantity, 
        i.updated_at,
        s.section_name
      FROM items i
      JOIN sections s ON i.section_id = s.section_id
      WHERE 1=1
    `;
    const params = [];

    if (section_id) {
      query += ` AND i.section_id = ?`;
      params.push(section_id);
    }

    if (search && search.trim() !== '') {
      query += ` AND (i.item_name LIKE ? OR s.section_name LIKE ?)`;
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY s.section_name ASC, i.item_name ASC`;

    const [items] = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    console.error('Error in getAllItems:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching items.'
    });
  }
};

/**
 * Create a new rental inventory item
 * POST /api/items
 * Body: { section_id, item_name, price_per_day, total_quantity }
 */
const createItem = async (req, res) => {
  try {
    const { section_id, item_name, name, price_per_day, total_quantity } = req.body;
    const resolvedName = item_name || name;

    if (!section_id || !resolvedName) {
      return res.status(400).json({
        success: false,
        message: 'Section ID and item name are required.'
      });
    }

    // Verify section exists
    const [section] = await pool.query(
      'SELECT section_id FROM sections WHERE section_id = ?',
      [section_id]
    );

    if (section.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Specified section does not exist.'
      });
    }

    const price = Number(price_per_day) >= 0 ? Number(price_per_day) : 0.00;
    const totalQty = parseInt(total_quantity, 10) >= 0 ? parseInt(total_quantity, 10) : 0;
    const availableQty = totalQty; // Initially all items are available

    const [result] = await pool.query(
      `INSERT INTO items (section_id, item_name, price_per_day, total_quantity, available_quantity) 
       VALUES (?, ?, ?, ?, ?)`,
      [section_id, resolvedName.trim(), price, totalQty, availableQty]
    );

    const [newItem] = await pool.query(
      `SELECT i.*, s.section_name 
       FROM items i 
       JOIN sections s ON i.section_id = s.section_id 
       WHERE i.item_id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Item created successfully.',
      item: newItem[0]
    });
  } catch (error) {
    console.error('Error in createItem:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating item.'
    });
  }
};

/**
 * Update an item (name, price_per_day, total_quantity)
 * Also updates available_quantity proportionally to preserve currently rented count
 * PUT /api/items/:id
 * Body: { item_name (or name), price_per_day, total_quantity, section_id }
 */
const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { item_name, name, price_per_day, total_quantity, section_id } = req.body;
    const resolvedName = item_name || name;

    // Check if item exists
    const [existingRows] = await pool.query(
      'SELECT * FROM items WHERE item_id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found.'
      });
    }

    const existingItem = existingRows[0];
    const oldTotal = Number(existingItem.total_quantity);
    const oldAvailable = Number(existingItem.available_quantity);
    const rentedQuantity = oldTotal - oldAvailable;

    let newTotal = oldTotal;
    let newAvailable = oldAvailable;

    if (total_quantity !== undefined && total_quantity !== null) {
      const parsedTotal = parseInt(total_quantity, 10);
      if (isNaN(parsedTotal) || parsedTotal < 0) {
        return res.status(400).json({
          success: false,
          message: 'Total quantity must be a non-negative integer.'
        });
      }

      if (parsedTotal < rentedQuantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce total quantity below currently rented quantity (${rentedQuantity}).`
        });
      }

      newTotal = parsedTotal;
      // Proportionally update available quantity based on difference in total quantity
      const delta = newTotal - oldTotal;
      newAvailable = oldAvailable + delta;
    }

    const updatedName = resolvedName ? resolvedName.trim() : existingItem.item_name;
    const updatedPrice = price_per_day !== undefined && Number(price_per_day) >= 0
      ? Number(price_per_day)
      : existingItem.price_per_day;
    const updatedSectionId = section_id ? Number(section_id) : existingItem.section_id;

    await pool.query(
      `UPDATE items 
       SET item_name = ?, price_per_day = ?, total_quantity = ?, available_quantity = ?, section_id = ? 
       WHERE item_id = ?`,
      [updatedName, updatedPrice, newTotal, newAvailable, updatedSectionId, id]
    );

    const [updatedRows] = await pool.query(
      `SELECT i.*, s.section_name 
       FROM items i 
       JOIN sections s ON i.section_id = s.section_id 
       WHERE i.item_id = ?`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Item updated successfully.',
      item: updatedRows[0]
    });
  } catch (error) {
    console.error('Error in updateItem:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating item.'
    });
  }
};

/**
 * Update only the price_per_day of an item
 * PATCH /api/items/:id/price
 * Body: { price_per_day }
 */
const updateItemPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { price_per_day } = req.body;

    if (price_per_day === undefined || price_per_day === null || Number(price_per_day) < 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid non-negative price_per_day is required.'
      });
    }

    // Check if item exists
    const [existing] = await pool.query(
      'SELECT item_id FROM items WHERE item_id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found.'
      });
    }

    await pool.query(
      'UPDATE items SET price_per_day = ? WHERE item_id = ?',
      [Number(price_per_day), id]
    );

    const [updated] = await pool.query(
      `SELECT i.*, s.section_name 
       FROM items i 
       JOIN sections s ON i.section_id = s.section_id 
       WHERE i.item_id = ?`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Item price updated successfully.',
      item: updated[0]
    });
  } catch (error) {
    console.error('Error in updateItemPrice:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating item price.'
    });
  }
};

module.exports = {
  getAllSections,
  createSection,
  updateSection,
  getItemsBySection,
  getAllItems,
  createItem,
  updateItem,
  updateItemPrice
};
