/**
 * Notification Service - Avenora
 * Creates notifications and emits real-time events via Socket.io when available.
 */

const Notification = require('../../models/Notification');
const logger = require('../../utils/logger');

/**
 * Create a notification. Silently swallows errors so a notification failure
 * never breaks the main operation that triggered it.
 */
async function createNotification({ recipient, sender, type, post, comment, message }) {
  // Never notify yourself
  if (recipient.toString() === sender.toString()) return null;

  try {
    const notif = await Notification.create({
      recipient,
      sender,
      type,
      post: post || undefined,
      comment: comment || undefined,
      message: message || buildMessage(type),
    });

    // Emit real-time via Socket.io if the server is available
    const io = global.socketIo;
    if (io) {
      const populated = await Notification.findById(notif._id)
        .populate('sender', 'username profile.displayName profile.avatarUrl')
        .lean();
      io.to(`user:${recipient.toString()}`).emit('notification:new', populated);
    }

    return notif;
  } catch (err) {
    logger.warn('Failed to create notification:', err.message);
    return null;
  }
}

function buildMessage(type) {
  const map = {
    follow: 'started following you',
    like: 'liked your post',
    comment: 'commented on your post',
    repost: 'reposted your post',
    mention: 'mentioned you',
    report_resolved: 'A report you submitted has been reviewed',
  };
  return map[type] || 'interacted with your content';
}

module.exports = { createNotification };
