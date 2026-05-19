const express  = require('express');
const router   = express.Router();
const { getAll, getById, markSafe, getQuickStats, create } = require('../controllers/transactionController');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// All transaction routes require authentication
router.use(authenticate);

// GET  /api/transactions/stats — quick header stats
router.get('/stats', getQuickStats);

// GET  /api/transactions — list with filters
router.get('/', validate(schemas.transactionQuery, 'query'), getAll);

// GET  /api/transactions/:id — single transaction
router.get('/:id', getById);
// POST /api/transactions — submit and score a new transaction
router.post('/', create);
// PATCH /api/transactions/:id/mark-safe — analysts and admins only
router.patch('/:id/mark-safe', requireRole('admin', 'analyst'), markSafe);

module.exports = router;
