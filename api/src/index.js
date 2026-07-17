'use strict';

/**
 * MawinguOps API server.
 *
 * Mounts the Africa's Talking USSD webhook and the health/status routes.
 * The USSD handler only ever reads pre-computed pipeline output from Postgres.
 */

const path = require('path');
// Load .env from the repo root so `cd api && npm start` works (dotenv otherwise
// only checks the current working directory). Falls back to a local api/.env.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // also honour an api/.env if present

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { verifyConnection } = require('./db');
const ussdRoutes = require('./routes/ussd');
const healthRoutes = require('./routes/health');
const subscriptionRoutes = require('./routes/subscriptions');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors());
// Africa's Talking posts URL-encoded form data; also accept JSON.
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Routes
app.use('/', healthRoutes); // GET /health, GET /api/status
app.use('/', ussdRoutes); // POST /ussd
app.use('/', subscriptionRoutes); // POST /api/subscribe, /api/unsubscribe, GET /api/admin/overview

// Root
app.get('/', (req, res) => {
  res.json({ service: 'mawinguops-api', status: 'running' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralised error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  const connected = await verifyConnection();
  if (!connected) {
    console.warn('[api] Starting despite failed DB check — verify DATABASE_URL and that Postgres is running.');
  }

  app.listen(PORT, () => {
    console.log(`[api] MawinguOps API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

start();

module.exports = app;
