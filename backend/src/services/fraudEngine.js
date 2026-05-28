// backend/src/services/fraudEngine.js

const { FraudRule } = require('../models');

const RULE_MAP = {
  'High Amount Threshold':       'HIGH_AMOUNT',
  'High Risk Category':          'HIGH_RISK_CATEGORY',
  'Blacklisted Merchant':        'BLACKLISTED_MERCHANT',
  'Velocity Check - 5 per hour': 'VELOCITY',
  'Foreign Country Transaction': 'UNUSUAL_LOCATION',
  'Midnight Transaction':        'ODD_HOURS',
  'ML Anomaly Score':            'ML_ANOMALY',
  'Structuring Detection':       'STRUCTURING',
  'Cycling 24h':                 'CYCLING_24H',
  'Round Amount':                'ROUND_AMOUNT',
  'Round-Trip Cycling':          'ROUND_TRIP_CYCLING',
  'Amount Acceleration':         'AMOUNT_ACCELERATION',
};

const RULE_DEFINITIONS = {
  HIGH_AMOUNT:          { points: 30, label: 'High transaction amount (>$5,000)' },
  HIGH_RISK_CATEGORY:   { points: 30, label: 'High-risk merchant category (crypto/gambling)' },
  BLACKLISTED_MERCHANT: { points: 35, label: 'Blacklisted merchant' },
  VELOCITY:             { points: 25, label: 'High velocity (>5 transactions in 1 hour)' },
  UNUSUAL_LOCATION:     { points: 20, label: 'Unusual transaction location' },
  ODD_HOURS:            { points: 15, label: 'Transaction during odd hours (1AM-5AM)' },
  STRUCTURING:          { points: 20, label: 'Structuring pattern (amounts just below reporting threshold)' },
  CYCLING_24H:          { points: 20, label: 'Cycling pattern (>10 transactions in 24 hours)' },
  ROUND_AMOUNT:         { points: 10, label: 'Suspiciously round amount' },
  ROUND_TRIP_CYCLING:   { points: 25, label: 'Round-trip cycling (layering across 3+ merchants)' },
  AMOUNT_ACCELERATION:  { points: 20, label: 'Amount acceleration (exponential growth pattern)' },
  ML_ANOMALY:           { points: 0,  label: 'ML anomaly score' },
};

const BLACKLISTED_MERCHANTS = [
  'dark_market', 'shadow_pay', 'anon_transfer',
  'crypto_exchange_unverified', 'offshore_casino',
];

const TRUSTED_LOCATIONS = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'SG', 'IN'];

const STRUCTURING_BANDS = [
  { min: 800,  max: 999  },
  { min: 4500, max: 4999 },
  { min: 9000, max: 9999 },
];

function checkHighAmount(transaction) {
  return parseFloat(transaction.amount) > 5000;
}

function checkVelocity(recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length === 0) return false;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = recentTransactions.filter(tx =>
    new Date(tx.transaction_time || tx.createdAt) >= oneHourAgo
  ).length;
  return count > 5;
}

function checkStructuring(transaction, recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length === 0) return false;
  const allAmounts = [
    ...recentTransactions.map(tx => parseFloat(tx.amount)),
    parseFloat(transaction.amount),
  ];
  for (const band of STRUCTURING_BANDS) {
    const count = allAmounts.filter(a => a >= band.min && a <= band.max).length;
    if (count >= 3) return true;
  }
  return false;
}

function checkCycling24h(recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length === 0) return false;
  return recentTransactions.length > 10;
}

function checkRoundTripCycling(transaction, recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length < 2) return false;
  
  const currentMerchant = (transaction.merchant_name || transaction.merchantName || '').toLowerCase().trim();
  const currentAmount = parseFloat(transaction.amount);
  
  if (currentAmount < 200) return false; // ignore small amounts
  
  const now = Date.now();
  const fourHoursAgo = now - 4 * 60 * 60 * 1000;
  
  // Only look at last 4 hours, not full 24h window
  const recentPool = recentTransactions.filter(tx => {
    const txTime = new Date(tx.transaction_time || tx.createdAt).getTime();
    return txTime >= fourHoursAgo;
  });
  
  if (recentPool.length < 2) return false;
  
  const pool = [
    ...recentPool.map(tx => ({
      amount: parseFloat(tx.amount),
      merchant: (tx.merchant_name || '').toLowerCase().trim(),
    })).filter(tx => !isNaN(tx.amount) && tx.merchant),
    { amount: currentAmount, merchant: currentMerchant },
  ];
  
  // Use a Set to avoid re-checking same reference amount
  const checkedAmounts = new Set();
  
  for (const entry of pool) {
    const ref = entry.amount;
    if (!ref || ref < 200) continue;
    
    const roundedRef = Math.round(ref);
    if (checkedAmounts.has(roundedRef)) continue;
    checkedAmounts.add(roundedRef);
    
    const tolerance = ref < 500 ? 0.02 : 0.05; // tighter tolerance for smaller amounts
    const cluster = pool.filter(tx => Math.abs(tx.amount - ref) / ref <= tolerance);
    
    if (cluster.length < 3) continue;
    
    const distinctMerchants = new Set(cluster.map(tx => tx.merchant).filter(Boolean));
    if (distinctMerchants.size >= 3) return true;
  }
  
  return false;
}

