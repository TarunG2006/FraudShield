require('dotenv').config();
const { sequelize } = require('../config/database');
const { User, Transaction, Alert, FraudRule, AuditLog } = require('../models/index');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedAmount(min, max, skew = 0.5) {
  return Math.round(Math.pow(Math.random(), skew) * (max - min) + min);
}

function realisticHour(isFraud) {
  if (isFraud && Math.random() < 0.6) return randomInt(1, 4);
  const business = [8,8,9,9,9,10,10,10,11,11,12,12,12,13,13,14,14,15,15,16,16,17,17,18,18,19,20,21,22,7,23,0];
  return business[randomInt(0, business.length - 1)];
}

function realisticDate() {
  const now = Date.now();
  const r = Math.random();
  if (r < 0.35)      return new Date(now - randomInt(0,        1) * 86400000 - randomInt(0, 86400000));
  else if (r < 0.60) return new Date(now - randomInt(2,        6) * 86400000 - randomInt(0, 86400000));
  else if (r < 0.80) return new Date(now - randomInt(7,       13) * 86400000 - randomInt(0, 86400000));
  else               return new Date(now - randomInt(14,      29) * 86400000 - randomInt(0, 86400000));
}

function realisticAmount(category, isFraud) {
  if (isFraud) {
    const pick = Math.random();
    if (pick < 0.25) return randomInt(5000, 9800);   // high amount
    if (pick < 0.50) return randomInt(900,  999);    // structuring band 1
    if (pick < 0.70) return randomInt(4500, 4999);   // structuring band 2
    if (pick < 0.85) return randomInt(9000, 9999);   // structuring band 3
    return randomInt(100, 500);
  }
  const map = {
    'E-Commerce':    () => weightedAmount(12,  400, 0.4),
    'Retail':        () => weightedAmount(8,   200, 0.4),
    'Streaming':     () => randomInt(10, 18),
    'Transport':     () => weightedAmount(6,   90,  0.4),
    'Electronics':   () => weightedAmount(30,  1500,0.3),
    'Gaming':        () => weightedAmount(5,   80,  0.4),
    'Finance':       () => weightedAmount(20,  600, 0.4),
    'Pharmacy':      () => weightedAmount(8,   150, 0.4),
    'Food':          () => weightedAmount(8,   60,  0.4),
    'Travel':        () => weightedAmount(150, 2000,0.3),
    'gambling':      () => weightedAmount(200, 8000,0.6),
    'crypto':        () => weightedAmount(500, 12000,0.6),
    'wire_transfer': () => weightedAmount(1000,9500,0.6),
  };
  return (map[category] || (() => weightedAmount(10, 300, 0.4)))();
}

const MERCHANTS = [
  // Legit — low fraud rate
  { name: 'Amazon',          category: 'E-Commerce',    country: 'US', fraudRate: 0.04 },
  { name: 'Walmart',         category: 'Retail',        country: 'US', fraudRate: 0.03 },
  { name: 'Netflix',         category: 'Streaming',     country: 'US', fraudRate: 0.01 },
  { name: 'Spotify',         category: 'Streaming',     country: 'US', fraudRate: 0.01 },
  { name: 'Uber',            category: 'Transport',     country: 'US', fraudRate: 0.04 },
  { name: 'Lyft',            category: 'Transport',     country: 'US', fraudRate: 0.04 },
  { name: 'Apple Store',     category: 'Electronics',   country: 'US', fraudRate: 0.04 },
  { name: 'Best Buy',        category: 'Electronics',   country: 'US', fraudRate: 0.05 },
  { name: 'Target',          category: 'Retail',        country: 'US', fraudRate: 0.03 },
  { name: 'Costco',          category: 'Retail',        country: 'US', fraudRate: 0.02 },
  { name: 'CVS Pharmacy',    category: 'Pharmacy',      country: 'US', fraudRate: 0.02 },
  { name: 'Walgreens',       category: 'Pharmacy',      country: 'US', fraudRate: 0.02 },
  { name: 'McDonald\'s',     category: 'Food',          country: 'US', fraudRate: 0.02 },
  { name: 'Starbucks',       category: 'Food',          country: 'US', fraudRate: 0.02 },
  { name: 'Delta Airlines',  category: 'Travel',        country: 'US', fraudRate: 0.05 },
  { name: 'Marriott Hotels', category: 'Travel',        country: 'US', fraudRate: 0.05 },
  { name: 'Steam',           category: 'Gaming',        country: 'US', fraudRate: 0.07 },
  { name: 'PayPal',          category: 'Finance',       country: 'US', fraudRate: 0.06 },
  { name: 'Stripe',          category: 'Finance',       country: 'US', fraudRate: 0.05 },
  // Medium risk
  { name: 'Binance',         category: 'crypto',        country: 'MT', fraudRate: 0.35 },
  { name: 'Coinbase',        category: 'crypto',        country: 'US', fraudRate: 0.20 },
  { name: 'DraftKings',      category: 'gambling',      country: 'US', fraudRate: 0.30 },
  { name: 'FanDuel',         category: 'gambling',      country: 'US', fraudRate: 0.28 },
  // High risk / blacklisted
  { name: 'offshore_casino',              category: 'gambling',      country: 'RU', fraudRate: 0.92 },
  { name: 'crypto_exchange_unverified',   category: 'crypto',        country: 'CN', fraudRate: 0.88 },
  { name: 'shadow_pay',                   category: 'wire_transfer', country: 'NG', fraudRate: 0.96 },
  { name: 'anon_transfer',                category: 'wire_transfer', country: 'KP', fraudRate: 0.96 },
  { name: 'dark_market',                  category: 'unknown',       country: 'RU', fraudRate: 0.98 },
];

