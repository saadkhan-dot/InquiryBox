const express = require('express');
const healthRoutes = require('./routes/healthRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware to parse incoming JSON payloads
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
});
app.use(express.json({ limit: process.env.JSON_LIMIT || '32kb' }));

// Health check endpoints (available at both root /health and /api/health)

app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);
const attempts = new Map();
app.use('/api/auth', (req, res, next) => {
  const now = Date.now(), key = req.ip;
  let bucket = attempts.get(key);
  if (!bucket || now - bucket.start > 15 * 60_000) bucket = { start: now, count: 0 };
  bucket.count++;
  attempts.set(key, bucket);
  if (bucket.count > Number(process.env.AUTH_RATE_LIMIT || 30)) return res.status(429).json({ error: 'Too Many Requests', message: 'Please try again later' });
  next();
});
app.use('/api/auth', authRoutes);

// Customer enquiry resource routes
app.use('/api/enquiries', enquiryRoutes);

// Root endpoint: API overview & quick links
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the InquiryBox REST API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      enquiries: '/api/enquiries', auth: '/api/auth'
    }
  });
});

// Fallback 404 handler for unknown routes
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized error-handling middleware
app.use((err, req, res, next) => {
  // Handle invalid JSON body syntax errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload', message: 'Request body contains malformed JSON' });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload Too Large', message: 'Request body exceeds the allowed size' });

  // Log unhandled server errors (500)
  console.error('[InquiryBox Server Error]:', err.code || err.name || 'Error');

  res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred' });
});

module.exports = app;
