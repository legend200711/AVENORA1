/**
 * MusicPlayHistory Model — Avenora Music Hub
 * Persists per-user recently-played tracks when the backend is connected.
 */

const mongoose = require('mongoose');

const musicPlayHistorySchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  track:      { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true },
  playedAt:   { type: Date, default: Date.now },
  durationMs: { type: Number }, // how long they actually listened
}, {
  timestamps: false,
});

musicPlayHistorySchema.index({ user: 1, playedAt: -1 });

const MusicPlayHistory = mongoose.model('MusicPlayHistory', musicPlayHistorySchema);
module.exports = MusicPlayHistory;
