/**
 * controllers/billController.js
 * Bill Generation and Dashboard Statistics Controller
 * Warehouse & Rental Bill Management System
 */

const pool = require('../config/db');
const { calculateBill, normalizeDateStr } = require('../utils/billingHelper');

/**
 * Generate final bill for an order upon return
 * POST /api/bills/generate
 * Body: { order_id, actual_return_date, return_time, penalty_waived, waive_reason }
 */
const generateBill = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      order_id,
      actual_return_date,
      return_time = '09:00',
      penalty_waived = false,
      waive_reason = null,
      returned_items = null,
      amount_paid_at_return = 0
    } = req.body;

    const generatedBy = req.user && req.user.user_id;

    if (!order_id || !actual_return_date) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'order_id and actual_return_date are required.'
      });
    }

    // Check if bill already exists for this order
    const [existingBills] = await pool.query(
      'SELECT bill_id FROM bills WHERE order_id = ?',
      [order_id]
    );

    if (existingBills.length > 0) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'A bill has already been generated for this order.',
        bill_id: existingBills[0].bill_id
      });
    }

    await conn.beginTransaction();

    // Lock order row
    const [orderRows] = await conn.query(
      'SELECT * FROM orders WHERE order_id = ? FOR UPDATE',
      [order_id]
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
        message: 'Cannot generate a bill for a cancelled order.'
      });
    }

    if (order.status === 'returned') {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'Order is already marked as returned.'
      });
    }

    // Fetch order items
    const [orderItems] = await conn.query(
      `SELECT oi.*, i.item_name 
       FROM order_items oi 
       JOIN items i ON oi.item_id = i.item_id 
       WHERE oi.order_id = ?`,
      [order_id]
    );

    // Calculate billing amounts
    let billCalc = calculateBill(order, orderItems, actual_return_date, return_time);

    let penaltyAmount = billCalc.penalty_amount;
    let isWaived = Boolean(penalty_waived);
    let resolvedWaiveReason = waive_reason ? waive_reason.trim() : null;

    if (isWaived) {
      penaltyAmount = 0.00;
    }

    const totalAmount = Number((billCalc.subtotal + penaltyAmount).toFixed(2));
    const advancePaid = Number(order.advance_amount || 0);
    const initialRemaining = Number((totalAmount - advancePaid).toFixed(2));

    const returnPay = Number(amount_paid_at_return) > 0 ? Number(amount_paid_at_return) : 0;
    let remainingAmount = Number((initialRemaining - returnPay).toFixed(2));

    let paymentStatus = 'pending';
    if (remainingAmount <= 0) {
      remainingAmount = 0.00;
      paymentStatus = 'paid';
    } else if (advancePaid > 0 || returnPay > 0) {
      paymentStatus = 'partial';
    }

    // Insert into bills table
    const [billResult] = await conn.query(
      `INSERT INTO bills (
        order_id, 
        total_days, 
        subtotal, 
        penalty_amount, 
        penalty_waived, 
        waive_reason, 
        total_amount, 
        advance_paid, 
        remaining_amount, 
        payment_status, 
        generated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order_id,
        billCalc.total_days,
        billCalc.subtotal,
        penaltyAmount,
        isWaived ? 1 : 0,
        isWaived ? resolvedWaiveReason : null,
        totalAmount,
        advancePaid,
        remainingAmount,
        paymentStatus,
        generatedBy
      ]
    );

    const billId = billResult.insertId;

    // Record payment made at return time if returnPay > 0
    if (returnPay > 0) {
      const pType = returnPay >= initialRemaining ? 'remaining' : 'partial';
      await conn.query(
        `INSERT INTO payments (order_id, amount, payment_type, received_by)
         VALUES (?, ?, ?, ?)`,
        [order_id, returnPay, pType, generatedBy]
      );
    }

    // Update orders: actual_return_date, status = 'returned'
    const returnDateStr = normalizeDateStr(actual_return_date);
    await conn.query(
      `UPDATE orders 
       SET actual_return_date = ?, status = 'returned' 
       WHERE order_id = ?`,
      [returnDateStr, order_id]
    );

    // Process return quantities and restore items into inventory
    for (const item of orderItems) {
      let retQty = item.quantity;
      if (Array.isArray(returned_items)) {
        const found = returned_items.find(ri => Number(ri.item_id) === Number(item.item_id));
        if (found !== undefined) {
          const parsedQty = parseInt(found.returned_quantity, 10);
          retQty = !isNaN(parsedQty) ? Math.max(0, Math.min(item.quantity, parsedQty)) : item.quantity;
        }
      }

      // Update order_items with actual returned_quantity
      await conn.query(
        `UPDATE order_items 
         SET returned_quantity = ? 
         WHERE order_id = ? AND item_id = ?`,
        [retQty, order_id, item.item_id]
      );

      // Restore returned quantity back to inventory
      if (retQty > 0) {
        await conn.query(
          `UPDATE items 
           SET available_quantity = available_quantity + ? 
           WHERE item_id = ?`,
          [retQty, item.item_id]
        );
      }
    }

    await conn.commit();
    conn.release();

    // Fetch complete bill details
    const [createdBillRows] = await pool.query(
      `SELECT 
        b.*,
        u.full_name AS generated_by_name,
        o.start_date,
        o.expected_return_date,
        o.actual_return_date,
        o.status AS order_status,
        c.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address
       FROM bills b
       JOIN orders o ON b.order_id = o.order_id
       JOIN customers c ON o.customer_id = c.customer_id
       JOIN users u ON b.generated_by = u.user_id
       WHERE b.bill_id = ?`,
      [billId]
    );

    const [updatedOrderItems] = await pool.query(
      `SELECT oi.*, i.item_name, s.section_name
       FROM order_items oi
       JOIN items i ON oi.item_id = i.item_id
       JOIN sections s ON i.section_id = s.section_id
       WHERE oi.order_id = ?`,
      [order_id]
    );

    const [allPayments] = await pool.query(
      `SELECT p.*, u.full_name AS received_by_name
       FROM payments p
       JOIN users u ON p.received_by = u.user_id
       WHERE p.order_id = ?
       ORDER BY p.payment_date ASC`,
      [order_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Bill generated successfully and returned items checked into stock.',
      bill: {
        ...createdBillRows[0],
        items: updatedOrderItems,
        payments: allPayments
      }
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Error in generateBill:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while generating bill.'
    });
  }
};

/**
 * Get bill for a specific order_id
 * GET /api/bills/order/:order_id
 */
const getBillByOrder = async (req, res) => {
  try {
    const { order_id } = req.params;

    const query = `
      SELECT 
        b.*,
        u.full_name AS generated_by_name,
        o.start_date,
        o.expected_return_date,
        o.actual_return_date,
        o.status AS order_status,
        c.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address
      FROM bills b
      JOIN orders o ON b.order_id = o.order_id
      JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN users u ON b.generated_by = u.user_id
      WHERE b.order_id = ?
    `;

    const [bills] = await pool.query(query, [order_id]);

    if (bills.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No bill found for this order ID.'
      });
    }

    const bill = bills[0];

    // Fetch order items with snapshot pricing
    const [items] = await pool.query(
      `SELECT oi.*, i.item_name, s.section_name 
       FROM order_items oi
       JOIN items i ON oi.item_id = i.item_id
       JOIN sections s ON i.section_id = s.section_id
       WHERE oi.order_id = ?`,
      [order_id]
    );

    // Fetch payments made for this order
    const [payments] = await pool.query(
      `SELECT p.*, u.full_name AS received_by_name 
       FROM payments p
       JOIN users u ON p.received_by = u.user_id
       WHERE p.order_id = ?
       ORDER BY p.payment_date ASC`,
      [order_id]
    );

    return res.status(200).json({
      success: true,
      bill: {
        ...bill,
        items,
        payments
      }
    });
  } catch (error) {
    console.error('Error in getBillByOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching bill.'
    });
  }
};

/**
 * Record a payment (remaining or partial) and update bill payment_status
 * POST /api/bills/payment
 * Body: { order_id, amount, payment_type }
 */
const recordPayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { order_id, amount, payment_type = 'remaining' } = req.body;
    const receivedBy = req.user && req.user.user_id;

    const payAmount = Number(amount);
    if (!order_id || isNaN(payAmount) || payAmount <= 0) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'A valid order_id and positive amount are required.'
      });
    }

    await conn.beginTransaction();

    // Check if bill exists
    const [billRows] = await conn.query(
      'SELECT * FROM bills WHERE order_id = ? FOR UPDATE',
      [order_id]
    );

    if (billRows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'No bill found for this order. Generate a bill before recording settlement payments.'
      });
    }

    const bill = billRows[0];

    if (bill.payment_status === 'paid' && Number(bill.remaining_amount) <= 0) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'This bill is already fully paid.'
      });
    }

    // Insert payment record
    const validPaymentType = ['remaining', 'partial'].includes(payment_type) ? payment_type : 'remaining';
    const [paymentResult] = await conn.query(
      `INSERT INTO payments (order_id, amount, payment_type, received_by)
       VALUES (?, ?, ?, ?)`,
      [order_id, payAmount, validPaymentType, receivedBy]
    );

    // Calculate sum of all payments for this order
    const [sumRows] = await conn.query(
      'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE order_id = ?',
      [order_id]
    );

    const totalPaid = Number(sumRows[0].total_paid);
    const totalAmount = Number(bill.total_amount);
    let newRemaining = Number((totalAmount - totalPaid).toFixed(2));

    let newStatus = 'partial';
    if (newRemaining <= 0) {
      newRemaining = 0.00;
      newStatus = 'paid';
    }

    // Update bill remaining_amount and payment_status
    await conn.query(
      `UPDATE bills 
       SET remaining_amount = ?, payment_status = ? 
       WHERE bill_id = ?`,
      [newRemaining, newStatus, bill.bill_id]
    );

    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      message: 'Payment recorded successfully.',
      payment: {
        payment_id: paymentResult.insertId,
        order_id,
        amount: payAmount,
        payment_type: validPaymentType
      },
      bill_status: {
        bill_id: bill.bill_id,
        total_amount: totalAmount,
        total_paid: totalPaid,
        remaining_amount: newRemaining,
        payment_status: newStatus
      }
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Error in recordPayment:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while recording payment.'
    });
  }
};

/**
 * Get dashboard statistics
 * GET /api/bills/dashboard
 * Returns:
 * - active orders count
 * - today's returns count
 * - total revenue this month
 * - items with low stock (available < 10% of total)
 * - last 7 days revenue array for chart
 */
const getDashboardStats = async (req, res) => {
  try {
    // 1. Active orders count (status: 'active' or 'extended')
    const [activeOrdersResult] = await pool.query(
      `SELECT COUNT(*) AS active_count 
       FROM orders 
       WHERE status IN ('active', 'extended')`
    );
    const activeOrdersCount = Number(activeOrdersResult[0].active_count) || 0;

    // 2. Today's returns count
    // Orders actually returned today OR expected to return today (active/extended)
    const [todayReturnsResult] = await pool.query(
      `SELECT COUNT(*) AS today_returns 
       FROM orders 
       WHERE actual_return_date = CURDATE() 
          OR (expected_return_date = CURDATE() AND status IN ('active', 'extended'))`
    );
    const todayReturnsCount = Number(todayReturnsResult[0].today_returns) || 0;

    // 3. Total revenue this month
    const [revenueThisMonthResult] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_revenue 
       FROM payments 
       WHERE MONTH(payment_date) = MONTH(CURRENT_DATE()) 
         AND YEAR(payment_date) = YEAR(CURRENT_DATE())`
    );
    const totalRevenueThisMonth = Number(revenueThisMonthResult[0].total_revenue) || 0;

    // 4. Items with low stock (available < 10% of total)
    const [lowStockItems] = await pool.query(
      `SELECT 
        i.item_id, 
        i.item_name, 
        i.total_quantity, 
        i.available_quantity, 
        i.price_per_day,
        s.section_name 
       FROM items i
       JOIN sections s ON i.section_id = s.section_id
       WHERE i.total_quantity > 0 
         AND i.available_quantity < (i.total_quantity * 0.10)
       ORDER BY i.available_quantity ASC`
    );

    // 5. Last 7 days revenue array for chart
    const [revenueLast7DaysResult] = await pool.query(
      `SELECT 
        DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_day, 
        COALESCE(SUM(amount), 0) AS daily_revenue 
       FROM payments 
       WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE_FORMAT(payment_date, '%Y-%m-%d')
       ORDER BY payment_day ASC`
    );

    // Map DB revenue into a map for quick lookup
    const revenueMap = new Map();
    for (const row of revenueLast7DaysResult) {
      revenueMap.set(row.payment_day, Number(row.daily_revenue));
    }

    // Generate chronological array for all 7 days up to today
    const last7DaysChart = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      last7DaysChart.push({
        date: dateStr,
        revenue: revenueMap.get(dateStr) || 0.00
      });
    }

    return res.status(200).json({
      success: true,
      stats: {
        active_orders: activeOrdersCount,
        today_returns: todayReturnsCount,
        total_revenue_month: totalRevenueThisMonth,
        low_stock_items: lowStockItems,
        revenue_chart_7_days: last7DaysChart
      }
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching dashboard statistics.'
    });
  }
};