const CARDS = [
  '1234','5678','9012','3456','7890',
  '1111','2222','3333','4444','5555',
  '6666','7777','8888','9999','0000',
  '2468','1357','8024','6135','7913',
];

const TRUSTED = ['US','GB','CA','AU','DE','FR','JP','SG','IN'];

const BLACKLISTED = ['dark_market','shadow_pay','anon_transfer','crypto_exchange_unverified','offshore_casino'];
const HIGH_RISK_CATS = ['crypto','gambling','gaming','adult','forex','wire_transfer','unknown'];

function scoreTransaction(amount, merchantName, category, country, hour) {
  let ruleScore = 0;
  const indicators = [];

  if (amount > 5000) {
    ruleScore += 30;
    indicators.push('High transaction amount (>$5,000)');
  }
  if (BLACKLISTED.some(b => merchantName.toLowerCase().includes(b))) {
    ruleScore += 35;
    indicators.push('Blacklisted merchant');
  }
  if (HIGH_RISK_CATS.includes(category.toLowerCase())) {
    ruleScore += 30;
    indicators.push('High-risk merchant category (crypto/gambling)');
  }
  if (!TRUSTED.includes(country.toUpperCase())) {
    ruleScore += 20;
    indicators.push('Unusual transaction location');
  }
  if (hour >= 1 && hour < 5) {
    ruleScore += 15;
    indicators.push('Transaction during odd hours (1AM-5AM)');
  }
  if (amount % 1000 === 0 && amount >= 1000) {
    ruleScore += 10;
    indicators.push('Suspiciously round amount');
  }

  ruleScore = Math.min(ruleScore, 100);
  const mlNoise  = Math.round((Math.random() - 0.5) * 24);
  const mlScore  = Math.min(Math.max(ruleScore + mlNoise, 0), 100);
  const final    = Math.min(Math.round(ruleScore * 0.7 + mlScore * 0.3), 100);

  let status = 'approved';
  if (final >= 85)      status = 'blocked';
  else if (final >= 70) status = 'flagged';
  else if (final >= 40) status = 'pending';

  return { ruleScore, mlScore, finalScore: final, status, indicators };
}

function generateTransactions(count) {
  const txns = [];
  for (let i = 0; i < count; i++) {
    const merchant  = MERCHANTS[randomInt(0, MERCHANTS.length - 1)];
    const isFraud   = Math.random() < merchant.fraudRate;
    const card      = CARDS[randomInt(0, CARDS.length - 1)];
    const txTime    = realisticDate();
    const hour      = realisticHour(isFraud);
    txTime.setHours(hour, randomInt(0, 59), randomInt(0, 59));

    const amount    = realisticAmount(merchant.category, isFraud);
    const { ruleScore, mlScore, finalScore, status, indicators } =
      scoreTransaction(amount, merchant.name, merchant.category, merchant.country, hour);

    const cities = {
      US: ['New York','Los Angeles','Chicago','Houston','Austin','Seattle','Miami'],
      GB: ['London','Manchester','Birmingham'],
      CA: ['Toronto','Vancouver','Montreal'],
      RU: ['Moscow','Saint Petersburg'],
      CN: ['Beijing','Shanghai'],
      default: ['Unknown'],
    };
    const cityList = cities[merchant.country] || cities.default;

    txns.push({
      id:                uuidv4(),
      transaction_id:    `TX-${Date.now()}-${i}-${randomInt(1000,9999)}`,
      amount,
      currency:          'USD',
      merchant_name:     merchant.name,
      merchant_category: merchant.category,
      card_last_four:    card,
      cardholder_name:   `Cardholder ${card}`,
      location_country:  merchant.country,
      location_city:     cityList[randomInt(0, cityList.length - 1)],
      ip_address:        `${randomInt(1,254)}.${randomInt(1,254)}.${randomInt(1,254)}.${randomInt(1,254)}`,
      device_fingerprint: uuidv4(),
      risk_score:        finalScore,
      ml_score:          mlScore,
      rule_score:        ruleScore,
      status,
      fraud_indicators:  indicators,
      is_false_positive: false,
      transaction_time:  txTime,
    });
  }
  return txns;
}

