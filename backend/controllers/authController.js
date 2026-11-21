/**
 * controllers/authController.js
 * Authentication Controller
 * Warehouse & Rental Bill Management System
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Handle user login
 * POST /api/auth/login
 * Body: { username, password }
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    // Find user in database
    const [rows] = await pool.query(
      'SELECT user_id, username, password_hash, full_name, role FROM users WHERE username = ?',
      [username.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    const user = rows[0];

    // Compare bcrypt password hash
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    // Generate JWT token
    const secret = process.env.JWT_SECRET || 'rental_super_secret_key_2024';
    const expiresIn = process.env.JWT_EXPIRES_IN || '8h';

    const tokenPayload = {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    };

    const token = jwt.sign(tokenPayload, secret, { expiresIn });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login.'
    });
  }
};

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 * Protected Route
 */
const getMe = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [rows] = await pool.query(
      'SELECT user_id, username, full_name, role, created_at FROM users WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user: rows[0]
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching user profile.'
    });
  }
};

module.exports = {
  login,
  getMe
};
