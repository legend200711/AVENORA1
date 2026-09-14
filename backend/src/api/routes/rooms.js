/**
 * Private Room Routes — Avenora Chat
 *
 * POST   /api/rooms                          — create a room
 * GET    /api/rooms                          — list rooms I'm a member of
 * GET    /api/rooms/discover                 — list public rooms (paginated)
 * GET    /api/rooms/:roomId                  — get room info (members-only or public)
 * PATCH  /api/rooms/:roomId                  — update room (owner/mod)
 * DELETE /api/rooms/:roomId                  — archive room (owner)
 *
 * POST   /api/rooms/:roomId/invite           — invite a user (owner/mod)
 * POST   /api/rooms/:roomId/join             — request to join / directly join public room
 * POST   /api/rooms/:roomId/join-requests/:uid/approve — approve join request (owner/mod)
 * POST   /api/rooms/:roomId/join-requests/:uid/reject  — reject join request (owner/mod)
 * DELETE /api/rooms/:roomId/members/:uid     — remove member (owner/mod)
 * POST   /api/rooms/:roomId/ban/:uid         — ban a user (owner/mod)
 * DELETE /api/rooms/:roomId/ban/:uid         — unban a user (owner)
 * POST   /api/rooms/:roomId/mute/:uid        — mute a member (owner/mod)
 *
 * GET    /api/rooms/:roomId/history          — paginated message history
 */

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const PrivateRoom = require('../../models/PrivateRoom');
const ChatMessage = require('../../models/ChatMessage');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const logger = require('../../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────

function forbidden(res, msg = 'You do not have access to this room.') {
  return res.status(403).json({ error: true, message: msg });
}
function notFound(res) {
  return res.status(404).json({ error: true, message: 'Room not found.' });
}
function requireMembership(room, userId, res) {
  if (!room.isMember(userId)) { forbidden(res); return false; }
  return true;
}
function requireOwnerOrMod(room, userId, res) {
  const role = room.getRole(userId);
  if (!['owner', 'moderator'].includes(role)) { forbidden(res, 'Moderator or owner required.'); return false; }
  return true;
}

// Serialize a room for API responses (omit deleted bans & requests detail for non-mods)
function serializeRoom(room, userId) {
  const role = room.getRole(userId?.toString());
  const isMod = ['owner', 'moderator'].includes(role);
  return {
    id: room._id,
    name: room.name,
    description: room.description,
    iconUrl: room.iconUrl,
    visibility: room.visibility,
    owner: room.owner,
    memberCount: room.members.length,
    myRole: role || null,
    isMember: !!role,
    isArchived: room.isArchived,
    createdAt: room.createdAt,
    ...(isMod ? {
      members: room.members,
      joinRequests: room.joinRequests.filter(r => r.status === 'pending'),
      bans: room.bans,
    } : {}),
  };
}

// ─── Create room ─────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, iconUrl, visibility = 'private' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: true, message: 'Room name is required.' });

    const room = await PrivateRoom.create({
      name: name.trim().slice(0, 80),
      description: description?.trim().slice(0, 500),
      iconUrl,
      visibility,
      owner: req.user.id,
      members: [{ userId: req.user.id, role: 'owner' }],
    });

    res.status(201).json({ success: true, room: serializeRoom(room, req.user.id) });
  } catch (err) {
    logger.error('[rooms] create error:', err.message);
    res.status(500).json({ error: true, message: 'Could not create room.' });
  }
});

// ─── My rooms ────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const rooms = await PrivateRoom.find({
      'members.userId': req.user.id,
      isDeleted: false,
    }).sort({ updatedAt: -1 }).limit(100).lean();

    res.json({ success: true, rooms: rooms.map(r => ({
      id: r._id, name: r.name, description: r.description,
      iconUrl: r.iconUrl, visibility: r.visibility,
      memberCount: r.members.length,
      myRole: r.members.find(m => m.userId.toString() === req.user.id)?.role || null,
      isArchived: r.isArchived,
    })) });
  } catch (err) {
    logger.error('[rooms] list error:', err.message);
    res.status(500).json({ error: true, message: 'Could not load rooms.' });
  }
});

// ─── Discover public rooms ────────────────────────────────────────
router.get('/discover', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(30, parseInt(req.query.limit) || 20);
    const q = req.query.q;

    const filter = { visibility: 'public', isDeleted: false, isArchived: false };
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const [rooms, total] = await Promise.all([
      PrivateRoom.find(filter).sort({ 'members.length': -1, updatedAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      PrivateRoom.countDocuments(filter),
    ]);

    res.json({ success: true, rooms: rooms.map(r => ({
      id: r._id, name: r.name, description: r.description,
      iconUrl: r.iconUrl, memberCount: r.members.length,
    })), total, page });
  } catch (err) {
    logger.error('[rooms] discover error:', err.message);
    res.status(500).json({ error: true, message: 'Could not load rooms.' });
  }
});

