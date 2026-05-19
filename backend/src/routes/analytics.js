const express  = require('express');
const router   = express.Router();
const {
  getDashboard,
  getRiskDistribution,
  getTransactionTrend,
  getTopMerchants,
  getStatusBreakdown,
} = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/dashboard',          getDashboard);
router.get('/risk-distribution',  getRiskDistribution);
router.get('/transaction-trend',  getTransactionTrend);
router.get('/top-merchants',      getTopMerchants);
router.get('/status-breakdown',   getStatusBreakdown);

module.exports = router;
