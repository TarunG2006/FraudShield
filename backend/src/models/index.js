const User = require('./User');
const Transaction = require('./Transaction');
const Alert = require('./Alert');
const FraudRule = require('./FraudRule');
const AuditLog = require('./AuditLog');

// Associations
Transaction.hasMany(Alert, { foreignKey: 'transaction_id', as: 'alerts' });
Alert.belongsTo(Transaction, { foreignKey: 'transaction_id', as: 'transaction' });

Transaction.belongsTo(User, { foreignKey: 'marked_safe_by', as: 'markedSafeBy' });

Alert.belongsTo(User, { foreignKey: 'resolved_by', as: 'resolvedBy' });

AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

FraudRule.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });

module.exports = { User, Transaction, Alert, FraudRule, AuditLog };
