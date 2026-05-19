const { Op } = require('sequelize');
const { Alert, Transaction, User, AuditLog } = require('../models');

// ── GET /api/alerts ──────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const { severity, is_read, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where  = {};

    if (severity)             where.severity = severity;
    if (is_read !== undefined) where.is_read = is_read === 'true';

    const { count, rows } = await Alert.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
      include: [{
        model:      Transaction,
        as:         'transaction',
        attributes: ['id', 'transaction_id', 'amount', 'currency', 'merchant_name',
                     'cardholder_name', 'risk_score', 'status'],
        required:   false,
      }],
    });

    // Unread count for badge
    const unreadCount = await Alert.count({ where: { is_read: false } });

    res.json({
      success: true,
      data: {
        alerts: rows,
        unreadCount,
        pagination: {
          total:      count,
          page:       parseInt(page),
          limit:      parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/alerts/:id/read ───────────────────────────────────────
const markRead = async (req, res, next) => {
  try {
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    await alert.update({ is_read: true });
    res.json({ success: true, message: 'Alert marked as read.', data: alert });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/alerts/read-all ───────────────────────────────────────
const markAllRead = async (req, res, next) => {
  try {
    const [count] = await Alert.update(
      { is_read: true },
      { where: { is_read: false } }
    );

    res.json({ success: true, message: `${count} alerts marked as read.` });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/alerts/:id/resolve ────────────────────────────────────
const resolve = async (req, res, next) => {
  try {
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    if (alert.resolved_at) {
      return res.status(400).json({ success: false, message: 'Alert is already resolved.' });
    }

    await alert.update({
      resolved_by: req.user.id,
      resolved_at: new Date(),
      is_read:     true,
    });

    await AuditLog.create({
      user_id:     req.user.id,
      action:      'RESOLVE_ALERT',
      entity_type: 'alert',
      entity_id:   alert.id,
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
    });

    res.json({ success: true, message: 'Alert resolved.', data: alert });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/alerts/unread-count ─────────────────────────────────────
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Alert.count({ where: { is_read: false } });
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, markRead, markAllRead, resolve, getUnreadCount };
