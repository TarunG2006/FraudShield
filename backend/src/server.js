require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { testConnection } = require('./config/database');
const { initSocket } = require('./socket');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes        = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const alertRoutes       = require('./routes/alerts');
const ruleRoutes        = require('./routes/rules');
const analyticsRoutes   = require('./routes/analytics');

const app    = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

initSocket(server);

// -- Security & Parsing -----------------------------------------------
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -- Rate Limiting ----------------------------------------------------
app.use('/api/', apiLimiter);

// -- Health Check -----------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    success: true,
    service: 'FraudShield API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// -- API Routes -------------------------------------------------------
app.use('/api/auth',         authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/alerts',       alertRoutes);
app.use('/api/rules',        ruleRoutes);
app.use('/api/analytics',    analyticsRoutes);

// TEMPORARY RESEED ENDPOINT — remove after use
app.post('/api/admin/reseed', async (req, res) => {
  if (req.headers['x-seed-secret'] !== 'fraudshield-reseed-2024') {
    return res.status(403).json({ message: 'forbidden' });
  }
  // Stream progress so Render doesn't timeout
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  const log = (msg) => { console.log(msg); res.write(msg + '\n'); };

  try {
    const { v4: uuidv4 } = require('uuid');
    const { User, Transaction, Alert, FraudRule, AuditLog } = require('./models/index');
    const { sequelize } = require('./config/database');

    log('Wiping old data...');
    await sequelize.query('TRUNCATE TABLE alerts, audit_logs, transactions RESTART IDENTITY CASCADE');
    await sequelize.query('DELETE FROM fraud_rules');
    await sequelize.query('DELETE FROM users');
    log('Wiped.');

    // Users
    const adminHash   = require('bcryptjs').hashSync('Admin@123', 12);
    const analystHash = require('bcryptjs').hashSync('Analyst@123', 12);
    const adminId     = uuidv4();
    const analystId   = uuidv4();

    await User.bulkCreate([
      { id: adminId,   email: 'admin@fraudshield.com',   password_hash: adminHash,   name: 'Admin User',   role: 'admin',   is_active: true },
      { id: analystId, email: 'analyst@fraudshield.com', password_hash: analystHash, name: 'Analyst User', role: 'analyst', is_active: true },
    ]);
    log('Users created.');

    // Rules
    const rules = [
      { id: uuidv4(), name: 'High Amount Threshold',       description: 'Flag transactions above $5,000',                                    rule_type: 'threshold', conditions: { field: 'amount', operator: 'gt', value: 5000 },                                                            score_weight: 30, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Velocity Check - 5 per hour', description: 'Flag if same card used more than 5 times in 1 hour',                rule_type: 'velocity',  conditions: { field: 'card_last_four', window_minutes: 60, max_count: 5 },                                             score_weight: 25, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Foreign Country Transaction',  description: 'Flag transactions originating outside trusted countries',           rule_type: 'geo',       conditions: { field: 'location_country', operator: 'not_in', value: ['US','GB','CA','AU','DE','FR','JP','SG','IN'] }, score_weight: 20, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Midnight Transaction',         description: 'Flag transactions between 1AM and 5AM UTC',                        rule_type: 'pattern',   conditions: { field: 'hour', operator: 'between', value: [1, 5] },                                                    score_weight: 15, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'ML Anomaly Score',             description: 'Flag when ML isolation forest anomaly score exceeds threshold',     rule_type: 'ml',        conditions: { field: 'ml_score', operator: 'lt', value: -0.1 },                                                       score_weight: 35, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'High Risk Category',           description: 'Flag crypto/gambling/forex/adult merchant categories',             rule_type: 'pattern',   conditions: { categories: ['crypto','gambling','forex','adult','gaming'] },                                           score_weight: 30, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Blacklisted Merchant',         description: 'Flag confirmed fraudulent merchants',                              rule_type: 'pattern',   conditions: { merchants: ['dark_market','shadow_pay','anon_transfer','crypto_exchange_unverified','offshore_casino'] }, score_weight: 35, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Structuring Detection',        description: 'Flag amounts just below reporting thresholds 1k/5k/10k',           rule_type: 'pattern',   conditions: { bands: [[800,999],[4500,4999],[9000,9999]] },                                                           score_weight: 20, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Cycling 24h',                  description: 'Flag more than 10 transactions in last 24 hours on same card',     rule_type: 'velocity',  conditions: { max_count: 10, window_hours: 24 },                                                                       score_weight: 20, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Round Amount',                 description: 'Flag suspiciously round amounts - exact thousands',                rule_type: 'pattern',   conditions: { modulus: 1000 },                                                                                         score_weight: 10, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Round-Trip Cycling',           description: 'Flag layering - similar amounts across 3+ different merchants',    rule_type: 'pattern',   conditions: { min_merchants: 3, tolerance: 0.05 },                                                                    score_weight: 25, is_active: true, created_by: adminId },
      { id: uuidv4(), name: 'Amount Acceleration',          description: 'Flag exponential growth - each transaction 2.5x the previous',    rule_type: 'pattern',   conditions: { multiplier: 2.5, lookback: 4 },                                                                         score_weight: 20, is_active: true, created_by: adminId },
    ];
    await FraudRule.bulkCreate(rules);
    log('12 rules created.');

    // Helper functions
    const rInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const TRUSTED   = ['US','GB','CA','AU','DE','FR','JP','SG','IN'];
    const BLACKLIST  = ['dark_market','shadow_pay','anon_transfer','crypto_exchange_unverified','offshore_casino'];
    const HIGH_RISK  = ['crypto','gambling','gaming','adult','forex','wire_transfer','unknown'];

    const MERCHANTS = [
      { name: 'Amazon',                        category: 'E-Commerce',    country: 'US', fraudRate: 0.04 },
      { name: 'Walmart',                        category: 'Retail',        country: 'US', fraudRate: 0.03 },
      { name: 'Netflix',                        category: 'Streaming',     country: 'US', fraudRate: 0.01 },
      { name: 'Spotify',                        category: 'Streaming',     country: 'US', fraudRate: 0.01 },
      { name: 'Uber',                           category: 'Transport',     country: 'US', fraudRate: 0.04 },
      { name: 'Lyft',                           category: 'Transport',     country: 'US', fraudRate: 0.04 },
      { name: 'Apple Store',                    category: 'Electronics',   country: 'US', fraudRate: 0.04 },
      { name: 'Best Buy',                       category: 'Electronics',   country: 'US', fraudRate: 0.05 },
      { name: 'Target',                         category: 'Retail',        country: 'US', fraudRate: 0.03 },
      { name: 'Costco',                         category: 'Retail',        country: 'US', fraudRate: 0.02 },
      { name: 'CVS Pharmacy',                   category: 'Pharmacy',      country: 'US', fraudRate: 0.02 },
      { name: 'McDonald\'s',                    category: 'Food',          country: 'US', fraudRate: 0.02 },
      { name: 'Starbucks',                      category: 'Food',          country: 'US', fraudRate: 0.02 },
      { name: 'Delta Airlines',                 category: 'Travel',        country: 'US', fraudRate: 0.05 },
      { name: 'Marriott Hotels',                category: 'Travel',        country: 'US', fraudRate: 0.05 },
      { name: 'Steam',                          category: 'Gaming',        country: 'US', fraudRate: 0.07 },
      { name: 'PayPal',                         category: 'Finance',       country: 'US', fraudRate: 0.06 },
      { name: 'Binance',                        category: 'crypto',        country: 'MT', fraudRate: 0.35 },
      { name: 'Coinbase',                       category: 'crypto',        country: 'US', fraudRate: 0.20 },
      { name: 'DraftKings',                     category: 'gambling',      country: 'US', fraudRate: 0.30 },
      { name: 'offshore_casino',                category: 'gambling',      country: 'RU', fraudRate: 0.92 },
      { name: 'crypto_exchange_unverified',     category: 'crypto',        country: 'CN', fraudRate: 0.88 },
      { name: 'shadow_pay',                     category: 'wire_transfer', country: 'NG', fraudRate: 0.96 },
      { name: 'anon_transfer',                  category: 'wire_transfer', country: 'KP', fraudRate: 0.96 },
      { name: 'dark_market',                    category: 'unknown',       country: 'RU', fraudRate: 0.98 },
    ];

    const CARDS = ['1234','5678','9012','3456','7890','1111','2222','3333','4444','5555','6666','7777','8888','9999','0000','2468','1357','8024','6135','7913'];

    function getAmount(category, isFraud) {
      if (isFraud) {
        const p = Math.random();
        if (p < 0.25) return rInt(5000, 9800);
        if (p < 0.50) return rInt(900,  999);
        if (p < 0.70) return rInt(4500, 4999);
        if (p < 0.85) return rInt(9000, 9999);
        return rInt(100, 500);
      }
      const m = {
        'E-Commerce': () => rInt(12, 350),  'Retail':    () => rInt(8, 180),
        'Streaming':  () => rInt(10, 18),   'Transport': () => rInt(6, 85),
        'Electronics':() => rInt(30, 1400), 'Gaming':    () => rInt(5, 75),
        'Finance':    () => rInt(20, 550),  'Pharmacy':  () => rInt(8, 140),
        'Food':       () => rInt(6, 55),    'Travel':    () => rInt(150, 1800),
        'gambling':   () => rInt(100, 5000),'crypto':    () => rInt(300, 10000),
        'wire_transfer': () => rInt(500, 9000),
      };
      return (m[category] || (() => rInt(10, 300)))();
    }

    function getDate() {
      const now = Date.now();
      const r = Math.random();
      if (r < 0.35) return new Date(now - rInt(0, 1)   * 86400000 - rInt(0, 86400000));
      if (r < 0.60) return new Date(now - rInt(2, 6)   * 86400000 - rInt(0, 86400000));
      if (r < 0.80) return new Date(now - rInt(7, 13)  * 86400000 - rInt(0, 86400000));
      return           new Date(now - rInt(14, 29)  * 86400000 - rInt(0, 86400000));
    }

    function getHour(isFraud) {
      if (isFraud && Math.random() < 0.6) return rInt(1, 4);
      const h = [8,8,9,9,9,10,10,11,11,12,12,13,13,14,14,15,15,16,16,17,17,18,18,19,20,21,7,22,23,0];
      return h[rInt(0, h.length - 1)];
    }

    function scoreIt(amount, merchantName, category, country, hour) {
      let rs = 0; const ind = [];
      if (amount > 5000)                                            { rs += 30; ind.push('High transaction amount (>$5,000)'); }
      if (BLACKLIST.some(b => merchantName.toLowerCase().includes(b))) { rs += 35; ind.push('Blacklisted merchant'); }
      if (HIGH_RISK.includes(category.toLowerCase()))               { rs += 30; ind.push('High-risk merchant category (crypto/gambling)'); }
      if (!TRUSTED.includes(country.toUpperCase()))                 { rs += 20; ind.push('Unusual transaction location'); }
      if (hour >= 1 && hour < 5)                                    { rs += 15; ind.push('Transaction during odd hours (1AM-5AM)'); }
      if (amount % 1000 === 0 && amount >= 1000)                    { rs += 10; ind.push('Suspiciously round amount'); }
      rs = Math.min(rs, 100);
      const ml    = Math.min(Math.max(rs + Math.round((Math.random() - 0.5) * 24), 0), 100);
      const final = Math.min(Math.round(rs * 0.7 + ml * 0.3), 100);
      let status  = 'approved';
      if (final >= 85) status = 'blocked';
      else if (final >= 70) status = 'flagged';
      else if (final >= 40) status = 'pending';
      return { rs, ml, final, status, ind };
    }

    // Generate 1200 transactions
    log('Generating 1200 transactions...');
    const txns = [];
    for (let i = 0; i < 1200; i++) {
      const m       = MERCHANTS[rInt(0, MERCHANTS.length - 1)];
      const isFraud = Math.random() < m.fraudRate;
      const card    = CARDS[rInt(0, CARDS.length - 1)];
      const txTime  = getDate();
      const hour    = getHour(isFraud);
      txTime.setHours(hour, rInt(0,59), rInt(0,59));
      const amount  = getAmount(m.category, isFraud);
      const { rs, ml, final, status, ind } = scoreIt(amount, m.name, m.category, m.country, hour);
      const CITIES  = { US:['New York','Los Angeles','Chicago','Houston','Austin'], GB:['London','Manchester'], RU:['Moscow'], CN:['Beijing'], default:['Unknown'] };
      const cityArr = CITIES[m.country] || CITIES.default;
      txns.push({
        id: uuidv4(), transaction_id: `TX-${i}-${rInt(1000,9999)}-${Date.now()}`,
        amount, currency: 'USD', merchant_name: m.name, merchant_category: m.category,
        card_last_four: card, cardholder_name: `Cardholder ${card}`,
        location_country: m.country, location_city: cityArr[rInt(0, cityArr.length-1)],
        ip_address: `${rInt(1,254)}.${rInt(1,254)}.${rInt(1,254)}.${rInt(1,254)}`,
        device_fingerprint: uuidv4(),
        risk_score: final, ml_score: ml, rule_score: rs,
        status, fraud_indicators: ind, is_false_positive: false, transaction_time: txTime,
      });
    }

    for (let i = 0; i < txns.length; i += 100) {
      await Transaction.bulkCreate(txns.slice(i, i + 100), { ignoreDuplicates: true });
      log(`  transactions: ${Math.min(i+100, txns.length)}/1200`);
    }
    log('1200 transactions done.');

    // Alerts
    log('Creating alerts...');
    const flagged = await Transaction.findAll({ where: { status: ['flagged','blocked'] } });
    const aTypes  = ['high_risk','velocity','geo_anomaly','amount_spike','ml_anomaly','rule_trigger'];
    const aList   = flagged.map(tx => ({
      id: uuidv4(), transaction_id: tx.id,
      alert_type: aTypes[rInt(0, aTypes.length-1)],
      severity:   tx.risk_score >= 85 ? 'critical' : tx.risk_score >= 70 ? 'high' : 'medium',
      message:    `Suspicious transaction of $${parseFloat(tx.amount).toFixed(2)} at "${tx.merchant_name}" — risk score ${tx.risk_score}/100.`,
      details:    { riskScore: tx.risk_score, triggeredRules: tx.fraud_indicators, amount: tx.amount,
                    recommendation: tx.risk_score >= 85 ? 'Block immediately.' : 'Flag for review.' },
      is_read:    Math.random() > 0.65,
    }));
    for (let i = 0; i < aList.length; i += 50) {
      await Alert.bulkCreate(aList.slice(i, i+50), { ignoreDuplicates: true });
    }
    log(`${aList.length} alerts done.`);

    await AuditLog.create({
      id: uuidv4(), user_id: adminId, action: 'LOGIN',
      entity_type: 'user', entity_id: adminId,
      ip_address: '127.0.0.1', user_agent: 'Reseed Endpoint',
      new_values: { timestamp: new Date().toISOString() },
    });

    const total   = await Transaction.count();
    const fCount  = await Transaction.count({ where: { status: ['flagged','blocked'] } });
    log(`DONE. Total: ${total} | Fraud: ${fCount} | Rate: ${(fCount/total*100).toFixed(1)}%`);
    res.end();
  } catch (err) {
    console.error(err);
    res.end('ERROR: ' + err.message);
  }
});
// -- 404 Handler ------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// -- Global Error Handler ---------------------------------------------
app.use(errorHandler);

// -- Start Server -----------------------------------------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await testConnection();
    server.listen(PORT, () => {
      console.log('');
      console.log('FraudShield API');
      console.log(`Running on   -> http://localhost:${PORT}`);
      console.log(`Health check -> http://localhost:${PORT}/health`);
      console.log(`Environment  -> ${process.env.NODE_ENV}`);
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server };
