require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { testConnection } = require('./config/database');
const { initSocket } = require('./socket');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes        = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const alertRoutes       = require('./routes/alerts');
const ruleRoutes        = require('./routes/rules');
const analyticsRoutes   = require('./routes/analytics');

const app    = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

initSocket(server);

// -- Security & Parsing -----------------------------------------------
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -- Rate Limiting ----------------------------------------------------
app.use('/api/', apiLimiter);

// -- Health Check -----------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    success: true,
    service: 'FraudShield API',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// -- API Routes -------------------------------------------------------
app.use('/api/auth',         authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/alerts',       alertRoutes);
app.use('/api/rules',        ruleRoutes);
app.use('/api/analytics',    analyticsRoutes);

// -- 404 Handler ------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// -- Global Error Handler ---------------------------------------------
app.use(errorHandler);

// -- Start Server -----------------------------------------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await testConnection();
    server.listen(PORT, () => {
      console.log('');
      console.log('FraudShield API');
      console.log(`Running on   -> http://localhost:${PORT}`);
      console.log(`Health check -> http://localhost:${PORT}/health`);
      console.log(`Environment  -> ${process.env.NODE_ENV}`);
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server };
