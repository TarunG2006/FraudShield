require('dotenv').config();
const { sequelize } = require('../config/database');
require('../models/index');

const wipe = async () => {
  try {
    console.log('⚠️  Wiping all data (keeping schema)...');
    await sequelize.query('TRUNCATE TABLE alerts, audit_logs, transactions RESTART IDENTITY CASCADE');
    await sequelize.query('DELETE FROM fraud_rules');
    await sequelize.query('DELETE FROM users');
    console.log('✅ All tables cleared');
    process.exit(0);
  } catch (err) {
    console.error('❌ Wipe failed:', err.message);
    process.exit(1);
  }
};

wipe();