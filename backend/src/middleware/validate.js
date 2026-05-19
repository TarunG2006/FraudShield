const Joi = require('joi');

// ── Validation middleware factory ────────────────────────────────────
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'query' ? req.query : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map(d => d.message.replace(/"/g, "'"));
      return res.status(400).json({
        success: false,
        message: 'Validation error.',
        errors: messages,
      });
    }

    // Replace source with cleaned/validated data
    if (source === 'query') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// ── Reusable schemas ─────────────────────────────────────────────────
const schemas = {
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email.',
      'any.required': 'Email is required.',
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters.',
      'any.required': 'Password is required.',
    }),
  }),

  createRule: Joi.object({
    name:        Joi.string().min(3).max(100).required(),
    description: Joi.string().max(500).optional().allow(''),
    rule_type:   Joi.string().valid('threshold', 'velocity', 'geo', 'pattern', 'ml').required(),
    conditions:  Joi.object().required(),
    score_weight: Joi.number().integer().min(1).max(100).required(),
    is_active:   Joi.boolean().default(true),
  }),

  updateRule: Joi.object({
    name:        Joi.string().min(3).max(100).optional(),
    description: Joi.string().max(500).optional().allow(''),
    conditions:  Joi.object().optional(),
    score_weight: Joi.number().integer().min(1).max(100).optional(),
    is_active:   Joi.boolean().optional(),
  }),

  transactionQuery: Joi.object({
    status:    Joi.string().valid('pending', 'approved', 'flagged', 'blocked', 'safe').optional(),
    minRisk:   Joi.number().min(0).max(100).optional(),
    maxRisk:   Joi.number().min(0).max(100).optional(),
    search:    Joi.string().max(100).optional().allow(''),
    startDate: Joi.date().iso().optional(),
    endDate:   Joi.date().iso().optional(),
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(20),
    sortBy:    Joi.string().valid('risk_score', 'amount', 'transaction_time', 'created_at').default('transaction_time'),
    sortDir:   Joi.string().valid('ASC', 'DESC').default('DESC'),
  }),

  alertQuery: Joi.object({
    severity:  Joi.string().valid('critical', 'high', 'medium', 'low').optional(),
    is_read:   Joi.boolean().optional(),
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(20),
  }),
};

module.exports = { validate, schemas };