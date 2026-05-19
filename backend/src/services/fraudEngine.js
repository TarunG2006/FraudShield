// backend/src/services/fraudEngine.js
 
const RULES = {
  HIGH_AMOUNT: { points: 30, label: 'High transaction amount (>$10,000)' },
  VELOCITY: { points: 25, label: 'High velocity (>5 transactions in 1 hour)' },
  BLACKLISTED_MERCHANT: { points: 35, label: 'Blacklisted merchant' },
  UNUSUAL_LOCATION: { points: 20, label: 'Unusual transaction location' },
  ODD_HOURS: { points: 15, label: 'Transaction during odd hours (1AM–5AM)' },
  ROUND_AMOUNT: { points: 10, label: "Suspiciously round amount" },
  HIGH_RISK_CATEGORY: { points: 30, label: "High-risk merchant category (crypto/gambling)" },
};
 
// Merchants flagged as high-risk or blacklisted
const BLACKLISTED_MERCHANTS = [
  'dark_market',
  'shadow_pay',
  'anon_transfer',
  'crypto_exchange_unverified',
  'offshore_casino',
];
 
// Known trusted locations (country codes or city names)
const TRUSTED_LOCATIONS = [
  'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'SG', 'IN',
];
 
/**
 * Check if transaction amount is unusually high
 */
function checkHighAmount(transaction) {
  const amount = parseFloat(transaction.amount);
  return amount > 5000;
}
 
/**
 * Check if velocity exceeds 5 transactions in the past hour
 * recentTransactions: array of recent transactions for this user/card
 */
function checkVelocity(recentTransactions) {
  if (!Array.isArray(recentTransactions)) return false;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = recentTransactions.filter(tx => {
    const txTime = new Date(tx.createdAt || tx.timestamp);
    return txTime >= oneHourAgo;
  }).length;
  return recentCount > 5;
}
 
/**
 * Check if merchant is blacklisted
 */
function checkBlacklistedMerchant(transaction) {
  if (!transaction.merchantName && !transaction.merchant_name) return false;
  const merchant = (transaction.merchantName || transaction.merchant_name || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  return BLACKLISTED_MERCHANTS.some(bm => merchant.includes(bm));
}
 
/**
 * Check if transaction location is unusual
 */
function checkUnusualLocation(transaction) {
  if (!transaction.location && !transaction.country) return false;
  const location = (transaction.location || transaction.country || '').toUpperCase();
  // Flag if location is not in trusted list
  return !TRUSTED_LOCATIONS.some(loc => location.includes(loc));
}
 
/**
 * Check if transaction occurred during odd hours (1AM–5AM local time)
 */
function checkOddHours(transaction) {
  const txDate = transaction.createdAt
    ? new Date(transaction.createdAt)
    : new Date();
  const hour = txDate.getHours();
  return hour >= 1 && hour < 5;
}
 
/**
 * Check if transaction amount is suspiciously round
 * e.g., exactly 1000, 5000, 10000
 */
function checkRoundAmount(transaction) {
  const amount = parseFloat(transaction.amount);
  if (amount < 100) return false;
  // Round if divisible by 1000, or ends in 00 with no cents
  return amount % 1000 === 0 || (amount % 100 === 0 && amount >= 500);
}
 

function checkHighRiskCategory(transaction) {
  const category = (transaction.merchant_category || transaction.merchantCategory || '').toLowerCase();
  return ['crypto', 'gambling', 'gaming', 'adult', 'forex'].includes(category);
}
/**
 * Determine risk level from score
 */
function getRiskLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
 
/**
 * Determine recommendation from risk level
 */
function getRecommendation(riskLevel, triggeredRules) {
  switch (riskLevel) {
    case 'high':
      return 'Block transaction and trigger immediate review. Multiple fraud indicators detected.';
    case 'medium':
      return 'Flag for analyst review. Request additional verification from customer.';
    default:
      return triggeredRules.length > 0
        ? 'Monitor account activity. Minor risk indicators present.'
        : 'Transaction appears normal. No action required.';
  }
}
 
/**
 * Main fraud scoring function
 * @param {Object} transaction - Transaction object
 * @param {Array} recentTransactions - Recent transactions for velocity check
 * @returns {{ riskScore, riskLevel, triggeredRules, recommendation }}
 */
async function evaluateTransaction(transaction, recentTransactions = []) {
  const triggeredRules = [];
  let totalPoints = 0;
 
  // Run all rule checks
  if (checkHighAmount(transaction)) {
    triggeredRules.push(RULES.HIGH_AMOUNT.label);
    totalPoints += RULES.HIGH_AMOUNT.points;
  }
 
  if (checkVelocity(recentTransactions)) {
    triggeredRules.push(RULES.VELOCITY.label);
    totalPoints += RULES.VELOCITY.points;
  }
 
  if (checkBlacklistedMerchant(transaction)) {
    triggeredRules.push(RULES.BLACKLISTED_MERCHANT.label);
    totalPoints += RULES.BLACKLISTED_MERCHANT.points;
  }
 
  if (checkUnusualLocation(transaction)) {
    triggeredRules.push(RULES.UNUSUAL_LOCATION.label);
    totalPoints += RULES.UNUSUAL_LOCATION.points;
  }
 
  if (checkOddHours(transaction)) {
    triggeredRules.push(RULES.ODD_HOURS.label);
    totalPoints += RULES.ODD_HOURS.points;
  }
 
  if (checkHighRiskCategory(transaction)) {
    triggeredRules.push(RULES.HIGH_RISK_CATEGORY.label);
    totalPoints += RULES.HIGH_RISK_CATEGORY.points;
  }

  if (checkRoundAmount(transaction)) {
    triggeredRules.push(RULES.ROUND_AMOUNT.label);
    totalPoints += RULES.ROUND_AMOUNT.points;
  }
 
  // Cap at 100
  const riskScore = Math.min(totalPoints, 100);
  const riskLevel = getRiskLevel(riskScore);
  const recommendation = getRecommendation(riskLevel, triggeredRules);
 
  return {
    riskScore,
    riskLevel,
    triggeredRules,
    recommendation,
  };
}
 
module.exports = { evaluateTransaction };
 

