const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Alert = sequelize.define('Alert', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  transaction_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  alert_type: {
    type: DataTypes.ENUM('high_risk', 'velocity', 'geo_anomaly', 'amount_spike', 'ml_anomaly', 'rule_trigger'),
    allowNull: false,
  },
  severity: {
    type: DataTypes.ENUM('critical', 'high', 'medium', 'low'),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  details: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  resolved_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'alerts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['severity'] },
    { fields: ['is_read'] },
    { fields: ['transaction_id'] },
  ],
});

module.exports = Alert;