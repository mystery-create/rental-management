/**
 * controllers/orderController.js
 * Order Management Controller
 * Warehouse & Rental Bill Management System
 */

const pool = require('../config/db');

/**
 * Create a new rental order
 * POST /api/orders
 * Body: { customer_id, start_date, expected_return_date, advance_amount, items: [{item_id, quantity}], notes }
 */
const createOrder = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      customer_id,
      start_date,
      expected_return_date,
      advance_amount = 0,
      items,
      notes
    } = req.body;

    // Validate user authentication
    const createdBy = req.user && req.user.user_id;
    if (!createdBy) {
      conn.release();
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User ID missing from token.'
      });
    }

    // Basic input validations
    if (!customer_id || !start_date || !expected_return_date) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'customer_id, start_date, and expected_return_date are required.'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'At least one item must be included in the order.'
      });
    }

    // Verify customer exists
    const [customerRows] = await conn.query(
      'SELECT customer_id, name FROM customers WHERE customer_id = ?',
      [customer_id]
    );

    if (customerRows.length === 0) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Customer not found.'
      });
    }

    // Start Transaction
    await conn.beginTransaction();

    // Check available inventory and prepare snapshot prices
    const itemSnapshots = [];
    for (const orderItem of items) {
      const itemId = Number(orderItem.item_id);
      const reqQty = parseInt(orderItem.quantity, 10);

      if (!itemId || isNaN(reqQty) || reqQty <= 0) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          success: false,
          message: 'Invalid item_id or quantity provided in items array.'
        });
      }

      // Lock row for inventory check
      const [itemRows] = await conn.query(
        'SELECT item_id, item_name, price_per_day, available_quantity FROM items WHERE item_id = ? FOR UPDATE',
        [itemId]
      );

      if (itemRows.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({
          success: false,
          message: `Item with ID ${itemId} not found.`
        });
      }

      const dbItem = itemRows[0];
      if (dbItem.available_quantity < reqQty) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${dbItem.item_name}". Available: ${dbItem.available_quantity}, Requested: ${reqQty}`
        });
      }

      itemSnapshots.push({
        item_id: itemId,
        quantity: reqQty,
        price_per_day_snapshot: dbItem.price_per_day,
        item_name: dbItem.item_name
      });
    }

    // Insert into orders table
    const advance = Number(advance_amount) >= 0 ? Number(advance_amount) : 0;
    const [orderResult] = await conn.query(
      `INSERT INTO orders (customer_id, created_by, start_date, expected_return_date, advance_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [customer_id, createdBy, start_date, expected_return_date, advance, notes || null]
    );

    const orderId = orderResult.insertId;

    // Insert order_items and decrease available_quantity in items table
    for (const item of itemSnapshots) {
      await conn.query(
        `INSERT INTO order_items (order_id, item_id, quantity, price_per_day_snapshot)
         VALUES (?, ?, ?, ?)`,
        [orderId, item.item_id, item.quantity, item.price_per_day_snapshot]
      );

      await conn.query(
        `UPDATE items 
         SET available_quantity = available_quantity - ? 
         WHERE item_id = ?`,
        [item.quantity, item.item_id]
      );
    }

    // Insert advance payment into payments table if advance_amount > 0
    if (advance > 0) {
      await conn.query(
        `INSERT INTO payments (order_id, amount, payment_type, received_by)
         VALUES (?, ?, 'advance', ?)`,
        [orderId, advance, createdBy]
      );
    }

    // Commit Transaction
    await conn.commit();
    conn.release();

    // Fetch the created order details for response
    const [createdOrder] = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, u.full_name AS created_by_name
       FROM orders o
       JOIN customers c ON o.customer_id = c.customer_id
       JOIN users u ON o.created_by = u.user_id
       WHERE o.order_id = ?`,
      [orderId]
    );

    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      order: {
        ...createdOrder[0],
        items: itemSnapshots
      }
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Error in createOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating order.'
    });
  }
};

/**
 * Get all orders with customer details and status filter
 * GET /api/orders
 * Query: ?status=active (or extended, returned, cancelled)
 */
const getOrders = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT 
        o.order_id,
        o.customer_id,
        o.created_by,
        o.start_date,
        o.expected_return_date,
        o.actual_return_date,
        o.advance_amount,
        o.status,
        o.notes,
        o.created_at,
        c.name AS customer_name,
        c.phone AS customer_phone,
        u.full_name AS created_by_name,
        b.bill_id,
        b.total_amount,
        b.remaining_amount,
        b.payment_status,
        (
          SELECT COALESCE(SUM(GREATEST(0, oi.quantity - COALESCE(oi.returned_quantity, oi.quantity))), 0)
          FROM order_items oi
          WHERE oi.order_id = o.order_id AND o.status = 'returned'
        ) AS unreturned_items_count
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      JOIN users u ON o.created_by = u.user_id
      LEFT JOIN bills b ON o.order_id = b.order_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status.trim() !== '') {
      query += ` AND o.status = ?`;
      params.push(status.trim().toLowerCase());
    }

    query += ` ORDER BY o.created_at DESC`;

    const [orders] = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Error in getOrders:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching orders.'
    });
  }
};

