const { FraudRule, AuditLog } = require('../models');

// ── GET /api/rules ───────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const rules = await FraudRule.findAll({
      order: [['created_at', 'ASC']],
    });
    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/rules/:id ───────────────────────────────────────────────
const getById = async (req, res, next) => {
  try {
    const rule = await FraudRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found.' });
    }
    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/rules ──────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const { name, description, rule_type, conditions, score_weight, is_active } = req.body;

    const rule = await FraudRule.create({
      name,
      description,
      rule_type,
      conditions,
      score_weight,
      is_active: is_active !== undefined ? is_active : true,
      created_by: req.user.id,
    });

    await AuditLog.create({
      user_id:     req.user.id,
      action:      'CREATE_RULE',
      entity_type: 'fraud_rule',
      entity_id:   rule.id,
      new_values:  { name, rule_type, score_weight },
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
    });

    res.status(201).json({ success: true, message: 'Fraud rule created.', data: rule });
  } catch (error) {
    next(error);
  }
};

// ── PUT /api/rules/:id ───────────────────────────────────────────────
const update = async (req, res, next) => {
  try {
    const rule = await FraudRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found.' });
    }

    const oldValues = rule.toJSON();
    const { name, description, conditions, score_weight, is_active } = req.body;

    await rule.update({ name, description, conditions, score_weight, is_active });

    await AuditLog.create({
      user_id:     req.user.id,
      action:      'UPDATE_RULE',
      entity_type: 'fraud_rule',
      entity_id:   rule.id,
      old_values:  oldValues,
      new_values:  req.body,
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
    });

    res.json({ success: true, message: 'Rule updated.', data: rule });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/rules/:id/toggle ──────────────────────────────────────
const toggle = async (req, res, next) => {
  try {
    const rule = await FraudRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found.' });
    }

    await rule.update({ is_active: !rule.is_active });

    await AuditLog.create({
      user_id:     req.user.id,
      action: rule.is_active ? 'ENABLE_RULE' : 'DISABLE_RULE',
      entity_type: 'fraud_rule',
      entity_id:   rule.id,
      new_values:  { is_active: rule.is_active },
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: `Rule ${rule.is_active ? 'enabled' : 'disabled'}.`,
      data:    rule,
    });
  } catch (error) {
    next(error);
  }
};

// ── DELETE /api/rules/:id ────────────────────────────────────────────
const remove = async (req, res, next) => {
  try {
    const rule = await FraudRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found.' });
    }

    const snapshot = rule.toJSON();
    await rule.destroy();

    await AuditLog.create({
      user_id:     req.user.id,
      action:      'DELETE_RULE',
      entity_type: 'fraud_rule',
      entity_id:   snapshot.id,
      old_values:  snapshot,
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
    });

    res.json({ success: true, message: 'Rule deleted.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, create, update, toggle, remove };

