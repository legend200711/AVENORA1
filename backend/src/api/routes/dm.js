/**
 * Direct Message Routes — Avenora Chat
 *
 * GET    /api/dm                             — list my conversations (inbox)
 * POST   /api/dm                             — get-or-create DM with a user
 * GET    /api/dm/:conversationId             — conversation detail
 * GET    /api/dm/:conversationId/messages    — paginated message history
 * POST   /api/dm/:conversationId/messages    — send a message
 * DELETE /api/dm/:conversationId/messages/:msgId — soft-delete own message
 * POST   /api/dm/:conversationId/read        — mark all as read
 * POST   /api/dm/:conversationId/mute        — mute notifications for this convo
 * POST   /api/dm/:conversationId/block       — block the other participant
 * POST   /api/dm/:conversationId/unblock     — unblock
 * POST   /api/dm/:conversationId/report      — report a message in this convo
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const Conversation  = require('../../models/Conversation');
const DirectMessage = require('../../models/DirectMessage');
const Notification  = require('../../models/Notification');
const User          = require('../../models/User');
const logger = require('../../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────

function _serializeConvo(convo, myId) {
  const other = convo.participants.find(p => p.userId?._id?.toString() !== myId && p.userId?.toString() !== myId);
  const me    = convo.participants.find(p => p.userId?._id?.toString() === myId || p.userId?.toString() === myId);
  return {
    id: convo._id,
    type: convo.type,
    // For DMs, expose the other participant as the "display" info
    otherUser: other?.userId ? {
      id:        other.userId._id || other.userId,
      username:  other.userId.username,
      avatarUrl: other.userId.profile?.avatarUrl,
    } : null,
    groupName:    convo.groupName,
    groupIconUrl: convo.groupIconUrl,
    lastMessage:  convo.lastMessage,
    unreadCount:  me?.unreadCount || 0,
    isMuted:      me?.mutedUntil ? new Date(me.mutedUntil) > new Date() : false,
    isBlocked:    me?.isBlocked || false,
    updatedAt:    convo.updatedAt,
  };
}

function _serializeMsg(m) {
  return {
    id: m._id,
    conversationId: m.conversationId,
    sender: m.sender?.username
      ? { id: m.sender._id, username: m.sender.username, avatarUrl: m.sender.profile?.avatarUrl }
      : { id: m.sender, username: m.senderUsername },
    content: m.content,
    replyTo: m.replyTo ? { id: m.replyTo._id, preview: m.replyTo.content?.slice(0, 100) } : null,
    readBy: m.readBy,
    createdAt: m.createdAt,
    isDeleted: m.isDeleted,
  };
}

// Assert caller is a participant; returns participant entry or sends 403
function _assertParticipant(convo, userId, res) {
  const p = convo.participants.find(p => p.userId?.toString() === userId || p.userId?._id?.toString() === userId);
  if (!p) {
    res.status(403).json({ error: true, message: 'This conversation is unavailable.' });
    return null;
  }
  return p;
}

// ─── List my conversations ────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const convos = await Conversation.find({
      'participants.userId': req.user.id,
      isDeleted: false,
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate('participants.userId', 'username profile.displayName profile.avatarUrl')
      .lean();

    res.json({ success: true, conversations: convos.map(c => _serializeConvo(c, req.user.id)) });
  } catch (err) {
    logger.error('[dm] list error:', err.message);
    res.status(500).json({ error: true, message: 'Could not load conversations.' });
  }
});

// ─── Get or create DM ────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { username, userId } = req.body;
    let target;
    if (username) {
      target = await User.findOne({ username });
    } else if (userId) {
      target = await User.findById(userId);
    }
    if (!target) return res.status(404).json({ error: true, message: 'User not found.' });
    if (target._id.toString() === req.user.id) {
      return res.status(400).json({ error: true, message: 'You cannot message yourself.' });
    }

    const { conversation } = await Conversation.getOrCreateDM(req.user.id, target._id);

    // Populate for serialization
    const populated = await Conversation.findById(conversation._id)
      .populate('participants.userId', 'username profile.displayName profile.avatarUrl');

    res.json({ success: true, conversation: _serializeConvo(populated, req.user.id) });
  } catch (err) {
    logger.error('[dm] getOrCreate error:', err.message);
    res.status(500).json({ error: true, message: 'Could not open conversation.' });
  }
});

// ─── Conversation detail ─────────────────────────────────────────
router.get('/:conversationId', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false })
      .populate('participants.userId', 'username profile.displayName profile.avatarUrl');
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });
    if (!_assertParticipant(convo, req.user.id, res)) return;

    res.json({ success: true, conversation: _serializeConvo(convo, req.user.id) });
  } catch (err) {
    logger.error('[dm] detail error:', err.message);
    res.status(500).json({ error: true, message: 'This conversation is unavailable.' });
  }
});

// ─── Message history ─────────────────────────────────────────────
router.get('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false });
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });
    if (!_assertParticipant(convo, req.user.id, res)) return;

    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const before = req.query.before;

    const filter = { conversationId: req.params.conversationId };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await DirectMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'username profile.avatarUrl')
      .populate('replyTo', 'content senderUsername')
      .lean();

    res.json({ success: true, messages: messages.reverse().map(_serializeMsg) });
  } catch (err) {
    logger.error('[dm] history error:', err.message);
    res.status(500).json({ error: true, message: 'Could not load messages.' });
  }
});

// ─── Send message ─────────────────────────────────────────────────
router.post('/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false });
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });

    const me = _assertParticipant(convo, req.user.id, res);
    if (!me) return;

    // Check if blocked by the other participant
    const other = convo.participants.find(p => p.userId?.toString() !== req.user.id);
    if (other?.isBlocked) {
      return res.status(403).json({ error: true, message: 'Your message could not be sent.' });
    }

    const { content, replyToId } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: true, message: 'Message content is required.' });

    const msg = await DirectMessage.create({
      conversationId: convo._id,
      sender: req.user.id,
      senderUsername: req.user.username,
      content: content.trim().slice(0, 4000),
      replyTo: replyToId || undefined,
      readBy: [{ userId: req.user.id, readAt: new Date() }],
    });

    // Update conversation lastMessage + unread counts
    convo.lastMessage = { content: content.slice(0, 100), senderId: req.user.id, sentAt: new Date() };
    convo.participants.forEach(p => {
      if (p.userId?.toString() !== req.user.id) {
        p.unreadCount = (p.unreadCount || 0) + 1;
      }
    });
    convo.updatedAt = new Date();
    await convo.save();

    // Populate for response
    const populated = await DirectMessage.findById(msg._id)
      .populate('sender', 'username profile.avatarUrl').lean();

    const serialized = _serializeMsg(populated);

    // Real-time delivery
    const io = global.socketIo;
    if (io) {
      convo.participants.forEach(p => {
        const pid = p.userId?.toString() || p.userId;
        io.to(`user:${pid}`).emit('dm:message', serialized);
      });
    }

    // Notification (don't notify sender)
    if (other && !other.mutedUntil) {
      const otherId = other.userId?.toString() || other.userId;
      await Notification.create({
        recipient: otherId,
        sender: req.user.id,
        type: 'dm',
        conversation: convo._id,
        message: `${req.user.username} sent you a message`,
      }).catch(() => {});
    }

    res.status(201).json({ success: true, message: serialized });
  } catch (err) {
    logger.error('[dm] send error:', err.message);
    res.status(500).json({ error: true, message: 'Your message could not be sent.' });
  }
});

// ─── Delete own message ──────────────────────────────────────────
router.delete('/:conversationId/messages/:msgId', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false });
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });
    if (!_assertParticipant(convo, req.user.id, res)) return;

    const msg = await DirectMessage.findOne({ _id: req.params.msgId, conversationId: convo._id });
    if (!msg) return res.status(404).json({ error: true, message: 'Message not found.' });
    if (msg.sender?.toString() !== req.user.id) {
      return res.status(403).json({ error: true, message: 'You can only delete your own messages.' });
    }

    msg.isDeleted = true;
    msg.deletedBy = req.user.id;
    await msg.save();

    // Real-time
    const io = global.socketIo;
    if (io) {
      convo.participants.forEach(p => {
        io.to(`user:${p.userId?.toString()}`).emit('dm:message_deleted', { messageId: msg._id, conversationId: convo._id });
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[dm] delete msg error:', err.message);
    res.status(500).json({ error: true, message: 'Could not delete message.' });
  }
});

// ─── Mark as read ─────────────────────────────────────────────────
router.post('/:conversationId/read', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false });
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });

    const me = _assertParticipant(convo, req.user.id, res);
    if (!me) return;

    me.unreadCount = 0;
    me.lastReadAt  = new Date();
    await convo.save();

    // Mark messages as read in DB
    await DirectMessage.updateMany(
      { conversationId: convo._id, 'readBy.userId': { $ne: req.user.id } },
      { $push: { readBy: { userId: req.user.id, readAt: new Date() } } }
    );

    // Real-time — notify other participant that messages are read
    const io = global.socketIo;
    if (io) {
      convo.participants.forEach(p => {
        const pid = p.userId?.toString();
        if (pid !== req.user.id) {
          io.to(`user:${pid}`).emit('dm:read', { conversationId: convo._id, readBy: req.user.id });
        }
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[dm] read error:', err.message);
    res.status(500).json({ error: true, message: 'Could not mark as read.' });
  }
});

// ─── Mute conversation ────────────────────────────────────────────
router.post('/:conversationId/mute', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false });
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });
    const me = _assertParticipant(convo, req.user.id, res);
    if (!me) return;

    const hours = parseInt(req.body.hours) || 24;
    me.mutedUntil = req.body.mute === false ? null : new Date(Date.now() + hours * 3600 * 1000);
    await convo.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[dm] mute error:', err.message);
    res.status(500).json({ error: true, message: 'Could not update mute settings.' });
  }
});

// ─── Block / Unblock ──────────────────────────────────────────────
router.post('/:conversationId/block', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false });
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });
    const me = _assertParticipant(convo, req.user.id, res);
    if (!me) return;
    me.isBlocked = true;
    await convo.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[dm] block error:', err.message);
    res.status(500).json({ error: true, message: 'Could not block user.' });
  }
});

router.post('/:conversationId/unblock', authenticate, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.conversationId, isDeleted: false });
    if (!convo) return res.status(404).json({ error: true, message: 'This conversation is unavailable.' });
    const me = _assertParticipant(convo, req.user.id, res);
    if (!me) return;
    me.isBlocked = false;
    await convo.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[dm] unblock error:', err.message);
    res.status(500).json({ error: true, message: 'Could not unblock user.' });
  }
});

module.exports = router;