/**
 * Get single order with complete details (items, customer, extensions, payments, bill)
 * GET /api/orders/:id
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch order + customer info
    const orderQuery = `
      SELECT 
        o.order_id,
        o.customer_id,
        o.created_by,
        o.start_date,
        o.expected_return_date,
        o.actual_return_date,
        o.advance_amount,
        o.status,
        o.notes,
        o.created_at,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address,
        u.full_name AS created_by_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      JOIN users u ON o.created_by = u.user_id
      WHERE o.order_id = ?
    `;

    const [orderRows] = await pool.query(orderQuery, [id]);

    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    const order = orderRows[0];

    // Fetch order items with section name
    const itemsQuery = `
      SELECT 
        oi.order_item_id,
        oi.order_id,
        oi.item_id,
        oi.quantity,
        oi.returned_quantity,
        oi.price_per_day_snapshot,
        i.item_name,
        s.section_name
      FROM order_items oi
      JOIN items i ON oi.item_id = i.item_id
      JOIN sections s ON i.section_id = s.section_id
      WHERE oi.order_id = ?
    `;
    const [items] = await pool.query(itemsQuery, [id]);

    // Fetch extensions
    const extensionsQuery = `
      SELECT 
        oe.extension_id,
        oe.order_id,
        oe.old_return_date,
        oe.new_return_date,
        oe.extended_at,
        u.full_name AS extended_by_name
      FROM order_extensions oe
      JOIN users u ON oe.extended_by = u.user_id
      WHERE oe.order_id = ?
      ORDER BY oe.extended_at ASC
    `;
    const [extensions] = await pool.query(extensionsQuery, [id]);

    // Fetch payments
    const paymentsQuery = `
      SELECT 
        p.payment_id,
        p.order_id,
        p.amount,
        p.payment_type,
        p.payment_date,
        u.full_name AS received_by_name
      FROM payments p
      JOIN users u ON p.received_by = u.user_id
      WHERE p.order_id = ?
      ORDER BY p.payment_date ASC
    `;
    const [payments] = await pool.query(paymentsQuery, [id]);

    // Fetch bill if generated
    const billQuery = `
      SELECT 
        b.*,
        u.full_name AS generated_by_name
      FROM bills b
      LEFT JOIN users u ON b.generated_by = u.user_id
      WHERE b.order_id = ?
    `;
    const [billRows] = await pool.query(billQuery, [id]);

    return res.status(200).json({
      success: true,
      order: {
        ...order,
        items,
        extensions,
        payments,
        bill: billRows.length > 0 ? billRows[0] : null
      }
    });
  } catch (error) {
    console.error('Error in getOrderById:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching order details.'
    });
  }
};

/**
 * Extend an order's expected return date
 * POST /api/orders/:id/extend
 * Body: { new_return_date }
 */
const extendOrder = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { new_return_date } = req.body;
    const extendedBy = req.user && req.user.user_id;

    if (!new_return_date) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'new_return_date is required.'
      });
    }

    await conn.beginTransaction();

    // Lock order row
    const [orderRows] = await conn.query(
      'SELECT order_id, expected_return_date, status FROM orders WHERE order_id = ? FOR UPDATE',
      [id]
    );

    if (orderRows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    const order = orderRows[0];

    if (order.status !== 'active' && order.status !== 'extended') {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: `Cannot extend order with status '${order.status}'. Only active or extended orders can be extended.`
      });
    }

    const oldReturnDate = order.expected_return_date;
    if (new Date(new_return_date) <= new Date(oldReturnDate)) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: `new_return_date (${new_return_date}) must be later than current expected return date (${oldReturnDate}).`
      });
    }

    // Insert extension record
    await conn.query(
      `INSERT INTO order_extensions (order_id, old_return_date, new_return_date, extended_by)
       VALUES (?, ?, ?, ?)`,
      [id, oldReturnDate, new_return_date, extendedBy]
    );

    // Update order expected_return_date and status
    await conn.query(
      `UPDATE orders 
       SET expected_return_date = ?, status = 'extended' 
       WHERE order_id = ?`,
      [new_return_date, id]
    );

    await conn.commit();
    conn.release();

    return res.status(200).json({
      success: true,
      message: 'Order return date extended successfully.',
      order_id: Number(id),
      old_return_date: oldReturnDate,
      new_return_date,
      status: 'extended'
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Error in extendOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while extending order.'
    });
  }
};

/**
 * Cancel an order and restore inventory items
 * DELETE /api/orders/:id
 */
const cancelOrder = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    // Lock order row
    const [orderRows] = await conn.query(
      'SELECT order_id, status FROM orders WHERE order_id = ? FOR UPDATE',
      [id]
    );

    if (orderRows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    const order = orderRows[0];

    if (order.status === 'cancelled') {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled.'
      });
    }

    if (order.status === 'returned') {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an order that has already been returned and billed.'
      });
    }

    // Fetch order items to restore inventory
    const [orderItems] = await conn.query(
      'SELECT item_id, quantity FROM order_items WHERE order_id = ?',
      [id]
    );

    // Restore available_quantity for each item
    for (const item of orderItems) {
      await conn.query(
        `UPDATE items 
         SET available_quantity = available_quantity + ? 
         WHERE item_id = ?`,
        [item.quantity, item.item_id]
      );
    }

    // Update order status to cancelled
    await conn.query(
      `UPDATE orders SET status = 'cancelled' WHERE order_id = ?`,
      [id]
    );

    await conn.commit();
    conn.release();

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully and inventory quantities restored.',
      order_id: Number(id)
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Error in cancelOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while cancelling order.'
    });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  extendOrder,
  cancelOrder
};
