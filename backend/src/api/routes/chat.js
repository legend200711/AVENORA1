/**
 * Avenora Chat — REST API Routes
 *
 * GET    /api/chat/rooms                       — list public rooms
 * GET    /api/chat/rooms/:roomId/history       — recent message history for a room
 * DELETE /api/chat/messages/:id               — delete own message (or moderator)
 * POST   /api/chat/messages/:id/report        — report a public chat message
 * POST   /api/chat/users/:userId/block        — block a user (stored in session; enforced in socket)
 * POST   /api/chat/users/:userId/unblock      — unblock a user
 * GET    /api/chat/blocks                     — list blocked user IDs for current user
 */

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const { NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const Report = require('../../models/Report');
const User   = require('../../models/User');
const logger = require('../../utils/logger');

// Public room definitions — extend as needed
const PUBLIC_ROOMS = [
  { id: 'general', name: 'General', description: 'Main community chat', type: 'public' },
  { id: 'music', name: 'Music Talk', description: 'Music discussion', type: 'public' },
  { id: 'gaming', name: 'Gaming Lounge', description: 'Games & Arcade', type: 'public' },
  { id: 'streams', name: 'Streams Hub', description: 'Live stream talk', type: 'public' },
  { id: 'chill', name: 'Chill Zone', description: 'Relax and chat', type: 'public' },
];

const VALID_ROOM_IDS = new Set(PUBLIC_ROOMS.map(r => r.id));

// GET /api/chat/rooms
router.get('/rooms', (req, res) => {
  res.json({ success: true, rooms: PUBLIC_ROOMS });
});

// GET /api/chat/rooms/:roomId/history — last 50 messages
router.get('/rooms/:roomId/history', optionalAuth, async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!VALID_ROOM_IDS.has(roomId)) {
      return res.status(404).json({ error: true, message: 'Room not found' });
    }

    let ChatMessage;
    try {
      ChatMessage = require('../../models/ChatMessage');
    } catch {
      return res.json({ success: true, messages: [] });
    }

    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const messages = await ChatMessage.find({ roomId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'username profile.displayName profile.avatarUrl')
      .lean();

    // Return in chronological order (oldest first for display)
    res.json({
      success: true,
      messages: messages.reverse().map(m => ({
        id: m._id,
        roomId: m.roomId,
        author: m.author
          ? { id: m.author._id, username: m.author.username }
          : { id: null, username: m.authorUsername || 'Guest' },
        content: m.content,
        timestamp: m.createdAt,
        isSystem: m.isSystem || false,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/messages/:id/report — report a public chat message
router.post('/messages/:id/report', authenticate, async (req, res, next) => {
  try {
    let ChatMessage;
    try { ChatMessage = require('../../models/ChatMessage'); } catch {
      return res.status(501).json({ error: true, message: 'Not available.' });
    }

    const msg = await ChatMessage.findById(req.params.id);
    if (!msg || msg.isDeleted) return res.status(404).json({ error: true, message: 'Message not found.' });

    const { reason = 'other', details } = req.body;

    // Record report
    await Report.create({
      reporter:   req.user.id,
      targetType: 'message',
      targetId:   msg._id,
      reason:     ['spam','harassment','hate_speech','misinformation','nsfw','violence','other'].includes(reason) ? reason : 'other',
      details:    details?.slice(0, 500),
    });

    // Flag the message
    if (!msg.reportedBy.map(id => id.toString()).includes(req.user.id)) {
      msg.reportedBy.push(req.user.id);
      await msg.save();
    }

    res.json({ success: true, message: 'Message reported.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/users/:userId/block — block a user from your chat experience
router.post('/users/:userId/block', authenticate, async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: true, message: 'You cannot block yourself.' });
    }
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { 'chat.blockedUsers': req.params.userId },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/users/:userId/unblock
router.post('/users/:userId/unblock', authenticate, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { 'chat.blockedUsers': req.params.userId },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/blocks — list blocked user IDs for current user
router.get('/blocks', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('chat.blockedUsers').lean();
    res.json({ success: true, blockedUsers: user?.chat?.blockedUsers || [] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/chat/messages/:id — delete message (owner or moderator)
router.delete('/messages/:id', authenticate, async (req, res, next) => {
  try {
    let ChatMessage;
    try { ChatMessage = require('../../models/ChatMessage'); } catch {
      return res.status(501).json({ error: true, message: 'Message persistence not available' });
    }

    const msg = await ChatMessage.findById(req.params.id);
    if (!msg || msg.isDeleted) return next(new NotFoundError('Message'));

    const isOwner = msg.author?.toString() === req.user.id;
    const isMod = ['moderator', 'founder', 'admin'].includes(req.user.role);
    if (!isOwner && !isMod) return next(new ForbiddenError());

    msg.isDeleted = true;
    await msg.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
