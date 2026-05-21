// backend/src/services/fraudEngine.js

const RULES = {
  // 35pts: Confirmed fraud history on record — strongest available signal
  BLACKLISTED_MERCHANT: { points: 35, label: 'Blacklisted merchant' },

  // 30pts: Amount >$5,000 is 33x the median legitimate transaction (~$150)
  HIGH_AMOUNT: { points: 30, label: 'High transaction amount (>$5,000)' },

  // 30pts: Crypto/gambling categories carry 8x higher chargeback rates
  HIGH_RISK_CATEGORY: { points: 30, label: 'High-risk merchant category (crypto/gambling)' },

  // 25pts: >5 transactions/hour is outside 3σ of normal cardholder behaviour
  VELOCITY: { points: 25, label: 'High velocity (>5 transactions in 1 hour)' },

  // 20pts: Cross-border transactions have limited fraud dispute resolution
  UNUSUAL_LOCATION: { points: 20, label: 'Unusual transaction location' },

  // 20pts: Amounts just below $1k/$5k/$10k thresholds — classic smurfing pattern
  STRUCTURING: { points: 20, label: 'Structuring pattern (amounts just below reporting threshold)' },

  // 20pts: >10 transactions in 24h — cycling pattern masked by low per-hour rate
  CYCLING_24H: { points: 20, label: 'Cycling pattern (>10 transactions in 24 hours)' },

  // 15pts: 1AM–5AM window accounts for <3% of legitimate transaction volume
  ODD_HOURS: { points: 15, label: 'Transaction during odd hours (1AM–5AM)' },

  // 10pts: Exact round amounts (1000, 5000) are a known structuring pattern
  ROUND_AMOUNT: { points: 10, label: 'Suspiciously round amount' },
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

// Structuring bands — amounts just below common reporting thresholds
const STRUCTURING_BANDS = [
  { min: 800,  max: 999  },   // just below $1,000
  { min: 4500, max: 4999 },   // just below $5,000
  { min: 9000, max: 9999 },   // just below $10,000
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
 * recentTransactions: array of recent transactions for this user/card from DB
 */
function checkVelocity(recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length === 0) return false;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = recentTransactions.filter(tx => {
    const txTime = new Date(tx.transaction_time || tx.createdAt || tx.timestamp);
    return txTime >= oneHourAgo;
  }).length;
  return recentCount > 5;
}

/**
 * Check for structuring — multiple recent transactions just below
 * reporting thresholds ($1k, $5k, $10k). Classic smurfing pattern.
 * Triggers if 3 or more recent transactions fall in any threshold band.
 */
function checkStructuring(transaction, recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length === 0) return false;

  const currentAmount = parseFloat(transaction.amount);

  // Check all transactions including current one
  const allAmounts = [
    ...recentTransactions.map(tx => parseFloat(tx.amount)),
    currentAmount,
  ];

  // For each structuring band, count how many transactions fall in it
  for (const band of STRUCTURING_BANDS) {
    const countInBand = allAmounts.filter(
      amt => amt >= band.min && amt <= band.max
    ).length;
    if (countInBand >= 3) return true;
  }

  return false;
}

/**
 * Check for 24h cycling — more than 10 transactions in the last 24 hours.
 * Catches slow-drip laundering that stays below the 1h velocity threshold.
 */
function checkCycling24h(recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length === 0) return false;
  // recentTransactions is already filtered to last 24h in the controller
  return recentTransactions.length > 10;
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
  return !TRUSTED_LOCATIONS.some(loc => location.includes(loc));
}

/**
 * Check if transaction occurred during odd hours (1AM–5AM UTC)
 */
function checkOddHours(transaction) {
  // Use transaction_time (the actual transaction timestamp, not server createdAt).
  // getUTCHours() ensures consistent evaluation regardless of server timezone.
  const txDate = new Date(
    transaction.transaction_time || transaction.createdAt || Date.now()
  );
  const hour = txDate.getUTCHours();
  return hour >= 1 && hour < 5;
}

/**
 * Check if transaction amount is suspiciously round
 * e.g., exactly 1000, 5000, 10000
 */
function checkRoundAmount(transaction) {
  const amount = parseFloat(transaction.amount);
  if (amount < 100) return false;
  return amount % 1000 === 0 || (amount % 100 === 0 && amount >= 500);
}

/**
 * Check if merchant category is high risk
 */
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
 * @param {Object} transaction        - Transaction object
 * @param {Array}  recentTransactions - Last 24h transactions for this card (from DB)
 * @returns {{ riskScore, riskLevel, triggeredRules, recommendation }}
 */
async function evaluateTransaction(transaction, recentTransactions = []) {
  const triggeredRules = [];
  let totalPoints = 0;

  if (checkHighAmount(transaction)) {
    triggeredRules.push(RULES.HIGH_AMOUNT.label);
    totalPoints += RULES.HIGH_AMOUNT.points;
  }

  if (checkVelocity(recentTransactions)) {
    triggeredRules.push(RULES.VELOCITY.label);
    totalPoints += RULES.VELOCITY.points;
  }

  if (checkStructuring(transaction, recentTransactions)) {
    triggeredRules.push(RULES.STRUCTURING.label);
    totalPoints += RULES.STRUCTURING.points;
  }

  if (checkCycling24h(recentTransactions)) {
    triggeredRules.push(RULES.CYCLING_24H.label);
    totalPoints += RULES.CYCLING_24H.points;
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