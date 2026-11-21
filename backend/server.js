/**
 * BlogSpace Backend Server
 * Entry point for the Express REST API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Middleware Configuration
// ==========================================

// CORS Configuration
// - Development: allow all origins so localhost works without friction
// - Production:  restrict to the deployed frontend URL only
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN   // e.g. "https://reyusai.github.io"
    : '*',                      // allow everything during development
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Parse incoming JSON payloads in request bodies (req.body)
app.use(express.json());

// Parse URL-encoded bodies (form data)
app.use(express.urlencoded({ extended: true }));

// Simple request logger to help during development & debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// ==========================================
// Base & Health Check Routes
// ==========================================

// Welcome / Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the BlogSpace REST API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      blogs: '/api/blogs'
    }
  });
});

// Health check endpoint - used to verify server is active and responsive
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'BlogSpace API server is healthy and running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// API Routes
// ==========================================
const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);

// ==========================================
// Error Handling
// ==========================================

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  const status = err.status || 500;
  const message = (process.env.NODE_ENV === 'production' && status >= 500)
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');
  res.status(status).json({
    success: false,
    message
  });
});

// ==========================================
// Server Initialization
// ==========================================
// The database must be ready before we accept HTTP requests.
// initializeDatabase() creates tables and seeds sample posts,
// then we start listening for connections.
if (process.env.NODE_ENV !== 'test') {
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`=========================================`);
        console.log(`🚀 BlogSpace Server running on port ${PORT}`);
        console.log(`🔗 Local URL: http://localhost:${PORT}`);
        console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
        console.log(`=========================================`);
      });
    })
    .catch((err) => {
      console.error('❌ Failed to initialize database:', err);
      process.exit(1);
    });
}

module.exports = app;
