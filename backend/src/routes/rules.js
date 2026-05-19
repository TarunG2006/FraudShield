const express  = require('express');
const router   = express.Router();
const { getAll, getById, create, update, toggle, remove } = require('../controllers/ruleController');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

router.use(authenticate);

// GET  /api/rules — all roles
router.get('/',    getAll);
router.get('/:id', getById);

// Mutations — admin only
router.post('/',          requireRole('admin'), validate(schemas.createRule), create);
router.put('/:id',        requireRole('admin'), validate(schemas.updateRule), update);
router.patch('/:id/toggle', requireRole('admin'), toggle);
router.delete('/:id',     requireRole('admin'), remove);

module.exports = router;