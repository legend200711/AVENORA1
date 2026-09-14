const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');

// ─── GET /api/search ─────────────────────────────────────────
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, type, page = 1, limit = 20 } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(422).json({ error: true, message: 'Search query must be at least 2 characters' });
    }

    const searchTerm = q.trim().slice(0, 100);
    const regex      = new RegExp(searchTerm, 'i');
    const limitN     = Math.min(50, parseInt(limit) || 20);
    const skip       = (Math.max(1, parseInt(page)) - 1) * limitN;
    const results    = {};

    // Lazy-load models only when needed (avoids circular require issues at startup)
    const User    = require('../../models/User');
    const Post    = require('../../models/Post');
    const Video   = require('../../models/Video');
    const Channel = require('../../models/Channel');

    if (!type || type === 'users') {
      results.users = await User.find({
        $or: [
          { username: regex },
          { 'profile.displayName': regex },
        ],
        'status.isActive': true,
      }).select('username profile.displayName profile.avatarUrl').limit(limitN).lean();
    }

    if (!type || type === 'posts') {
      results.posts = await Post.find({
        content: regex,
        isDeleted: false,
        visibility: 'public',
      }).populate('author', 'username profile.displayName profile.avatarUrl').limit(limitN).lean();
    }

    if (!type || type === 'videos') {
      results.videos = await Video.find({
        $or: [
          { title:       regex },
          { description: regex },
          { tags:        regex },
          { category:    regex },
        ],
        isDeleted:        false,
        isPublished:      true,
        processingStatus: 'ready',
        visibility:       'public',
      })
        .sort({ views: -1 })
        .skip(type === 'video' ? skip : 0)
        .limit(limitN)
        .populate('uploader', 'username profile.displayName profile.avatarUrl')
        .lean();
    }

    if (!type || type === 'channels') {
      results.channels = await Channel.find({
        $or: [
          { name:        regex },
          { description: regex },
        ],
        isSuspended: false,
      })
        .populate('owner', 'username profile.displayName profile.avatarUrl')
        .limit(limitN)
        .lean();
    }

    res.json({ success: true, query: searchTerm, results });
  } catch (err) { next(err); }
});

module.exports = router;