/**
 * Return missing / remaining items for an already billed order
 * POST /api/bills/return-remaining
 * Body: { order_id, items: [ { item_id, quantity_to_return } ] }
 */
const returnRemainingItems = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { order_id, items } = req.body;

    if (!order_id || !Array.isArray(items) || items.length === 0) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'order_id and a non-empty items array are required.'
      });
    }

    await conn.beginTransaction();

    // Lock order row
    const [orderRows] = await conn.query(
      'SELECT * FROM orders WHERE order_id = ? FOR UPDATE',
      [order_id]
    );

    if (orderRows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    // Fetch existing order_items
    const [orderItems] = await conn.query(
      'SELECT * FROM order_items WHERE order_id = ? FOR UPDATE',
      [order_id]
    );

    let totalReturnedNow = 0;
    const updatedItemsList = [];

    for (const reqItem of items) {
      const itemId = Number(reqItem.item_id);
      const toReturn = parseInt(reqItem.quantity_to_return, 10);

      if (!itemId || isNaN(toReturn) || toReturn <= 0) continue;

      const orderItem = orderItems.find(oi => Number(oi.item_id) === itemId);
      if (!orderItem) continue;

      const currentReturned = orderItem.returned_quantity !== null && orderItem.returned_quantity !== undefined 
        ? Number(orderItem.returned_quantity) 
        : Number(orderItem.quantity);

      const maxMissing = Math.max(0, Number(orderItem.quantity) - currentReturned);
      const actualReturn = Math.min(toReturn, maxMissing);

      if (actualReturn > 0) {
        const newReturnedTotal = currentReturned + actualReturn;

        // Update order_items
        await conn.query(
          `UPDATE order_items 
           SET returned_quantity = ? 
           WHERE order_id = ? AND item_id = ?`,
          [newReturnedTotal, order_id, itemId]
        );

        // Restore to warehouse stock
        await conn.query(
          `UPDATE items 
           SET available_quantity = available_quantity + ? 
           WHERE item_id = ?`,
          [actualReturn, itemId]
        );

        totalReturnedNow += actualReturn;
        updatedItemsList.push({
          item_id: itemId,
          returned_now: actualReturn,
          total_returned: newReturnedTotal
        });
      }
    }

    await conn.commit();
    conn.release();

    if (totalReturnedNow === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unreturned quantity remaining for the selected items.'
      });
    }

    // Fetch updated bill data
    const [bills] = await pool.query(
      `SELECT 
        b.*,
        u.full_name AS generated_by_name,
        o.start_date,
        o.expected_return_date,
        o.actual_return_date,
        o.status AS order_status,
        c.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address
      FROM bills b
      JOIN orders o ON b.order_id = o.order_id
      JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN users u ON b.generated_by = u.user_id
      WHERE b.order_id = ?`,
      [order_id]
    );

    const [itemsWithNames] = await pool.query(
      `SELECT oi.*, i.item_name, s.section_name 
       FROM order_items oi
       JOIN items i ON oi.item_id = i.item_id
       JOIN sections s ON i.section_id = s.section_id
       WHERE oi.order_id = ?`,
      [order_id]
    );

    const [payments] = await pool.query(
      `SELECT p.*, u.full_name AS received_by_name 
       FROM payments p
       JOIN users u ON p.received_by = u.user_id
       WHERE p.order_id = ?
       ORDER BY p.payment_date ASC`,
      [order_id]
    );

    return res.status(200).json({
      success: true,
      message: `Successfully returned ${totalReturnedNow} item(s) to warehouse inventory and updated bill.`,
      updated_items: updatedItemsList,
      bill: bills.length > 0 ? {
        ...bills[0],
        items: itemsWithNames,
        payments
      } : null
    });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Error in returnRemainingItems:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while processing remaining items return.'
    });
  }
};

module.exports = {
  generateBill,
  getBillByOrder,
  recordPayment,
  getDashboardStats,
  returnRemainingItems
};
