// backend/src/services/mlService.js
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const ML_TIMEOUT_MS  = 5000;

/**
 * Build the 11-feature payload that matches the trained IsolationForest model.
 * Feature order must match: amount, hour_of_day, day_of_week, is_weekend,
 * is_night, is_foreign_country, transaction_count_1h, transaction_count_24h,
 * amount_vs_avg_ratio, is_new_merchant, is_high_risk_category
 */
function buildMLPayload(transaction, ruleScore = 0) {
  const amount  = parseFloat(transaction.amount) || 0;
  const txDate  = transaction.createdAt ? new Date(transaction.createdAt) : new Date();
  const hour    = txDate.getHours();
  let dow = txDate.getDay() - 1;
  if (dow === -1) dow = 6;

  const HIGH_RISK_CATS = new Set([
    'unknown', 'crypto', 'wire_transfer', 'gambling', 'pawn_shop',
  ]);
  const cat = (
    transaction.merchantCategory ||
    transaction.merchant_category ||
    ''
  ).toLowerCase();

  return {
    amount,
    hour_of_day:            hour,
    day_of_week:            dow,
    is_weekend:             (dow === 0 || dow === 6) ? 1 : 0,
    is_night:               (hour < 5 || hour >= 23) ? 1 : 0,
    is_foreign_country:     transaction.isForeignCountry ||
                            transaction.is_foreign_country || 0,
    transaction_count_1h:   transaction.transactionCount1h ??
                            transaction.transaction_count_1h ?? 1,
    transaction_count_24h:  transaction.transactionCount24h ??
                            transaction.transaction_count_24h ?? 1,
    amount_vs_avg_ratio:    parseFloat(
                              transaction.amountVsAvgRatio ||
                              transaction.amount_vs_avg_ratio
                            ) || 1.0,
    is_new_merchant:        transaction.isNewMerchant ||
                            transaction.is_new_merchant || 0,
    merchant_category:      cat,
    is_high_risk_category:  transaction.isHighRiskCategory ||
                            transaction.is_high_risk_category ||
                            (HIGH_RISK_CATS.has(cat) ? 1 : 0),
    // pass rule score as a hint for reason generation in Flask
    rule_risk_score:        ruleScore,
  };
}

/**
 * Call Flask /predict and return ml_score (0–100).
 * Falls back to ruleScore if Flask is down.
 */
async function getMLScore(transaction, ruleScore = 0) {
  try {
    const payload  = buildMLPayload(transaction, ruleScore);
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict`,
      payload,                          // flat JSON — NOT { features: payload }
      {
        timeout: ML_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const mlScore = parseFloat(response.data.ml_score);

    if (isNaN(mlScore) || mlScore < 0 || mlScore > 100) {
      console.warn('[mlService] Unexpected ml_score value, using fallback');
      return ruleScore;
    }

    return mlScore;  // already 0–100
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.warn('[mlService] Flask ML service is down — using rule score as fallback');
    } else if (error.code === 'ECONNABORTED') {
      console.warn('[mlService] ML service timed out — using rule score as fallback');
    } else {
      console.error('[mlService] Unexpected error:', error.message);
    }
    return ruleScore; // graceful fallback — rule score, not 50
  }
}

/**
 * Combine rule-based score (0–100) and ML score (0–100).
 * Weighted: 70% rule engine + 30% ML model.
 */
function combineScores(ruleScore, mlScore) {
  const combined = ruleScore * 0.7 + mlScore * 0.3;
  return Math.min(Math.round(combined), 100);
}

/**
 * Full evaluation: get ML score and combine with rule score.
 * @param {Object} transaction
 * @param {number} ruleScore  — from fraudEngine (0–100)
 * @returns {Promise<{ mlScore, finalScore }>}
 */
async function evaluateWithML(transaction, ruleScore) {
  const mlScore   = await getMLScore(transaction, ruleScore);
  const finalScore = combineScores(ruleScore, mlScore);

  console.log(`[mlService] ruleScore=${ruleScore} mlScore=${mlScore} finalScore=${finalScore}`);

  return { mlScore, finalScore };
}

module.exports = { getMLScore, combineScores, evaluateWithML, buildMLPayload };



