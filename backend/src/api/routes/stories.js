/**
 * Story Routes - Avenora
 * POST   /api/stories          - Create a story (auth required)
 * GET    /api/stories          - List active stories from followed users (+ own)
 * GET    /api/stories/:userId  - Stories for a specific user
 * DELETE /api/stories/:id      - Delete own story
 * POST   /api/stories/:id/view - Mark story as viewed
 */

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const Story = require('../../models/Story');
const Follow = require('../../models/Follow');
const { NotFoundError, ForbiddenError } = require('../middleware/errorHandler');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const STORY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// GET /api/stories - Active stories from followed users
router.get('/', authenticate, async (req, res, next) => {
  try {
    const now = new Date();

    // Get IDs of users the current user follows
    const follows = await Follow.find({ follower: req.user.id }).lean();
    const followingIds = follows.map(f => f.following);

    // Include own stories too
    const authorIds = [req.user.id, ...followingIds];

    const stories = await Story.find({
      author: { $in: authorIds },
      expiresAt: { $gt: now },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .populate('author', 'username profile.displayName profile.avatarUrl')
      .lean();

    // Mark which stories the current user has viewed
    const withViewed = stories.map(s => ({
      ...s,
      viewedByMe: s.viewers.some(v => v.toString() === req.user.id),
      viewCount: s.viewers.length,
    }));

    res.json({ success: true, stories: withViewed });
  } catch (err) {
    next(err);
  }
});

// GET /api/stories/:userId - Stories for a specific user
router.get('/:userId', optionalAuth, async (req, res, next) => {
  try {
    const now = new Date();
    const stories = await Story.find({
      author: req.params.userId,
      expiresAt: { $gt: now },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .populate('author', 'username profile.displayName profile.avatarUrl')
      .lean();

    const currentUserId = req.user?.id;
    const withViewed = stories.map(s => ({
      ...s,
      viewedByMe: currentUserId ? s.viewers.some(v => v.toString() === currentUserId) : false,
      viewCount: s.viewers.length,
    }));

    res.json({ success: true, stories: withViewed });
  } catch (err) {
    next(err);
  }
});

// POST /api/stories - Create a story
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { mediaUrl, mediaType, caption } = req.body;

    if (!mediaUrl) return res.status(422).json({ error: true, message: 'Media URL required' });
    if (!['image', 'video'].includes(mediaType)) {
      return res.status(422).json({ error: true, message: 'mediaType must be image or video' });
    }

    const expiresAt = new Date(Date.now() + STORY_DURATION_MS);

    const story = await Story.create({
      author: req.user.id,
      mediaUrl,
      mediaType,
      caption: caption?.slice(0, 500),
      expiresAt,
    });

    const populated = await Story.findById(story._id)
      .populate('author', 'username profile.displayName profile.avatarUrl');

    res.status(201).json({ success: true, story: populated });
  } catch (err) {
    next(err);
  }
});

// POST /api/stories/:id/view - Mark as viewed
router.post('/:id/view', authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    const story = await Story.findOne({ _id: req.params.id, expiresAt: { $gt: now }, isDeleted: false });
    if (!story) return next(new NotFoundError('Story'));

    if (!story.viewers.includes(req.user.id)) {
      story.viewers.push(req.user.id);
      await story.save();
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/stories/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story || story.isDeleted) return next(new NotFoundError('Story'));

    if (story.author.toString() !== req.user.id) {
      return next(new ForbiddenError());
    }

    story.isDeleted = true;
    await story.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
