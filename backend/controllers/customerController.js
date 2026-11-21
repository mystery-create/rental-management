/**
 * controllers/customerController.js
 * Customer Management Controller
 * Warehouse & Rental Bill Management System
 */

const pool = require('../config/db');

/**
 * Get all customers with optional search filter (?search=)
 * GET /api/customers
 */
const getAllCustomers = async (req, res) => {
  try {
    const { search } = req.query;

    let query = `
      SELECT 
        c.customer_id, 
        c.name, 
        c.phone, 
        c.address, 
        c.created_at, 
        COUNT(o.order_id) AS order_count
      FROM customers c
      LEFT JOIN orders o ON c.customer_id = o.customer_id
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ` WHERE c.name LIKE ? OR c.phone LIKE ?`;
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` GROUP BY c.customer_id ORDER BY c.created_at DESC`;

    const [customers] = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers
    });
  } catch (error) {
    console.error('Error in getAllCustomers:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching customers.'
    });
  }
};

/**
 * Get single customer details with order count
 * GET /api/customers/:id
 */
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        c.customer_id, 
        c.name, 
        c.phone, 
        c.address, 
        c.created_at, 
        COUNT(o.order_id) AS order_count
      FROM customers c
      LEFT JOIN orders o ON c.customer_id = o.customer_id
      WHERE c.customer_id = ?
      GROUP BY c.customer_id
    `;

    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.'
      });
    }

    return res.status(200).json({
      success: true,
      customer: rows[0]
    });
  } catch (error) {
    console.error('Error in getCustomerById:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching customer details.'
    });
  }
};

/**
 * Create a new customer
 * POST /api/customers
 * Body: { name, phone, address }
 */
const createCustomer = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone number are required.'
      });
    }

    // Check if phone already exists
    const [existing] = await pool.query(
      'SELECT customer_id FROM customers WHERE phone = ?',
      [phone.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A customer with this phone number already exists.'
      });
    }

    const [result] = await pool.query(
      'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
      [name.trim(), phone.trim(), address ? address.trim() : null]
    );

    const [newCustomer] = await pool.query(
      'SELECT customer_id, name, phone, address, created_at FROM customers WHERE customer_id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully.',
      customer: newCustomer[0]
    });
  } catch (error) {
    console.error('Error in createCustomer:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating customer.'
    });
  }
};

/**
 * Update an existing customer
 * PUT /api/customers/:id
 * Body: { name, phone, address }
 */
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, address } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone number are required.'
      });
    }

    // Check if customer exists
    const [existingCustomer] = await pool.query(
      'SELECT customer_id FROM customers WHERE customer_id = ?',
      [id]
    );

    if (existingCustomer.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.'
      });
    }

    // Check if new phone is taken by another customer
    const [phoneConflict] = await pool.query(
      'SELECT customer_id FROM customers WHERE phone = ? AND customer_id != ?',
      [phone.trim(), id]
    );

    if (phoneConflict.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Another customer with this phone number already exists.'
      });
    }

    await pool.query(
      'UPDATE customers SET name = ?, phone = ?, address = ? WHERE customer_id = ?',
      [name.trim(), phone.trim(), address ? address.trim() : null, id]
    );

    const [updated] = await pool.query(
      'SELECT customer_id, name, phone, address, created_at FROM customers WHERE customer_id = ?',
      [id]
    );

    return res.status(200).json({
      success: true,
      message: 'Customer updated successfully.',
      customer: updated[0]
    });
  } catch (error) {
    console.error('Error in updateCustomer:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating customer.'
    });
  }
};

/**
 * Get all orders for a specific customer
 * GET /api/customers/:id/orders
 */
const getCustomerOrders = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify customer exists
    const [customer] = await pool.query(
      'SELECT customer_id, name FROM customers WHERE customer_id = ?',
      [id]
    );

    if (customer.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found.'
      });
    }

    const query = `
      SELECT 
        o.order_id,
        o.customer_id,
        o.start_date,
        o.expected_return_date,
        o.actual_return_date,
        o.advance_amount,
        o.status,
        o.notes,
        o.created_at,
        u.full_name AS created_by_name,
        b.bill_id,
        b.total_amount,
        b.remaining_amount,
        b.payment_status
      FROM orders o
      JOIN users u ON o.created_by = u.user_id
      LEFT JOIN bills b ON o.order_id = b.order_id
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `;

    const [orders] = await pool.query(query, [id]);

    return res.status(200).json({
      success: true,
      customer_id: Number(id),
      customer_name: customer[0].name,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Error in getCustomerOrders:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching customer orders.'
    });
  }
};

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  getCustomerOrders
};
