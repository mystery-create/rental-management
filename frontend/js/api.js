/**
 * js/api.js
 * Centralized API Helper and Utilities
 * Warehouse & Rental Bill Management System
 */

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api';

/**
 * Execute standard fetch request with authorization and error handling
 * @param {string} endpoint - e.g. '/orders'
 * @param {object} options - fetch options (method, body, etc.)
 */
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('rental_token');
  const url = `${API}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Handle token expiration or unauthenticated request
    if (response.status === 401) {
      console.warn('Session expired or unauthorized. Redirecting to login.');
      localStorage.removeItem('rental_token');
      localStorage.removeItem('rental_user');
      if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
        window.location.href = 'index.html';
      }
      throw new Error('Session expired. Please log in again.');
    }

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { message: await response.text() };
    }

    if (!response.ok) {
      const errorMessage = data && data.message ? data.message : `HTTP Error ${response.status}`;
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    console.error(`API Error on [${options.method || 'GET'} ${endpoint}]:`, error.message);
    throw error;
  }
}

/**
 * Convenience API wrapper methods
 */
async function apiGet(endpoint) {
  return apiRequest(endpoint, { method: 'GET' });
}

async function apiPost(endpoint, data = {}) {
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function apiPut(endpoint, data = {}) {
  return apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

async function apiPatch(endpoint, data = {}) {
  return apiRequest(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

async function apiDelete(endpoint) {
  return apiRequest(endpoint, { method: 'DELETE' });
}

/**
 * Toast Notification System using Bootstrap 5 Toast
 * @param {string} message - Notification text
 * @param {'success'|'danger'|'warning'|'info'} type - Toast type
 */
function showToast(message, type = 'info') {
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }

  const toastId = 'toast_' + Date.now();
  const bgClass = {
    success: 'bg-success text-white',
    danger: 'bg-danger text-white',
    warning: 'bg-warning text-dark',
    info: 'bg-primary text-white'
  }[type] || 'bg-secondary text-white';

  const iconClass = {
    success: 'bi-check-circle-fill',
    danger: 'bi-exclamation-triangle-fill',
    warning: 'bi-exclamation-circle-fill',
    info: 'bi-info-circle-fill'
  }[type] || 'bi-bell-fill';

  const toastHtml = `
    <div id="${toastId}" class="toast custom-toast align-items-center ${bgClass} border-0 shadow" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi ${iconClass} fs-5"></i>
          <span>${message}</span>
        </div>
        <button type="button" class="btn-close ${type === 'warning' ? '' : 'btn-close-white'} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;

  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  const toastEl = document.getElementById(toastId);
  const bsToast = new bootstrap.Toast(toastEl, { delay: 4000 });
  bsToast.show();

  toastEl.addEventListener('hidden.bs.toast', () => {
    toastEl.remove();
  });
}

/**
 * Format currency to Indian Rupees (₹)
 * @param {number|string} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format date string (YYYY-MM-DD) to friendly format (DD MMM YYYY)
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const str = String(dateStr).substring(0, 10);
  const parts = str.split('-');
  if (parts.length === 3) {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
  return str;
}

/**
 * Format ISO Timestamp or date to readable date + time
 * @param {string} timestamp
 * @returns {string}
 */
function formatDateTime(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Generate standard HTML badge for order/bill status
 * @param {string} status
 * @returns {string} HTML span element
 */
function getStatusBadge(status) {
  if (!status) return '<span class="badge bg-secondary">-</span>';
  const s = status.toLowerCase();
  
  if (s === 'active') {
    return `<span class="badge-status status-active"><i class="bi bi-play-circle-fill"></i> Active</span>`;
  } else if (s === 'extended') {
    return `<span class="badge-status status-extended"><i class="bi bi-clock-history"></i> Extended</span>`;
  } else if (s === 'returned') {
    return `<span class="badge-status status-returned"><i class="bi bi-check2-circle"></i> Returned</span>`;
  } else if (s === 'cancelled') {
    return `<span class="badge-status status-cancelled"><i class="bi bi-x-circle-fill"></i> Cancelled</span>`;
  } else if (s === 'paid') {
    return `<span class="badge-status status-paid"><i class="bi bi-check-all"></i> Paid</span>`;
  } else if (s === 'partial') {
    return `<span class="badge-status status-partial"><i class="bi bi-hourglass-split"></i> Partial</span>`;
  } else if (s === 'pending') {
    return `<span class="badge-status status-pending"><i class="bi bi-exclamation-circle-fill"></i> Pending</span>`;
  }
  return `<span class="badge bg-secondary">${status}</span>`;
}

/**
 * Robust invoice printing helper that eliminates blank PDF/print pages.
 * Isolates the bill HTML into a dedicated iframe for 100% reliable printing.
 * @param {string} elementId - ID of the container element with the bill
 */
function printInvoiceElement(elementId) {
  const sourceEl = document.getElementById(elementId);
  if (!sourceEl || !sourceEl.innerHTML.trim()) {
    window.print();
    return;
  }

  // Remove any existing print iframe
  const existingFrame = document.getElementById('rental-print-frame');
  if (existingFrame) {
    existingFrame.remove();
  }

  // Create clean isolated iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'rental-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Rental Bill & Invoice</title>
      <link rel="stylesheet" href="libs/bootstrap/css/bootstrap.min.css">
      <link rel="stylesheet" href="libs/bootstrap-icons/bootstrap-icons.min.css">
      <link rel="stylesheet" href="css/style.css">
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          background: #ffffff !important;
          color: #1a1a2e !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
        }
        .bill-container {
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          width: 100% !important;
        }
        .bill-header {
          border-bottom: 2px solid #0f3460 !important;
          padding-bottom: 12px !important;
          margin-bottom: 16px !important;
        }
        .bill-company-name {
          font-size: 1.5rem !important;
          font-weight: 800 !important;
          color: #0f3460 !important;
        }
        .bill-meta-box {
          background-color: #f8fafc !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 6px !important;
          padding: 10px !important;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        th, td {
          padding: 6px 8px !important;
        }
        .no-print, .btn {
          display: none !important;
        }
      </style>
    </head>
    <body>
      ${sourceEl.innerHTML}
    </body>
    </html>
  `);
  doc.close();

  // Allow styles to evaluate then trigger native print
  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (err) {
      console.warn('Iframe print failed, falling back to window.print()', err);
      window.print();
    }
  }, 400);
}
