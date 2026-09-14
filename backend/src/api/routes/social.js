/**
 * Follow Routes - Avenora
 * POST   /api/social/follow/:userId     - Follow a user
 * DELETE /api/social/follow/:userId     - Unfollow a user
 * GET    /api/social/followers/:userId  - List followers
 * GET    /api/social/following/:userId  - List following
 * GET    /api/social/follow/status/:userId - Check if current user follows target
 */

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const Follow = require('../../models/Follow');
const User = require('../../models/User');
const { createNotification } = require('../../services/notification/notificationService');
const { NotFoundError, ForbiddenError, AppError } = require('../middleware/errorHandler');

// POST /follow/:userId - Follow
router.post('/follow/:userId', authenticate, async (req, res, next) => {
  try {
    const targetId = req.params.userId;

    if (targetId === req.user.id) {
      return next(new AppError('You cannot follow yourself', 422, 'SELF_FOLLOW'));
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) return next(new NotFoundError('User'));

    // Upsert — idempotent
    const existing = await Follow.findOne({ follower: req.user.id, following: targetId });
    if (existing) {
      return res.json({ success: true, following: true, message: 'Already following' });
    }

    await Follow.create({ follower: req.user.id, following: targetId });

    // Update denormalized counters
    await Promise.all([
      User.findByIdAndUpdate(req.user.id, { $inc: { 'stats.followingCount': 1 } }),
      User.findByIdAndUpdate(targetId, { $inc: { 'stats.followersCount': 1 } }),
    ]);

    // Notify the followed user
    await createNotification({
      recipient: targetId,
      sender: req.user.id,
      type: 'follow',
      message: `${req.user.username} started following you`,
    });

    res.status(201).json({ success: true, following: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /follow/:userId - Unfollow
router.delete('/follow/:userId', authenticate, async (req, res, next) => {
  try {
    const targetId = req.params.userId;

    if (targetId === req.user.id) {
      return next(new AppError('You cannot unfollow yourself', 422, 'SELF_UNFOLLOW'));
    }

    const result = await Follow.findOneAndDelete({ follower: req.user.id, following: targetId });

    if (result) {
      await Promise.all([
        User.findByIdAndUpdate(req.user.id, { $inc: { 'stats.followingCount': -1 } }),
        User.findByIdAndUpdate(targetId, { $inc: { 'stats.followersCount': -1 } }),
      ]);
    }

    res.json({ success: true, following: false });
  } catch (err) {
    next(err);
  }
});

// GET /followers/:userId - List followers of a user
router.get('/followers/:userId', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const skip = (page - 1) * limit;

    const follows = await Follow.find({ following: req.params.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('follower', 'username profile.displayName profile.avatarUrl role')
      .lean();

    const users = follows.map(f => f.follower);
    res.json({ success: true, users, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /following/:userId - List who a user follows
router.get('/following/:userId', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const skip = (page - 1) * limit;

    const follows = await Follow.find({ follower: req.params.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('following', 'username profile.displayName profile.avatarUrl role')
      .lean();

    const users = follows.map(f => f.following);
    res.json({ success: true, users, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /follow/status/:userId - Is current user following target?
router.get('/follow/status/:userId', authenticate, async (req, res, next) => {
  try {
    const exists = await Follow.exists({ follower: req.user.id, following: req.params.userId });
    res.json({ success: true, following: !!exists });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
