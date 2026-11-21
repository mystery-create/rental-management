/**
 * middleware/auth.js
 * JWT Authentication Middleware
 * Warehouse & Rental Bill Management System
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate requests via Bearer JWT token
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  // Check if Authorization header is present
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization header provided.'
    });
  }

  // Token format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Invalid token format. Expected "Bearer <token>".'
    });
  }

  const token = parts[1];

  try {
    const secret = process.env.JWT_SECRET || 'rental_super_secret_key_2024';
    const decoded = jwt.verify(token, secret);
    
    // Attach decoded user info (user_id, username, role, etc.) to request
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please log in again.'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token. Authentication failed.'
    });
  }
};

module.exports = authenticateToken;
