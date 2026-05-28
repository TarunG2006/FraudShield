const { Op, fn, col, literal } = require('sequelize');
const { Transaction, Alert, FraudRule } = require('../models');
const { sequelize } = require('../config/database');

// ── GET /api/analytics/dashboard ─────────────────────────────────────────────
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
    ] = await Promise.all([
      Transaction.count(),
      Transaction.count({ where: { status: 'flagged' } }),
      Transaction.count({ where: { status: 'blocked' } }),
      Transaction.count({ where: { status: 'approved' } }),
      Transaction.count({ where: { is_false_positive: true } }),
      Transaction.count({ where: { risk_score: { [Op.gte]: 75 } } }),
      Transaction.count({ where: { transaction_time: { [Op.gte]: last30 } } }),
      Alert.count({ where: { is_read: false } }),
    ]);

    // Always return 11 as active rules (the actual count in fraudEngine)
    const activeRules = await FraudRule.count({ where: { is_active: true } });

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

// ── GET /api/analytics/risk-distribution ──────────────────────────────────────
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

// ── GET /api/analytics/transaction-trend ──────────────────────────────────────
const getTransactionTrend = async (req, res, next) => {
  try {
    const days  = parseInt(req.query.days) || 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

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

// ── GET /api/analytics/top-merchants ──────────────────────────────────────────
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

// ── GET /api/analytics/status-breakdown ───────────────────────────────────────
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

// ── GET /api/analytics/fraud-indicators ───────────────────────────────────────
// Returns top triggered fraud rules in the last 24h, counted from fraud_indicators JSONB array.
// Used by Dashboard "Recent Fraud Indicators" bar chart.
const getFraudIndicators = async (req, res, next) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Pull all flagged/blocked transactions in last 24h with their fraud_indicators
    const transactions = await Transaction.findAll({
      where: {
        transaction_time: { [Op.gte]: since24h },
        status: { [Op.in]: ['flagged', 'blocked', 'pending'] },
      },
      attributes: ['fraud_indicators'],
      raw: true,
    });

    // Tally rule counts
    const counts = {};
    transactions.forEach(tx => {
      let indicators = tx.fraud_indicators;
      if (!indicators) return;
      if (typeof indicators === 'string') {
        try { indicators = JSON.parse(indicators); } catch { return; }
      }
      if (!Array.isArray(indicators)) return;
      indicators.forEach(rule => {
        counts[rule] = (counts[rule] || 0) + 1;
      });
    });

    // Sort descending, take top 8
    const data = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([rule, count]) => ({
        rule:  rule.length > 30 ? rule.slice(0, 30) + '…' : rule,
        count,
      }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/analytics/fraud-by-hour ──────────────────────────────────────────
// Returns fraud transaction counts bucketed by UTC hour (0–23) for last 7 days.
// Used by Dashboard "Fraud by Hour" heatmap.
const getFraudByHour = async (req, res, next) => {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const results = await Transaction.findAll({
      attributes: [
        [literal("EXTRACT(HOUR FROM transaction_time)::int"), 'hour'],
        [fn('COUNT', col('id')), 'count'],
        [fn('AVG', col('risk_score')), 'avg_risk'],
      ],
      where: {
        transaction_time: { [Op.gte]: since7d },
        status: { [Op.in]: ['flagged', 'blocked'] },
      },
      group:  [literal("EXTRACT(HOUR FROM transaction_time)::int")],
      order:  [literal("EXTRACT(HOUR FROM transaction_time)::int ASC")],
      raw:    true,
    });

    // Build full 24-hour array, fill gaps with 0
    const hourMap = {};
    results.forEach(r => {
      hourMap[parseInt(r.hour)] = {
        count:    parseInt(r.count),
        avg_risk: parseFloat(r.avg_risk || 0).toFixed(1),
      };
    });

    const data = Array.from({ length: 24 }, (_, h) => ({
      hour:     h,
      label:    `${String(h).padStart(2, '0')}:00`,
      count:    hourMap[h]?.count    || 0,
      avg_risk: hourMap[h]?.avg_risk || '0.0',
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/analytics/top-flagged-merchants ──────────────────────────────────
// Returns top merchants by fraud count (flagged+blocked), last 30 days.
const getTopFlaggedMerchants = async (req, res, next) => {
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const results = await Transaction.findAll({
      attributes: [
        'merchant_name',
        [fn('COUNT', col('id')), 'fraud_count'],
        [fn('AVG', col('risk_score')), 'avg_risk'],
        [fn('SUM', col('amount')), 'total_amount'],
      ],
      where: {
        transaction_time: { [Op.gte]: since30d },
        status: { [Op.in]: ['flagged', 'blocked'] },
      },
      group:  ['merchant_name'],
      order:  [[literal('COUNT(id)'), 'DESC']],
      limit:  7,
      raw:    true,
    });

    const data = results.map(r => ({
      merchant:     r.merchant_name,
      fraud_count:  parseInt(r.fraud_count),
      avg_risk:     parseFloat(r.avg_risk || 0).toFixed(1),
      total_amount: parseFloat(r.total_amount || 0).toFixed(2),
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
  getFraudIndicators,
  getFraudByHour,
  getTopFlaggedMerchants,
};