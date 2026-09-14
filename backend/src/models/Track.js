/**
 * Track Model — Avenora Music Hub
 * Represents a single audio track in the music library.
 * Audio files are stored in object storage (R2/S3); fileUrl is the CDN URL.
 */

const mongoose = require('mongoose');

const trackSchema = new mongoose.Schema({
  title:       { type: String, required: true, maxlength: 300, trim: true },
  artist:      { type: mongoose.Schema.Types.ObjectId, ref: 'Artist' },
  artistName:  { type: String, maxlength: 200, trim: true },   // denormalized for fast queries
  album:       { type: mongoose.Schema.Types.ObjectId, ref: 'Album' },
  albumTitle:  { type: String, maxlength: 300, trim: true },
  uploader:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Audio file
  fileUrl:       { type: String },   // CDN / R2 URL — empty until storage connected
  fileSize:      { type: Number },   // bytes
  mimeType:      { type: String },
  duration:      { type: Number },   // seconds
  waveformData:  { type: [Number] }, // normalised amplitude values for visualiser

  // Artwork
  coverUrl: { type: String },

  // Metadata
  genre:       { type: String, maxlength: 80, trim: true },
  releaseDate: { type: Date },
  trackNumber: { type: Number },
  bpm:         { type: Number },
  key:         { type: String, maxlength: 10 },
  description: { type: String, maxlength: 2000, trim: true },
  tags:        [{ type: String, maxlength: 50 }],

  // Access
  visibility: {
    type: String,
    enum: ['public', 'unlisted', 'private'],
    default: 'public',
  },
  isPublished: { type: Boolean, default: false },
  isDeleted:   { type: Boolean, default: false },

  // Engagement
  plays:     { type: Number, default: 0 },
  likedBy:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isFlagged: { type: Boolean, default: false },
}, {
  timestamps: true,
});

trackSchema.index({ uploader: 1, createdAt: -1 });
trackSchema.index({ genre: 1, createdAt: -1 });
trackSchema.index({ visibility: 1, isPublished: 1 });
trackSchema.index({ title: 'text', artistName: 'text', albumTitle: 'text', genre: 'text' });

const Track = mongoose.model('Track', trackSchema);
module.exports = Track;
