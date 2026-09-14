/**
 * Inbox Route — Avenora Chat
 *
 * GET /api/inbox          — aggregated inbox (DMs + room invites + join-request updates)
 * GET /api/inbox/unread   — total unread count across all conversations
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const Conversation  = require('../../models/Conversation');
const Notification  = require('../../models/Notification');
const PrivateRoom   = require('../../models/PrivateRoom');
const logger = require('../../utils/logger');

// GET /api/inbox — full inbox for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    // 1. DM conversations — sorted by last message
    const convos = await Conversation.find({
      'participants.userId': req.user.id,
      isDeleted: false,
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate('participants.userId', 'username profile.displayName profile.avatarUrl')
      .lean();

    const conversations = convos.map(convo => {
      const me    = convo.participants.find(p => p.userId?._id?.toString() === req.user.id || p.userId?.toString() === req.user.id);
      const other = convo.participants.find(p => p.userId?._id?.toString() !== req.user.id && p.userId?.toString() !== req.user.id);
      return {
        id: convo._id,
        type: convo.type,
        otherUser: other?.userId ? {
          id:        other.userId._id || other.userId,
          username:  other.userId.username,
          avatarUrl: other.userId.profile?.avatarUrl,
        } : null,
        groupName:    convo.groupName,
        groupIconUrl: convo.groupIconUrl,
        lastMessage:  convo.lastMessage,
        unreadCount:  me?.unreadCount || 0,
        updatedAt:    convo.updatedAt,
      };
    });

    // 2. Room notifications (invites, join-request updates)
    const roomNotifs = await Notification.find({
      recipient: req.user.id,
      type: { $in: ['room_invite', 'room_join_request', 'room_join_approved', 'room_join_rejected'] },
      isRead: false,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('sender', 'username profile.avatarUrl')
      .populate('room', 'name iconUrl')
      .lean();

    // 3. My private rooms with pending join requests (for room owners/mods)
    const myRooms = await PrivateRoom.find({
      'members.userId': req.user.id,
      isDeleted: false,
      isArchived: false,
    }).lean();

    const pendingRequests = [];
    for (const room of myRooms) {
      const myEntry = room.members.find(m => m.userId?.toString() === req.user.id);
      if (!['owner', 'moderator'].includes(myEntry?.role)) continue;
      const pending = room.joinRequests.filter(jr => jr.status === 'pending');
      if (pending.length) {
        pendingRequests.push({ roomId: room._id, roomName: room.name, pendingCount: pending.length });
      }
    }

    // 4. Unread DM total
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    res.json({
      success: true,
      conversations,
      roomNotifications: roomNotifs.map(n => ({
        id: n._id,
        type: n.type,
        room: n.room ? { id: n.room._id, name: n.room.name, iconUrl: n.room.iconUrl } : null,
        sender: n.sender ? { username: n.sender.username, avatarUrl: n.sender.profile?.avatarUrl } : null,
        message: n.message,
        createdAt: n.createdAt,
      })),
      pendingJoinRequests: pendingRequests,
      totalUnread,
    });
  } catch (err) {
    logger.error('[inbox] error:', err.message);
    res.status(500).json({ error: true, message: 'Could not load inbox.' });
  }
});

// GET /api/inbox/unread — quick unread count
router.get('/unread', authenticate, async (req, res) => {
  try {
    const result = await Conversation.aggregate([
      {
        $match: {
          'participants.userId': { $in: [require('mongoose').Types.ObjectId.createFromHexString(req.user.id)] },
          isDeleted: false,
        },
      },
      { $unwind: '$participants' },
      { $match: { 'participants.userId': require('mongoose').Types.ObjectId.createFromHexString(req.user.id) } },
      { $group: { _id: null, total: { $sum: '$participants.unreadCount' } } },
    ]);

    // Also count unread room notifications
    const notifCount = await Notification.countDocuments({
      recipient: req.user.id,
      type: { $in: ['room_invite', 'room_join_approved', 'room_join_rejected'] },
      isRead: false,
    });

    const dmUnread = result[0]?.total || 0;
    res.json({ success: true, unread: dmUnread + notifCount });
  } catch (err) {
    logger.error('[inbox] unread error:', err.message);
    res.json({ success: true, unread: 0 });
  }
});

module.exports = router;
