const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  transaction_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD',
  },
  merchant_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  merchant_category: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  card_last_four: {
    type: DataTypes.STRING(4),
    allowNull: false,
  },
  cardholder_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  location_country: {
    type: DataTypes.STRING(2),
    allowNull: true,
  },
  location_city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  device_fingerprint: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  risk_score: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: { min: 0, max: 100 },
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'flagged', 'blocked', 'safe'),
    defaultValue: 'pending',
  },
  fraud_indicators: {
    type: DataTypes.JSONB,
    defaultValue: [],
  },
  ml_score: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  rule_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_false_positive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  marked_safe_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  marked_safe_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  transaction_time: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['status'] },
    { fields: ['risk_score'] },
    { fields: ['transaction_time'] },
    { fields: ['card_last_four'] },
  ],
});

module.exports = Transaction;