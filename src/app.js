const express = require('express');
const healthRoutes = require('./routes/healthRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');

const app = express();

// Middleware to parse incoming JSON payloads
app.use(express.json());

// Health check endpoints (available at both root /health and /api/health)
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// Customer enquiry resource routes
app.use('/api/enquiries', enquiryRoutes);

// Root endpoint: API overview & quick links
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the InquiryBox REST API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      enquiries: '/api/enquiries'
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

  // Log unhandled server errors (500)
  console.error('[InquiryBox Server Error]:', err.code || err.name || 'Error');

  res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred' });
});

module.exports = app;