// ─── Get room detail ─────────────────────────────────────────────
router.get('/:roomId', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);

    // Public rooms are visible to all; private/invite-only require membership
    if (room.visibility !== 'public' && !room.isMember(req.user.id)) {
      return forbidden(res);
    }

    res.json({ success: true, room: serializeRoom(room, req.user.id) });
  } catch (err) {
    logger.error('[rooms] get error:', err.message);
    res.status(500).json({ error: true, message: 'Could not load room.' });
  }
});

// ─── Update room ─────────────────────────────────────────────────
router.patch('/:roomId', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (!requireOwnerOrMod(room, req.user.id, res)) return;

    const { name, description, iconUrl, visibility } = req.body;
    if (name !== undefined) room.name = name.trim().slice(0, 80);
    if (description !== undefined) room.description = description.trim().slice(0, 500);
    if (iconUrl !== undefined) room.iconUrl = iconUrl;
    if (visibility !== undefined && room.getRole(req.user.id) === 'owner') {
      room.visibility = visibility;
    }
    await room.save();
    res.json({ success: true, room: serializeRoom(room, req.user.id) });
  } catch (err) {
    logger.error('[rooms] update error:', err.message);
    res.status(500).json({ error: true, message: 'Could not update room.' });
  }
});

// ─── Archive / delete room ───────────────────────────────────────
router.delete('/:roomId', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (room.getRole(req.user.id) !== 'owner' && !['founder','admin'].includes(req.user.role)) {
      return forbidden(res, 'Only the room owner can delete this room.');
    }

    const action = req.query.action || 'archive';
    if (action === 'delete') {
      room.isDeleted = true;
    } else {
      room.isArchived = true;
    }
    await room.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] delete error:', err.message);
    res.status(500).json({ error: true, message: 'Could not remove room.' });
  }
});

// ─── Join room (public: direct; private: request) ────────────────
router.post('/:roomId/join', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false, isArchived: false });
    if (!room) return notFound(res);

    if (room.isBanned(req.user.id)) return forbidden(res, 'You are not permitted to join this room.');
    if (room.isMember(req.user.id)) return res.json({ success: true, message: 'Already a member.' });

    if (room.visibility === 'public') {
      room.members.push({ userId: req.user.id, role: 'member' });
      await room.save();
      return res.json({ success: true, joined: true });
    }

    if (room.visibility === 'invite_only') {
      return forbidden(res, 'This room is invite-only.');
    }

    // Private — create join request
    const existing = room.joinRequests.find(r => r.userId.toString() === req.user.id && r.status === 'pending');
    if (existing) return res.json({ success: true, requested: true });

    room.joinRequests.push({ userId: req.user.id });
    await room.save();

    // Notify room owner
    await _notifyRoomOwner(room, req.user.id, 'room_join_request').catch(() => {});

    res.json({ success: true, requested: true });
  } catch (err) {
    logger.error('[rooms] join error:', err.message);
    res.status(500).json({ error: true, message: 'Could not join room.' });
  }
});

// ─── Invite a user ───────────────────────────────────────────────
router.post('/:roomId/invite', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (!requireOwnerOrMod(room, req.user.id, res)) return;

    const { username } = req.body;
    const target = await User.findOne({ username });
    if (!target) return res.status(404).json({ error: true, message: 'User not found.' });
    if (room.isMember(target._id)) return res.json({ success: true, message: 'Already a member.' });
    if (room.isBanned(target._id)) return res.status(400).json({ error: true, message: 'User is banned from this room.' });

    room.members.push({ userId: target._id, role: 'member' });
    await room.save();

    // Notify invited user
    await Notification.create({
      recipient: target._id,
      sender: req.user.id,
      type: 'room_invite',
      room: room._id,
      message: `You were invited to join "${room.name}"`,
    }).catch(() => {});

    // Real-time
    const io = global.socketIo;
    if (io) io.to(`user:${target._id}`).emit('notification:new', { type: 'room_invite', roomId: room._id, roomName: room.name });

    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] invite error:', err.message);
    res.status(500).json({ error: true, message: 'Could not invite user.' });
  }
});

// ─── Approve / reject join request ───────────────────────────────
router.post('/:roomId/join-requests/:uid/approve', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (!requireOwnerOrMod(room, req.user.id, res)) return;

    const jr = room.joinRequests.find(r => r.userId.toString() === req.params.uid && r.status === 'pending');
    if (!jr) return res.status(404).json({ error: true, message: 'No pending join request found.' });

    jr.status = 'approved';
    if (!room.isMember(jr.userId)) room.members.push({ userId: jr.userId, role: 'member' });
    await room.save();

    await Notification.create({ recipient: jr.userId, sender: req.user.id, type: 'room_join_approved',
      room: room._id, message: `Your request to join "${room.name}" was approved.` }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] approve error:', err.message);
    res.status(500).json({ error: true, message: 'Could not approve request.' });
  }
});

