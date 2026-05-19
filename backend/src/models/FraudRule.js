const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FraudRule = sequelize.define('FraudRule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  rule_type: {
    type: DataTypes.ENUM('threshold', 'velocity', 'geo', 'pattern', 'ml'),
    allowNull: false,
  },
  conditions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  },
  score_weight: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    validate: { min: 1, max: 100 },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  trigger_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: 'fraud_rules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = FraudRule;
