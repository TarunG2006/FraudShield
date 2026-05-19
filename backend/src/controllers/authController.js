const jwt      = require('jsonwebtoken');
const { User, AuditLog } = require('../models');
const { createError } = require('../middleware/errorHandler');

// ── Generate JWT ─────────────────────────────────────────────────────
const signToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// ── POST /api/auth/login ─────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is disabled. Contact your administrator.' });
    }

    // Check password
    const isValid = await user.validatePassword(password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Update last login
    await user.update({ last_login: new Date() });

    // Create audit log
    await AuditLog.create({
      user_id:     user.id,
      action:      'LOGIN',
      entity_type: 'user',
      entity_id:   user.id,
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
      new_values:  { timestamp: new Date().toISOString() },
    });

    // Generate token
    const token = signToken(user);

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          id:         user.id,
          email:      user.email,
          name:       user.name,
          role:       user.role,
          last_login: user.last_login,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/auth/me ─────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        id:         req.user.id,
        email:      req.user.email,
        name:       req.user.name,
        role:       req.user.role,
        is_active:  req.user.is_active,
        last_login: req.user.last_login,
        created_at: req.user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/logout ────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    // JWT is stateless — client discards token
    // Log the action
    if (req.user) {
      await AuditLog.create({
        user_id:     req.user.id,
        action:      'LOGOUT',
        entity_type: 'user',
        entity_id:   req.user.id,
        ip_address:  req.ip,
        user_agent:  req.get('User-Agent'),
      });
    }

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/change-password ───────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findByPk(req.user.id);

    const isValid = await user.validatePassword(currentPassword);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    // The beforeUpdate hook in User model will auto-hash
    user.password_hash = newPassword;
    await user.save();

    await AuditLog.create({
      user_id:     req.user.id,
      action:      'CHANGE_PASSWORD',
      entity_type: 'user',
      entity_id:   req.user.id,
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { login, getMe, logout, changePassword };