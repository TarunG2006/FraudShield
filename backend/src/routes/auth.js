const express    = require('express');
const router     = express.Router();
const { login, getMe, logout, changePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');

// POST /api/auth/login  — public, rate-limited
router.post('/login', authLimiter, validate(schemas.login), login);

// GET  /api/auth/me     — protected
router.get('/me', authenticate, getMe);

// POST /api/auth/logout — protected
router.post('/logout', authenticate, logout);

// POST /api/auth/change-password — protected
router.post('/change-password', authenticate, changePassword);

module.exports = router;