function checkAmountAcceleration(transaction, recentTransactions) {
  if (!Array.isArray(recentTransactions) || recentTransactions.length < 3) return false;
  const currentAmount = parseFloat(transaction.amount);
  const recent = recentTransactions.slice(0, 3).map(tx => parseFloat(tx.amount)).reverse();
  const sequence = [...recent, currentAmount];
  if (sequence.some(a => isNaN(a) || a <= 0)) return false;
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] / sequence[i - 1] < 2.5) return false;
  }
  return true;
}

function checkBlacklistedMerchant(transaction) {
  const merchant = (transaction.merchantName || transaction.merchant_name || '')
    .toLowerCase().replace(/\s+/g, '_');
  return BLACKLISTED_MERCHANTS.some(bm => merchant.includes(bm));
}

function checkUnusualLocation(transaction) {
  const location = (transaction.location || transaction.country || '').toUpperCase();
  if (!location) return false;
  return !TRUSTED_LOCATIONS.some(loc => location.includes(loc));
}

function checkOddHours(transaction) {
  const txDate = new Date(transaction.transaction_time || transaction.createdAt || Date.now());
  const hour = txDate.getUTCHours();
  return hour >= 1 && hour < 5;
}

function checkRoundAmount(transaction) {
  const amount = parseFloat(transaction.amount);
  if (amount < 100) return false;
  return amount % 1000 === 0 || (amount % 100 === 0 && amount >= 500);
}

function checkHighRiskCategory(transaction) {
  const cat = (transaction.merchant_category || transaction.merchantCategory || '').toLowerCase();
  return ['crypto', 'gambling', 'gaming', 'adult', 'forex'].includes(cat);
}

const RULE_CHECKERS = {
  HIGH_AMOUNT:          (tx, recent) => checkHighAmount(tx),
  HIGH_RISK_CATEGORY:   (tx, recent) => checkHighRiskCategory(tx),
  BLACKLISTED_MERCHANT: (tx, recent) => checkBlacklistedMerchant(tx),
  VELOCITY:             (tx, recent) => checkVelocity(recent),
  UNUSUAL_LOCATION:     (tx, recent) => checkUnusualLocation(tx),
  ODD_HOURS:            (tx, recent) => checkOddHours(tx),
  STRUCTURING:          (tx, recent) => checkStructuring(tx, recent),
  CYCLING_24H:          (tx, recent) => checkCycling24h(recent),
  ROUND_AMOUNT:         (tx, recent) => checkRoundAmount(tx),
  ROUND_TRIP_CYCLING:   (tx, recent) => checkRoundTripCycling(tx, recent),
  AMOUNT_ACCELERATION:  (tx, recent) => checkAmountAcceleration(tx, recent),
  ML_ANOMALY:           (tx, recent) => false,
};

async function getActiveRules() {
  const activeRules = await FraudRule.findAll({
    where: { is_active: true },
    attributes: ['id', 'name', 'score_weight'],
  });

  const activeMap = {}; // engineKey → { weight, id, dbName }
  for (const dbRule of activeRules) {
    const engineKey = RULE_MAP[dbRule.name];
    if (engineKey) {
      activeMap[engineKey] = {
        weight: dbRule.score_weight || RULE_DEFINITIONS[engineKey]?.points || 10,
        id:     dbRule.id,
        dbName: dbRule.name,
      };
    }
  }
  return activeMap;
}

function getRiskLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

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

async function evaluateTransaction(transaction, recentTransactions = []) {
  const activeRuleMap = await getActiveRules();

  const triggeredRules = [];
  const firedRuleIds   = []; // for trigger_count increment
  let totalPoints = 0;

  for (const [engineKey, { weight, id }] of Object.entries(activeRuleMap)) {
    const checker = RULE_CHECKERS[engineKey];
    if (!checker) continue;

    const fired = checker(transaction, recentTransactions);
    if (fired) {
      triggeredRules.push(RULE_DEFINITIONS[engineKey]?.label || engineKey);
      totalPoints += weight;
      firedRuleIds.push(id);
    }
  }

  // Increment trigger_count for all fired rules in one query
  if (firedRuleIds.length > 0) {
    await FraudRule.increment('trigger_count', {
      by:    1,
      where: { id: firedRuleIds },
    });
  }

  const riskScore      = Math.min(totalPoints, 100);
  const riskLevel      = getRiskLevel(riskScore);
  const recommendation = getRecommendation(riskLevel, triggeredRules);

  return { riskScore, riskLevel, triggeredRules, recommendation };
}

module.exports = { evaluateTransaction };