/**
 * Legacy /api/streams routes
 *
 * These routes remain for backward compatibility with any existing
 * stream documents in the database (list and get only).
 *
 * New live sessions use /api/live.
 * Stream creation is no longer available here.
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const Stream = require('../../models/Stream');
const { NotFoundError } = require('../middleware/errorHandler');

// GET /api/streams - List live streams (backward-compat redirect to live)
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { category, status = 'live' } = req.query;
    const query = { status, isBanned: false };
    if (category) query.category = category;

    const streams = await Stream.find(query)
      .populate('streamer', 'username profile.displayName profile.avatarUrl')
      .sort({ viewerCount: -1 })
      .lean();

    res.json({ success: true, streams });
  } catch (err) { next(err); }
});

// GET /api/streams/:id
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const stream = await Stream.findById(req.params.id)
      .populate('streamer', 'username profile.displayName profile.avatarUrl');
    if (!stream) return next(new NotFoundError('Stream'));

    const safeStream = stream.toObject();
    delete safeStream.liveSession; // Never expose session state to frontend

    res.json({ success: true, stream: safeStream });
  } catch (err) { next(err); }
});

module.exports = router;
