/**
 * utils/billingHelper.js
 * Rental Billing Calculations Helper
 * Warehouse & Rental Bill Management System
 */

/**
 * Normalizes date input to a 'YYYY-MM-DD' formatted string
 * @param {string|Date} dateInput
 * @returns {string} 'YYYY-MM-DD'
 */
function normalizeDateStr(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    return dateInput.substring(0, 10);
  }
  if (dateInput instanceof Date) {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(dateInput).substring(0, 10);
}

/**
 * Calculates bill for an order based on rental duration, items, and return timing
 * 
 * Rules:
 * - Calculates total_days = diff between start_date and actualReturnDate
 * - If returnTime is after '09:00', add 1 extra day
 * - If total_days is 0 (same day return before 9am), minimum 1 day is applied
 * - Calculates subtotal = sum of (quantity * price_per_day_snapshot * total_days) for each order_item
 * - penalty_amount = 100 if actualReturnDate > expected_return_date, else 0
 * - total_amount = subtotal + penalty_amount
 * - remaining_amount = total_amount - order.advance_amount
 * 
 * @param {Object} order - Order object containing start_date, expected_return_date, advance_amount
 * @param {Array} orderItems - Array of order items with quantity and price_per_day_snapshot
 * @param {string|Date} actualReturnDate - Date order was actually returned
 * @param {string} returnTime - Time of return in 'HH:mm' or 'HH:mm:ss' format
 * @returns {Object} { total_days, subtotal, penalty_amount, total_amount, remaining_amount }
 */
function calculateBill(order, orderItems = [], actualReturnDate, returnTime = '09:00') {
  const startStr = normalizeDateStr(order.start_date);
  const actualStr = normalizeDateStr(actualReturnDate);
  const expectedStr = normalizeDateStr(order.expected_return_date);

  // Calculate day difference between start_date and actualReturnDate
  const startDate = new Date(startStr + 'T00:00:00Z');
  const returnDate = new Date(actualStr + 'T00:00:00Z');

  const diffMs = returnDate.getTime() - startDate.getTime();
  let total_days = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  // If returnTime is after '09:00', add 1 extra day
  if (returnTime) {
    const [hStr, mStr] = returnTime.trim().split(':');
    const hours = parseInt(hStr, 10) || 0;
    const minutes = parseInt(mStr, 10) || 0;
    const returnMinutes = hours * 60 + minutes;
    const cutoffMinutes = 9 * 60; // 09:00 = 540 mins

    if (returnMinutes > cutoffMinutes) {
      total_days += 1;
    }
  }

  // Ensure at least 1 day rental period
  if (total_days === 0) {
    total_days = 1;
  }

  // Calculate subtotal from order items
  let subtotal = 0;
  for (const item of orderItems) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price_per_day_snapshot) || 0;
    subtotal += qty * price * total_days;
  }
  subtotal = Number(subtotal.toFixed(2));

  // penalty_amount = 100 if actualReturnDate > expected_return_date, else 0
  let penalty_amount = 0;
  if (actualStr > expectedStr) {
    penalty_amount = 100.00;
  }

  // Total amount = subtotal + penalty_amount
  const total_amount = Number((subtotal + penalty_amount).toFixed(2));

  // remaining_amount = total_amount - order.advance_amount
  const advance_amount = Number(order.advance_amount || 0);
  const remaining_amount = Number((total_amount - advance_amount).toFixed(2));

  return {
    total_days,
    subtotal,
    penalty_amount,
    total_amount,
    remaining_amount
  };
}

module.exports = {
  calculateBill,
  normalizeDateStr
};
