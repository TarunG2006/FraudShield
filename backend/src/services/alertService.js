// backend/src/services/alertService.js
const { Alert, Transaction } = require('../models');

const ALERT_THRESHOLD    = 40;
const CRITICAL_THRESHOLD = 85;

function getSeverity(score) {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function determineAlertType(triggeredRules = [], finalScore = 0) {
  const text = triggeredRules.join(' ').toLowerCase();
  if (text.includes('velocity'))                              return 'velocity';
  if (text.includes('location') || text.includes('foreign')) return 'geo_anomaly';
  if (text.includes('amount'))                               return 'amount_spike';
  if (finalScore >= 70 && triggeredRules.length === 0)       return 'ml_anomaly';
  return 'rule_trigger';
}

function formatAlertMessage(transaction, riskScore, triggeredRules) {
  const amount   = parseFloat(transaction.amount).toFixed(2);
  const merchant = transaction.merchantName || transaction.merchant_name || 'Unknown Merchant';
  const rules    = triggeredRules.length > 0
    ? `Triggered rules: ${triggeredRules.join('; ')}.`
    : 'Anomaly detected by ML model.';
  return `Suspicious transaction of $${amount} at "${merchant}" flagged with risk score ${riskScore}/100. ${rules}`;
}

async function createAlert(transaction, finalScore, triggeredRules = [], recommendation = '') {
  if (finalScore < ALERT_THRESHOLD) return null;

  const severity  = getSeverity(finalScore);
  const alertType = determineAlertType(triggeredRules, finalScore);
  const message   = formatAlertMessage(transaction, finalScore, triggeredRules);

  let alert;
  try {
    alert = await Alert.create({
      transaction_id: transaction.id || transaction.transactionId,
      alert_type:     alertType,       // ← required field, was missing before
      severity,
      message,
      details: {                       // ← all extra data goes in JSONB details
        riskScore:      finalScore,
        triggeredRules,
        recommendation,
      },
      is_read: false,
    });
  } catch (error) {
    console.error('[alertService] Failed to create alert in DB:', error.message);
    throw error;
  }

  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) {
      io.emit('new_alert', {
        alertId:       alert.id,
        transactionId: transaction.id || transaction.transactionId,
        severity,
        riskScore:     finalScore,      // use the param directly, not alert.riskScore
        message,
        triggeredRules,
        recommendation,
        amount:        transaction.amount,
        merchantName:  transaction.merchantName || transaction.merchant_name,
        timestamp:     alert.created_at,
      });
      console.log(`[alertService] Emitted new_alert — severity: ${severity}, score: ${finalScore}`);
    }
  } catch (socketError) {
    console.warn('[alertService] Could not emit socket event:', socketError.message);
  }

  return alert;
}

function emitTransactionUpdate(transaction, riskScore, riskLevel) {
  try {
    const { getIO } = require('../socket');
    const io = getIO();
    if (io) {
      io.emit('transaction_update', {
        transactionId: transaction.id,
        amount:        transaction.amount,
        merchantName:  transaction.merchantName || transaction.merchant_name,
        riskScore,
        riskLevel,
        status:        transaction.status,
        timestamp:     transaction.created_at || new Date(),
      });
    }
  } catch (error) {
    console.warn('[alertService] Could not emit transaction_update:', error.message);
  }
}

async function getOpenAlerts(limit = 50) {
  try {
    return await Alert.findAll({
      where:   { is_read: false },     // ← was { status: 'open' } which doesn't exist in model
      order:   [['created_at', 'DESC']],
      limit,
      include: [{
        model:      Transaction,
        as:         'transaction',
        attributes: ['amount', 'merchant_name', 'location_city'],
      }],
    });
  } catch (error) {
    console.error('[alertService] Failed to fetch open alerts:', error.message);
    return [];
  }
}

module.exports = { createAlert, emitTransactionUpdate, getOpenAlerts, getSeverity };
