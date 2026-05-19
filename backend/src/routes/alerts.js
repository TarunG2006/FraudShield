const express  = require('express');
const router   = express.Router();
const { getAll, markRead, markAllRead, resolve, getUnreadCount } = require('../controllers/alertController');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);

// GET  /api/alerts/unread-count
router.get('/unread-count', getUnreadCount);

// PATCH /api/alerts/read-all
router.patch('/read-all', markAllRead);

// GET  /api/alerts
router.get('/', validate(schemas.alertQuery, 'query'), getAll);

// PATCH /api/alerts/:id/read
router.patch('/:id/read', markRead);

// PATCH /api/alerts/:id/resolve — analysts and admins only
router.patch('/:id/resolve', requireRole('admin', 'analyst'), resolve);

module.exports = router;
