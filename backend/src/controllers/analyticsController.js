const { Op, fn, col, literal } = require('sequelize');
const { Transaction, Alert, FraudRule } = require('../models');
const { sequelize } = require('../config/database');

// ── GET /api/analytics/dashboard ──────────────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const now    = new Date();
    const last30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalTransactions,
      flaggedCount,
      blockedCount,
      approvedCount,
      falsePositives,
      highRiskCount,
      recentTransactions,
      unreadAlerts,
      activeRules,
    ] = await Promise.all([
      Transaction.count(),
      Transaction.count({ where: { status: 'flagged' } }),
      Transaction.count({ where: { status: 'blocked' } }),
      Transaction.count({ where: { status: 'approved' } }),
      Transaction.count({ where: { is_false_positive: true } }),
      Transaction.count({ where: { risk_score: { [Op.gte]: 75 } } }),
      Transaction.count({ where: { transaction_time: { [Op.gte]: last30 } } }),
      Alert.count({ where: { is_read: false } }),
      FraudRule.count({ where: { is_active: true } }),
    ]);

    const avgResult = await Transaction.findOne({
      attributes: [[fn('AVG', col('risk_score')), 'avg_risk']],
      raw: true,
    });
    const avgRisk = parseFloat(avgResult?.avg_risk || 0).toFixed(1);

    const fraudAmountResult = await Transaction.findOne({
      attributes: [[fn('SUM', col('amount')), 'total']],
      where: { status: { [Op.in]: ['flagged', 'blocked'] } },
      raw: true,
    });
    const fraudAmount = parseFloat(fraudAmountResult?.total || 0).toFixed(2);

    res.json({
      success: true,
      data: {
        overview: {
          totalTransactions,
          flaggedCount,
          blockedCount,
          approvedCount,
          falsePositives,
          highRiskCount,
          recentTransactions,
          unreadAlerts,
          activeRules,
          avgRisk:     parseFloat(avgRisk),
          fraudAmount: parseFloat(fraudAmount),
          fraudRate:   totalTransactions > 0
            ? parseFloat(((flaggedCount + blockedCount) / totalTransactions * 100).toFixed(2))
            : 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/analytics/risk-distribution ──────────────────────────────────
const getRiskDistribution = async (req, res, next) => {
  try {
    const [low, medium, high, critical] = await Promise.all([
      Transaction.count({ where: { risk_score: { [Op.between]: [0,  24] } } }),
      Transaction.count({ where: { risk_score: { [Op.between]: [25, 49] } } }),
      Transaction.count({ where: { risk_score: { [Op.between]: [50, 74] } } }),
      Transaction.count({ where: { risk_score: { [Op.between]: [75, 100] } } }),
    ]);

    res.json({
      success: true,
      data: [
        { name: 'Low (0-24)',     value: low,      color: '#22c55e' },
        { name: 'Medium (25-49)', value: medium,   color: '#f59e0b' },
        { name: 'High (50-74)',   value: high,     color: '#f97316' },
        { name: 'Critical (75+)', value: critical, color: '#ef4444' },
      ],
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/analytics/transaction-trend ──────────────────────────────────
const getTransactionTrend = async (req, res, next) => {
  try {
    const days  = parseInt(req.query.days) || 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // PostgreSQL: cast timestamp to date using ::date
    const results = await Transaction.findAll({
      attributes: [
        [literal("transaction_time::date"), 'date'],
        [fn('COUNT', col('id')), 'total'],
        [literal("COUNT(CASE WHEN status IN ('flagged','blocked') THEN 1 END)"), 'fraud'],
        [fn('AVG', col('risk_score')), 'avg_risk'],
      ],
      where:  { transaction_time: { [Op.gte]: since } },
      group:  [literal("transaction_time::date")],
      order:  [literal("transaction_time::date ASC")],
      raw:    true,
    });

    // Build full date range, fill gaps with zeros
    const dataMap = {};
    results.forEach(r => {
      const key = typeof r.date === 'string'
        ? r.date.split('T')[0]
        : new Date(r.date).toISOString().split('T')[0];
      dataMap[key] = r;
    });

    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d   = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      trend.push({
        date:     key,
        total:    parseInt(dataMap[key]?.total    || 0),
        fraud:    parseInt(dataMap[key]?.fraud    || 0),
        avg_risk: parseFloat(dataMap[key]?.avg_risk || 0).toFixed(1),
      });
    }

    res.json({ success: true, data: trend });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/analytics/top-merchants ──────────────────────────────────────
const getTopMerchants = async (req, res, next) => {
  try {
    const results = await Transaction.findAll({
      attributes: [
        'merchant_category',
        [fn('COUNT', col('id')), 'total'],
        [literal("COUNT(CASE WHEN status IN ('flagged','blocked') THEN 1 END)"), 'fraud'],
        [fn('AVG', col('risk_score')), 'avg_risk'],
      ],
      group:  ['merchant_category'],
      order:  [[literal('COUNT(id)'), 'DESC']],
      limit:  8,
      raw:    true,
    });

    const data = results.map(r => ({
      category: r.merchant_category,
      total:    parseInt(r.total),
      fraud:    parseInt(r.fraud),
      avg_risk: parseFloat(r.avg_risk || 0).toFixed(1),
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/analytics/status-breakdown ───────────────────────────────────
const getStatusBreakdown = async (req, res, next) => {
  try {
    const results = await Transaction.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['status'],
      raw:   true,
    });

    const colorMap = {
      pending:  '#6366f1',
      approved: '#22c55e',
      flagged:  '#f59e0b',
      blocked:  '#ef4444',
      safe:     '#14b8a6',
    };

    const data = results.map(r => ({
      name:  r.status.charAt(0).toUpperCase() + r.status.slice(1),
      value: parseInt(r.count),
      color: colorMap[r.status] || '#94a3b8',
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getRiskDistribution,
  getTransactionTrend,
  getTopMerchants,
  getStatusBreakdown,
};