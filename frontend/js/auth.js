/**
 * js/auth.js
 * Authentication & Session Management
 * Warehouse & Rental Bill Management System
 */

/**
 * Check if the user is authenticated.
 * If rental_token is absent, redirects to index.html immediately.
 */
function checkAuth() {
  const token = localStorage.getItem('rental_token');
  const isLoginPage = window.location.pathname.endsWith('index.html') || 
                      window.location.pathname.endsWith('/');

  if (!token && !isLoginPage) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

/**
 * Log out user by clearing storage and redirecting to index.html
 */
function logout() {
  localStorage.removeItem('rental_token');
  localStorage.removeItem('rental_user');
  window.location.href = 'index.html';
}

/**
 * Return headers object with Bearer authorization and JSON content-type
 * @returns {object}
 */
function getAuthHeaders() {
  const token = localStorage.getItem('rental_token');
  return {
    'Authorization': 'Bearer ' + (token || ''),
    'Content-Type': 'application/json'
  };
}

/**
 * Get cached user object from localStorage
 * @returns {object|null}
 */
function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('rental_user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    console.error('Failed to parse user from localStorage', e);
    return null;
  }
}

/**
 * Load logged in user details and inject full_name into navbar user display
 */
function loadUserInfo() {
  const user = getCurrentUser();
  const userNameEl = document.getElementById('nav-user-name');
  const userRoleEl = document.getElementById('nav-user-role');

  if (user) {
    if (userNameEl) userNameEl.textContent = user.full_name || user.username || 'User';
    if (userRoleEl) userRoleEl.textContent = (user.role || 'Staff').toUpperCase();
  } else {
    if (userNameEl) userNameEl.textContent = 'Staff User';
  }
}

/**
 * Setup mobile sidebar toggle behavior and responsive backdrop
 */
function setupSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.querySelector('.sidebar');
  
  if (toggleBtn && sidebar) {
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
      backdrop.classList.toggle('show');
    });

    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('show');
      backdrop.classList.remove('show');
    });
  }
}

// Auto-run on non-login pages
document.addEventListener('DOMContentLoaded', () => {
  const isLoginPage = window.location.pathname.endsWith('index.html') || 
                      window.location.pathname.endsWith('/');

  if (!isLoginPage) {
    if (checkAuth()) {
      loadUserInfo();
      setupSidebarToggle();
    }
  } else {
    // If on login page and already logged in, redirect to dashboard
    const token = localStorage.getItem('rental_token');
    if (token) {
      window.location.href = 'dashboard.html';
    }
  }
});