router.post('/:roomId/join-requests/:uid/reject', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (!requireOwnerOrMod(room, req.user.id, res)) return;

    const jr = room.joinRequests.find(r => r.userId.toString() === req.params.uid && r.status === 'pending');
    if (!jr) return res.status(404).json({ error: true, message: 'No pending join request found.' });

    jr.status = 'rejected';
    await room.save();

    await Notification.create({ recipient: jr.userId, sender: req.user.id, type: 'room_join_rejected',
      room: room._id, message: `Your request to join "${room.name}" was not approved.` }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] reject error:', err.message);
    res.status(500).json({ error: true, message: 'Could not reject request.' });
  }
});

// ─── Remove member ───────────────────────────────────────────────
router.delete('/:roomId/members/:uid', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);

    // Allow self-leave, or owner/mod removing others
    const isSelf = req.user.id === req.params.uid;
    if (!isSelf && !requireOwnerOrMod(room, req.user.id, res)) return;
    // Mod cannot remove owner
    if (!isSelf && room.getRole(req.params.uid) === 'owner') {
      return forbidden(res, 'Cannot remove the room owner.');
    }

    room.members = room.members.filter(m => m.userId.toString() !== req.params.uid);
    await room.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] remove member error:', err.message);
    res.status(500).json({ error: true, message: 'Could not remove member.' });
  }
});

// ─── Ban / unban ─────────────────────────────────────────────────
router.post('/:roomId/ban/:uid', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (!requireOwnerOrMod(room, req.user.id, res)) return;
    if (room.getRole(req.params.uid) === 'owner') return forbidden(res, 'Cannot ban the owner.');

    // Remove from members first
    room.members = room.members.filter(m => m.userId.toString() !== req.params.uid);
    if (!room.isBanned(req.params.uid)) {
      room.bans.push({ userId: req.params.uid, reason: req.body.reason, bannedBy: req.user.id });
    }
    await room.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] ban error:', err.message);
    res.status(500).json({ error: true, message: 'Could not ban user.' });
  }
});

router.delete('/:roomId/ban/:uid', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (room.getRole(req.user.id) !== 'owner' && !['founder','admin'].includes(req.user.role)) {
      return forbidden(res, 'Only the room owner can unban users.');
    }
    room.bans = room.bans.filter(b => b.userId.toString() !== req.params.uid);
    await room.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] unban error:', err.message);
    res.status(500).json({ error: true, message: 'Could not unban user.' });
  }
});

// ─── Mute member ─────────────────────────────────────────────────
router.post('/:roomId/mute/:uid', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (!requireOwnerOrMod(room, req.user.id, res)) return;

    const member = room.getMember(req.params.uid);
    if (!member) return res.status(404).json({ error: true, message: 'Member not found.' });

    const minutes = parseInt(req.body.minutes) || 60;
    member.mutedUntil = new Date(Date.now() + minutes * 60 * 1000);
    await room.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('[rooms] mute error:', err.message);
    res.status(500).json({ error: true, message: 'Could not mute member.' });
  }
});

// ─── Room message history ─────────────────────────────────────────
router.get('/:roomId/history', authenticate, async (req, res) => {
  try {
    const room = await PrivateRoom.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) return notFound(res);
    if (!room.isMember(req.user.id)) return forbidden(res);

    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const before = req.query.before; // ISO timestamp for cursor pagination

    const filter = { roomId: req.params.roomId, roomType: 'private', isDeleted: false };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'username profile.displayName profile.avatarUrl')
      .populate('replyTo', 'content authorUsername')
      .lean();

    res.json({
      success: true,
      messages: messages.reverse().map(m => _serializeMessage(m)),
    });
  } catch (err) {
    logger.error('[rooms] history error:', err.message);
    res.status(500).json({ error: true, message: 'Could not load messages.' });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────
function _serializeMessage(m) {
  return {
    id: m._id,
    roomId: m.roomId,
    roomType: m.roomType,
    author: m.author
      ? { id: m.author._id, username: m.author.username, avatarUrl: m.author.profile?.avatarUrl }
      : { id: null, username: m.authorUsername || 'Unknown' },
    content: m.content,
    replyTo: m.replyTo ? { id: m.replyTo._id, preview: m.replyTo.content?.slice(0, 100) } : null,
    timestamp: m.createdAt,
    isSystem: m.isSystem || false,
  };
}

async function _notifyRoomOwner(room, requesterId, type) {
  const message = type === 'room_join_request'
    ? `Someone requested to join "${room.name}"`
    : `New activity in "${room.name}"`;
  await Notification.create({
    recipient: room.owner,
    sender: requesterId,
    type,
    room: room._id,
    message,
  });
  const io = global.socketIo;
  if (io) io.to(`user:${room.owner}`).emit('notification:new', { type, roomId: room._id, roomName: room.name });
}

module.exports = router;
