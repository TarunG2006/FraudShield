require('dotenv').config();
const { sequelize } = require('../config/database');
require('../models/index');

const migrate = async () => {
  try {
    console.log('🔄 Running migrations...');
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ All tables created/updated successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
};

migrate();
