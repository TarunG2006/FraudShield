require('dotenv').config();
const { sequelize } = require('../config/database');
const { User, Transaction, Alert, FraudRule, AuditLog } = require('../models/index');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const seed = async () => {
  try {
    console.log('🌱 Seeding database...');

    const adminPassword   = 'Admin@123';
    const analystPassword = 'Analyst@123';

    const [admin] = await User.findOrCreate({
      where: { email: 'admin@fraudshield.com' },
      defaults: {
        id: uuidv4(), name: 'Admin User',
        password_hash: adminPassword, role: 'admin', is_active: true,
      },
    });

    const [analyst] = await User.findOrCreate({
      where: { email: 'analyst@fraudshield.com' },
      defaults: {
        id: uuidv4(), name: 'Analyst User',
        password_hash: analystPassword, role: 'analyst', is_active: true,
      },
    });

    console.log('✅ Users seeded');

    // ── Fraud Rules — all 12 ──────────────────────────────────────────────────
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
    console.log('✅ Fraud rules seeded (12 rules)');

    // ── Transactions ──────────────────────────────────────────────────────────
    const merchants  = ['Amazon','Walmart','Steam','Apple Store','Best Buy','Target','Uber','Netflix','PayPal','Stripe'];
    const categories = ['E-Commerce','Retail','Gaming','Electronics','Transport','Streaming','Finance'];
    const countries  = ['US','US','US','US','US','GB','CN','RU','IN','BR'];
    const cities     = ['New York','Los Angeles','Chicago','Houston','London','Beijing','Moscow','Mumbai'];
    const statuses   = ['approved','approved','approved','flagged','flagged','blocked','safe'];

    const transactions = [];
    for (let i = 0; i < 80; i++) {
      const amount    = parseFloat((Math.random() * 9500 + 10).toFixed(2));
      const riskScore = Math.floor(Math.random() * 100);
      const country   = countries[Math.floor(Math.random() * countries.length)];
      const status    = statuses[Math.floor(Math.random() * statuses.length)];
      const txTime    = new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000));

      const indicators = [];
      if (amount > 5000)    indicators.push('High transaction amount (>$5,000)');
      if (country !== 'US') indicators.push('Unusual transaction location');
      if (txTime.getUTCHours() >= 1 && txTime.getUTCHours() < 5) indicators.push('Transaction during odd hours (1AM-5AM)');
      if (riskScore > 70)   indicators.push('ML anomaly score');

      transactions.push({
        id: uuidv4(),
        transaction_id: `TX-${Date.now()}-${i}`,
        amount, currency: 'USD',
        merchant_name:     merchants[Math.floor(Math.random() * merchants.length)],
        merchant_category: categories[Math.floor(Math.random() * categories.length)],
        card_last_four:    String(Math.floor(1000 + Math.random() * 9000)),
        cardholder_name:   `Cardholder ${i + 1}`,
        location_country:  country,
        location_city:     cities[Math.floor(Math.random() * cities.length)],
        ip_address: `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
        device_fingerprint: uuidv4(),
        risk_score: riskScore, status,
        fraud_indicators: indicators,
        ml_score:   parseFloat((Math.random() * 0.6 - 0.3).toFixed(4)),
        rule_score: Math.floor(riskScore * 0.6),
        is_false_positive: status === 'safe',
        transaction_time:  txTime,
      });
    }

    await Transaction.bulkCreate(transactions, { ignoreDuplicates: true });
    console.log('✅ 80 transactions seeded');

    // ── Alerts ────────────────────────────────────────────────────────────────
    const flaggedTxs = await Transaction.findAll({ where: { status: ['flagged','blocked'] }, limit: 15 });
    const alertTypes = ['high_risk','velocity','geo_anomaly','amount_spike','ml_anomaly'];
    const severities = ['critical','high','medium','low'];

    const alerts = flaggedTxs.map((tx) => ({
      id: uuidv4(),
      transaction_id: tx.id,
      alert_type: alertTypes[Math.floor(Math.random() * alertTypes.length)],
      severity:   severities[Math.floor(Math.random() * severities.length)],
      message: `Suspicious activity detected on transaction ${tx.transaction_id} - risk score ${tx.risk_score}`,
      details: { risk_score: tx.risk_score, indicators: tx.fraud_indicators, amount: tx.amount },
      is_read: Math.random() > 0.5,
    }));

    await Alert.bulkCreate(alerts, { ignoreDuplicates: true });
    console.log('✅ Alerts seeded');

    // ── Audit Logs ────────────────────────────────────────────────────────────
    await AuditLog.bulkCreate([
      {
        id: uuidv4(), user_id: admin.id, action: 'LOGIN',
        entity_type: 'User', entity_id: admin.id,
        ip_address: '127.0.0.1', user_agent: 'Seed Script',
      },
      {
        id: uuidv4(), user_id: admin.id, action: 'CREATE_RULE',
        entity_type: 'FraudRule', entity_id: 'seed',
        new_values: { count: rules.length }, ip_address: '127.0.0.1',
      },
    ]);
    console.log('✅ Audit logs seeded');

    console.log('\n🎉 Database seeded successfully!');
    console.log('─────────────────────────────────');
    console.log('Admin login:   admin@fraudshield.com   / Admin@123');
    console.log('Analyst login: analyst@fraudshield.com / Analyst@123');
    console.log('─────────────────────────────────');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error(error);
    process.exit(1);
  }
};

seed();