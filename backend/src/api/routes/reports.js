/**
 * Reports Routes - Avenora Moderation
 * POST   /api/reports           - Submit a report (authenticated users)
 * GET    /api/reports           - List reports (moderators/founders only)
 * PUT    /api/reports/:id       - Review a report (moderators/founders only)
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireModerator } = require('../middleware/auth');
const Report = require('../../models/Report');
const Post = require('../../models/Post');
const User = require('../../models/User');
const { AppError } = require('../middleware/errorHandler');

const VALID_REASONS = ['spam', 'harassment', 'hate_speech', 'misinformation', 'nsfw', 'violence', 'other'];
const VALID_TYPES = ['post', 'comment', 'user'];

// POST /api/reports - Submit a report
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { targetType, targetId, reason, details } = req.body;

    if (!VALID_TYPES.includes(targetType)) {
      return next(new AppError('Invalid target type', 422, 'INVALID_TARGET_TYPE'));
    }
    if (!VALID_REASONS.includes(reason)) {
      return next(new AppError('Invalid reason', 422, 'INVALID_REASON'));
    }
    if (!targetId) {
      return next(new AppError('Target ID required', 422, 'TARGET_REQUIRED'));
    }

    // Prevent duplicate reports from same user on same target
    const existing = await Report.findOne({
      reporter: req.user.id,
      targetId,
      targetType,
      status: 'pending',
    });
    if (existing) {
      return res.json({ success: true, message: 'Already reported', duplicate: true });
    }

    const report = await Report.create({
      reporter: req.user.id,
      targetType,
      targetId,
      reason,
      details: details?.slice(0, 500),
    });

    // Flag the post/user for quick mod review
    if (targetType === 'post') {
      await Post.findByIdAndUpdate(targetId, {
        $inc: { reportCount: 1 },
        isFlagged: true,
      });
    }

    res.status(201).json({ success: true, report: { id: report._id } });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports - Moderator: list pending reports
router.get('/', authenticate, requireModerator, async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find({ status })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reporter', 'username')
        .populate('reviewedBy', 'username')
        .lean(),
      Report.countDocuments({ status }),
    ]);

    res.json({ success: true, reports, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// PUT /api/reports/:id - Moderator: review a report
router.put('/:id', authenticate, requireModerator, async (req, res, next) => {
  try {
    const { status, reviewNote } = req.body;
    const validStatuses = ['reviewed', 'actioned', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid status', 422));
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewNote: reviewNote?.slice(0, 500),
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      },
      { new: true }
    );

    if (!report) return next(new AppError('Report not found', 404));

    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
