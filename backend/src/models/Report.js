/**
 * Report Model - Avenora Moderation
 * Tracks reports on posts, comments, and users.
 */

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: {
    type: String,
    enum: ['post', 'comment', 'user', 'message', 'dm_message'],
    required: true,
  },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: {
    type: String,
    enum: ['spam', 'harassment', 'hate_speech', 'misinformation', 'nsfw', 'violence', 'other'],
    required: true,
  },
  details: { type: String, maxlength: 500 },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'actioned', 'dismissed'],
    default: 'pending',
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNote: { type: String, maxlength: 500 },
  reviewedAt: { type: Date },
}, {
  timestamps: true,
});

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, targetId: 1, targetType: 1 });
reportSchema.index({ targetId: 1, targetType: 1 });

const Report = mongoose.model('Report', reportSchema);
module.exports = Report;