const seed = async () => {
  try {
    console.log('🌱 Seeding database...');

    // ── Users ──────────────────────────────────────────────────────────
    const [admin] = await User.findOrCreate({
      where: { email: 'admin@fraudshield.com' },
      defaults: {
        id: uuidv4(), name: 'Admin User',
        password_hash: 'Admin@123', role: 'admin', is_active: true,
      },
    });

    await User.findOrCreate({
      where: { email: 'analyst@fraudshield.com' },
      defaults: {
        id: uuidv4(), name: 'Analyst User',
        password_hash: 'Analyst@123', role: 'analyst', is_active: true,
      },
    });

    console.log('✅ Users seeded');

    // ── Fraud Rules ────────────────────────────────────────────────────
    const rules = [
      {
        id: uuidv4(), name: 'High Amount Threshold',
        description: 'Flag transactions above $5,000',
        rule_type: 'threshold',
        conditions: { field: 'amount', operator: 'gt', value: 5000 },
        score_weight: 30, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Velocity Check - 5 per hour',
        description: 'Flag if same card used more than 5 times in 1 hour',
        rule_type: 'velocity',
        conditions: { field: 'card_last_four', window_minutes: 60, max_count: 5 },
        score_weight: 25, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Foreign Country Transaction',
        description: 'Flag transactions originating outside trusted countries',
        rule_type: 'geo',
        conditions: { field: 'location_country', operator: 'not_in', value: ['US','GB','CA','AU','DE','FR','JP','SG','IN'] },
        score_weight: 20, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Midnight Transaction',
        description: 'Flag transactions between 1AM and 5AM UTC',
        rule_type: 'pattern',
        conditions: { field: 'hour', operator: 'between', value: [1, 5] },
        score_weight: 15, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'ML Anomaly Score',
        description: 'Flag when ML isolation forest anomaly score exceeds threshold',
        rule_type: 'ml',
        conditions: { field: 'ml_score', operator: 'lt', value: -0.1 },
        score_weight: 35, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'High Risk Category',
        description: 'Flag crypto/gambling/forex/adult merchant categories',
        rule_type: 'pattern',
        conditions: { categories: ['crypto','gambling','forex','adult','gaming'] },
        score_weight: 30, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Blacklisted Merchant',
        description: 'Flag confirmed fraudulent merchants',
        rule_type: 'pattern',
        conditions: { merchants: ['dark_market','shadow_pay','anon_transfer','crypto_exchange_unverified','offshore_casino'] },
        score_weight: 35, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Structuring Detection',
        description: 'Flag amounts just below reporting thresholds 1k/5k/10k',
        rule_type: 'pattern',
        conditions: { bands: [[800,999],[4500,4999],[9000,9999]] },
        score_weight: 20, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Cycling 24h',
        description: 'Flag more than 10 transactions in last 24 hours on same card',
        rule_type: 'velocity',
        conditions: { max_count: 10, window_hours: 24 },
        score_weight: 20, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Round Amount',
        description: 'Flag suspiciously round amounts - exact thousands',
        rule_type: 'pattern',
        conditions: { modulus: 1000 },
        score_weight: 10, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Round-Trip Cycling',
        description: 'Flag layering - similar amounts across 3+ different merchants within 5%',
        rule_type: 'pattern',
        conditions: { min_merchants: 3, tolerance: 0.05 },
        score_weight: 25, is_active: true, created_by: admin.id,
      },
      {
        id: uuidv4(), name: 'Amount Acceleration',
        description: 'Flag exponential growth - each transaction 2.5x the previous',
        rule_type: 'pattern',
        conditions: { multiplier: 2.5, lookback: 4 },
        score_weight: 20, is_active: true, created_by: admin.id,
      },
    ];

    for (const rule of rules) {
      await FraudRule.findOrCreate({ where: { name: rule.name }, defaults: rule });
    }
    console.log('✅ 12 fraud rules seeded');

    // ── Transactions ───────────────────────────────────────────────────
    console.log('⏳ Generating 1,200 transactions...');
    const transactions = generateTransactions(1200);
    
    // Batch insert in chunks of 100 to avoid hitting DB limits
    const chunkSize = 100;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await Transaction.bulkCreate(chunk, { ignoreDuplicates: true });
      console.log(`   inserted ${Math.min(i + chunkSize, transactions.length)} / ${transactions.length}`);
    }
    console.log('✅ 1,200 transactions seeded');

    // ── Alerts for flagged/blocked ──────────────────────────────────────
    console.log('⏳ Creating alerts...');
    const flaggedTxs = await Transaction.findAll({
      where: { status: ['flagged', 'blocked'] },
    });

    const alertTypes = ['high_risk','velocity','geo_anomaly','amount_spike','ml_anomaly','rule_trigger'];

    function severityFromScore(score) {
      if (score >= 85) return 'critical';
      if (score >= 70) return 'high';
      if (score >= 40) return 'medium';
      return 'low';
    }

    const alerts = flaggedTxs.map(tx => ({
      id:             uuidv4(),
      transaction_id: tx.id,
      alert_type:     alertTypes[randomInt(0, alertTypes.length - 1)],
      severity:       severityFromScore(tx.risk_score),
      message:        `Suspicious transaction of $${parseFloat(tx.amount).toFixed(2)} at "${tx.merchant_name}" flagged with risk score ${tx.risk_score}/100.`,
      details: {
        riskScore:      tx.risk_score,
        indicators:     tx.fraud_indicators,
        amount:         tx.amount,
        triggeredRules: tx.fraud_indicators,
        recommendation: tx.risk_score >= 85
          ? 'Block transaction and trigger immediate review.'
          : 'Flag for analyst review. Request additional verification.',
      },
      is_read: Math.random() > 0.65,  // ~35% unread — realistic backlog
    }));

    const alertChunks = [];
    for (let i = 0; i < alerts.length; i += 50) {
      alertChunks.push(alerts.slice(i, i + 50));
    }
    for (const chunk of alertChunks) {
      await Alert.bulkCreate(chunk, { ignoreDuplicates: true });
    }
    console.log(`✅ ${alerts.length} alerts seeded`);

    // ── Audit Logs ─────────────────────────────────────────────────────
    await AuditLog.bulkCreate([
      {
        id: uuidv4(), user_id: admin.id, action: 'LOGIN',
        entity_type: 'user', entity_id: admin.id,
        ip_address: '127.0.0.1', user_agent: 'Seed Script',
        new_values: { timestamp: new Date().toISOString() },
      },
      {
        id: uuidv4(), user_id: admin.id, action: 'CREATE_RULE',
        entity_type: 'fraud_rule', entity_id: 'seed',
        new_values: { count: rules.length },
        ip_address: '127.0.0.1', user_agent: 'Seed Script',
      },
    ]);
    console.log('✅ Audit logs seeded');

    // ── Summary ────────────────────────────────────────────────────────
    const total    = await Transaction.count();
    const flagged  = await Transaction.count({ where: { status: 'flagged' } });
    const blocked  = await Transaction.count({ where: { status: 'blocked' } });
    const approved = await Transaction.count({ where: { status: 'approved' } });
    const pending  = await Transaction.count({ where: { status: 'pending' } });

    console.log('\n🎉 Database seeded successfully!');
    console.log('─────────────────────────────────────────');
    console.log(`Total transactions : ${total}`);
    console.log(`Approved           : ${approved}`);
    console.log(`Pending            : ${pending}`);
    console.log(`Flagged            : ${flagged}`);
    console.log(`Blocked            : ${blocked}`);
    console.log(`Fraud rate         : ${((flagged + blocked) / total * 100).toFixed(1)}%`);
    console.log('─────────────────────────────────────────');
    console.log('Admin  : admin@fraudshield.com   / Admin@123');
    console.log('Analyst: analyst@fraudshield.com / Analyst@123');
    console.log('─────────────────────────────────────────');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error(error);
    process.exit(1);
  }
};

seed();