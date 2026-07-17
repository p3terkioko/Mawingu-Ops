'use strict';

/**
 * Subscription + admin routes.
 *
 *   POST /api/subscribe        {contact, channel, language?} -> upsert subscription
 *   POST /api/unsubscribe      {contact, channel}            -> deactivate
 *   GET  /api/admin/overview   Bearer ADMIN_TOKEN            -> ops summary
 */

const express = require('express');
const subscriptionService = require('../services/subscriptions');

const router = express.Router();

const PHONE_RE = /^\+?[0-9]{9,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate and normalise a subscribe/unsubscribe payload. */
function parseContact(body) {
  const channel = String(body.channel || '').toLowerCase();
  const contact = String(body.contact || '').trim();
  if (!['sms', 'email'].includes(channel)) {
    return { error: "channel must be 'sms' or 'email'" };
  }
  if (channel === 'sms' && !PHONE_RE.test(contact.replace(/[\s-]/g, ''))) {
    return { error: 'contact must be a valid phone number for SMS' };
  }
  if (channel === 'email' && !EMAIL_RE.test(contact)) {
    return { error: 'contact must be a valid email address' };
  }
  return {
    channel,
    contact: channel === 'sms' ? contact.replace(/[\s-]/g, '') : contact.toLowerCase(),
  };
}

// POST /api/subscribe
router.post('/api/subscribe', async (req, res) => {
  const parsed = parseContact(req.body || {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const language = req.body.language === 'en' ? 'en' : 'sw';
  try {
    const sub = await subscriptionService.upsertSubscription(
      parsed.contact,
      parsed.channel,
      { language }
    );
    res.status(201).json({
      subscribed: true,
      channel: sub.channel,
      language: sub.language,
    });
  } catch (err) {
    console.error('[subscribe] Failed:', err.message);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// POST /api/unsubscribe
router.post('/api/unsubscribe', async (req, res) => {
  const parsed = parseContact(req.body || {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  try {
    const row = await subscriptionService.unsubscribe(parsed.contact, parsed.channel);
    if (!row) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json({ unsubscribed: true });
  } catch (err) {
    console.error('[unsubscribe] Failed:', err.message);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

/** Simple bearer-token gate for the admin overview (hackathon-grade auth). */
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'ADMIN_TOKEN not configured' });
  }
  const header = req.get('authorization') || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (presented !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/overview
router.get('/api/admin/overview', requireAdmin, async (req, res) => {
  try {
    res.json(await subscriptionService.adminOverview());
  } catch (err) {
    console.error('[admin] Overview failed:', err.message);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

module.exports = router;
