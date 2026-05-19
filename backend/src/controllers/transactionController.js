const { Op } = require('sequelize');
const { Transaction, Alert, User, AuditLog } = require('../models');
const { evaluateTransaction }          = require('../services/fraudEngine');
const { evaluateWithML }               = require('../services/mlService');
const { createAlert, emitTransactionUpdate } = require('../services/alertService');
const { v4: uuidv4 }                   = require('uuid');
// ── GET /api/transactions ────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const {
      status, minRisk, maxRisk, search,
      startDate, endDate,
      page, limit, sortBy, sortDir,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where  = {};

    // Filters
    if (status)  where.status = status;

    if (minRisk !== undefined || maxRisk !== undefined) {
      where.risk_score = {};
      if (minRisk !== undefined) where.risk_score[Op.gte] = parseFloat(minRisk);
      if (maxRisk !== undefined) where.risk_score[Op.lte] = parseFloat(maxRisk);
    }

    if (search) {
      where[Op.or] = [
        { merchant_name:    { [Op.iLike]: `%${search}%` } },
        { cardholder_name:  { [Op.iLike]: `%${search}%` } },
        { card_last_four:   { [Op.iLike]: `%${search}%` } },
        { transaction_id:   { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (startDate || endDate) {
      where.transaction_time = {};
      if (startDate) where.transaction_time[Op.gte] = new Date(startDate);
      if (endDate)   where.transaction_time[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      order:  [[sortBy || 'transaction_time', sortDir || 'DESC']],
      limit:  parseInt(limit),
      offset,
      include: [{
        model:      Alert,
        as:         'alerts',
        attributes: ['id', 'severity', 'alert_type', 'is_read'],
        required:   false,
      }],
    });

    res.json({
      success: true,
      data: {
        transactions: rows,
        pagination: {
          total:       count,
          page:        parseInt(page),
          limit:       parseInt(limit),
          totalPages:  Math.ceil(count / parseInt(limit)),
          hasNext:     parseInt(page) < Math.ceil(count / parseInt(limit)),
          hasPrev:     parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/transactions/:id ────────────────────────────────────────
const getById = async (req, res, next) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id, {
      include: [{
        model: Alert,
        as:    'alerts',
        order: [['created_at', 'DESC']],
      }],
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
};

// ── PATCH /api/transactions/:id/mark-safe ────────────────────────────
const markSafe = async (req, res, next) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found.' });
    }

    if (!['flagged', 'blocked'].includes(transaction.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only flagged or blocked transactions can be marked as safe.',
      });
    }

    const oldValues = {
      status:           transaction.status,
      is_false_positive: transaction.is_false_positive,
    };

    await transaction.update({
      status:            'safe',
      is_false_positive: true,
      marked_safe_by:    req.user.id,
      marked_safe_at:    new Date(),
    });

    // Audit log
    await AuditLog.create({
      user_id:     req.user.id,
      action:      'MARK_SAFE',
      entity_type: 'transaction',
      entity_id:   transaction.id,
      old_values:  oldValues,
      new_values:  { status: 'safe', is_false_positive: true },
      ip_address:  req.ip,
      user_agent:  req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Transaction marked as safe (false positive recorded).',
      data:    transaction,
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/transactions/stats ──────────────────────────────────────
const getQuickStats = async (req, res, next) => {
  try {
    const [total, flagged, blocked, safe, highRisk] = await Promise.all([
      Transaction.count(),
      Transaction.count({ where: { status: 'flagged' } }),
      Transaction.count({ where: { status: 'blocked' } }),
      Transaction.count({ where: { status: 'safe', is_false_positive: true } }),
      Transaction.count({ where: { risk_score: { [Op.gte]: 75 } } }),
    ]);

    res.json({
      success: true,
      data: { total, flagged, blocked, falsePositives: safe, highRisk },
    });
  } catch (error) {
    next(error);
  }
};
// ── POST /api/transactions ──────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const {
      amount, currency = 'USD',
      merchant_name, merchant_category,
      card_last_four, cardholder_name,
      location_country, location_city,
      ip_address, device_fingerprint,
    } = req.body;

    if (!amount || !merchant_name || !card_last_four || !cardholder_name) {
      return res.status(400).json({
        success: false,
        message: 'amount, merchant_name, card_last_four, and cardholder_name are required.',
      });
    }

    // Scoring payload — shape matches fraudEngine + mlService expectations
    const txnPayload = {
      amount,
      merchant_name,
      merchantName:     merchant_name,
      merchant_category,
      merchantCategory: merchant_category,
      location:         location_country,
      country:          location_country,
      createdAt:        new Date(),
    };

    // 1. Rule-based score
    const { riskScore: ruleScore, riskLevel, triggeredRules, recommendation } =
      await evaluateTransaction(txnPayload, []);

    // 2. ML score + combined final score
    const { mlScore, finalScore } = await evaluateWithML(txnPayload, ruleScore);

    // 3. Status from final score
    let status = 'approved';
    if (finalScore >= 85)      status = 'blocked';
    else if (finalScore >= 70) status = 'flagged';
    else if (finalScore >= 40) status = 'pending';

    // 4. Persist
    const transaction = await Transaction.create({
      transaction_id:    uuidv4(),
      amount,
      currency,
      merchant_name,
      merchant_category,
      card_last_four,
      cardholder_name,
      location_country,
      location_city,
      ip_address:        ip_address || req.ip,
      device_fingerprint,
      risk_score:        finalScore,
      ml_score:          mlScore,
      rule_score:        ruleScore,
      status,
      fraud_indicators:  triggeredRules,
      transaction_time:  new Date(),
    });

    // 5. Alert if high risk
    await createAlert(transaction, finalScore, triggeredRules, recommendation);

    // 6. Broadcast transaction update
    emitTransactionUpdate(transaction, finalScore, riskLevel);

    res.status(201).json({
      success: true,
      message: 'Transaction processed.',
      data: {
        ...transaction.toJSON(),
        riskLevel,
        triggeredRules,
        recommendation,
        mlScore,
        finalScore,
      },
    });
  } catch (error) {
    next(error);
  }
};
module.exports = { getAll, getById, markSafe, getQuickStats, create };
