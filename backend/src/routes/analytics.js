const express  = require('express');
const router   = express.Router();
const {
  getDashboard,
  getRiskDistribution,
  getTransactionTrend,
  getTopMerchants,
  getStatusBreakdown,
  getFraudIndicators,
  getFraudByHour,
  getTopFlaggedMerchants,
} = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/dashboard',              getDashboard);
router.get('/risk-distribution',      getRiskDistribution);
router.get('/transaction-trend',      getTransactionTrend);
router.get('/top-merchants',          getTopMerchants);
router.get('/status-breakdown',       getStatusBreakdown);
router.get('/fraud-indicators',       getFraudIndicators);
router.get('/fraud-by-hour',          getFraudByHour);
router.get('/top-flagged-merchants',  getTopFlaggedMerchants);

module.exports = router;