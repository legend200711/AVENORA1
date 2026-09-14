/**
 * FounderTheme Model
 * Stores founder-controlled site-wide visual themes.
 * Each document is one snapshot; "published" = the live theme.
 * All writes are restricted server-side to founder/admin role.
 */

const mongoose = require('mongoose');

// ── Design token schema ────────────────────────────────────
const colorGroupSchema = new mongoose.Schema({
  bgPrimary:        { type: String, default: '#090807' },
  bgSecondary:      { type: String, default: '#171513' },
  bgCard:           { type: String, default: '#131210' },
  bgElevated:       { type: String, default: '#1e1b17' },
  textPrimary:      { type: String, default: '#eee4cf' },
  textSecondary:    { type: String, default: '#b0a08a' },
  textMuted:        { type: String, default: '#6b5e4e' },
  accent:           { type: String, default: '#b8954b' },
  accentDim:        { type: String, default: '#76552f' },
  buttonBg:         { type: String, default: '#b8954b' },
  buttonText:       { type: String, default: '#090807' },
  borderSubtle:     { type: String, default: 'rgba(184,149,75,0.12)' },
  borderAccent:     { type: String, default: 'rgba(184,149,75,0.28)' },
  textLink:         { type: String, default: '#b8954b' },
  success:          { type: String, default: '#4a9e72' },
  warning:          { type: String, default: '#b87040' },
  error:            { type: String, default: '#c0394a' },
  emerald:          { type: String, default: '#21483c' },
  violet:           { type: String, default: '#30213f' },
}, { _id: false });

const typographySchema = new mongoose.Schema({
  fontHeading:      { type: String, default: "'Cinzel', 'Rajdhani', serif" },
  fontBody:         { type: String, default: "-apple-system, 'Segoe UI', system-ui, sans-serif" },
  fontMono:         { type: String, default: "'JetBrains Mono', 'Fira Code', monospace" },
  baseFontSize:     { type: String, default: '15px' },
  headingWeight:    { type: String, default: '700' },
  bodyWeight:       { type: String, default: '400' },
  letterSpacing:    { type: String, default: 'normal' },
  lineHeight:       { type: String, default: '1.6' },
  headingStyle:     { type: String, default: 'egyptian', enum: ['egyptian', 'modern', 'serif', 'minimal'] },
}, { _id: false });

const atmosphereSchema = new mongoose.Schema({
  gothicIntensity:   { type: String, default: 'standard', enum: ['subtle', 'standard', 'intense'] },
  goldIntensity:     { type: Number, default: 50, min: 0, max: 100 },
  bronzeIntensity:   { type: Number, default: 50, min: 0, max: 100 },
  emeraldAccent:     { type: Boolean, default: true },
  violetAccent:      { type: Boolean, default: false },
  bgTexture:         { type: String, default: 'none', enum: ['none', 'subtle-grain', 'stone', 'papyrus'] },
  starsEnabled:      { type: Boolean, default: true },
  starsIntensity:    { type: Number, default: 60, min: 0, max: 100 },
  fogEnabled:        { type: Boolean, default: true },
  fogIntensity:      { type: Number, default: 30, min: 0, max: 100 },
  shadowIntensity:   { type: Number, default: 50, min: 0, max: 100 },
  borderStyle:       { type: String, default: 'gold', enum: ['none', 'subtle', 'gold', 'ornate'] },
  pyramidDecor:      { type: Boolean, default: false },
  scarabDecor:       { type: Boolean, default: false },
  ankhDecor:         { type: Boolean, default: false },
  eyeOfHorusDecor:   { type: Boolean, default: false },
}, { _id: false });

const motionSchema = new mongoose.Schema({
  animationIntensity: { type: String, default: 'normal', enum: ['none', 'reduced', 'normal', 'full'] },
  transitionSpeed:    { type: String, default: 'normal', enum: ['slow', 'normal', 'fast'] },
  particlesEnabled:   { type: Boolean, default: true },
  ambientMovement:    { type: Boolean, default: true },
  hoverEffects:       { type: Boolean, default: true },
  reducedMotionRespect: { type: Boolean, default: true },
}, { _id: false });

const themeTokensSchema = new mongoose.Schema({
  colors:      { type: colorGroupSchema,  default: () => ({}) },
  typography:  { type: typographySchema,  default: () => ({}) },
  atmosphere:  { type: atmosphereSchema,  default: () => ({}) },
  motion:      { type: motionSchema,      default: () => ({}) },
}, { _id: false });

// ── Main document ──────────────────────────────────────────
const founderThemeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },

  presetKey: {
    type: String,
    trim: true,
    default: null,
    // e.g. 'gothic-egyptian', 'obsidian-gold', etc.
  },

  tokens: {
    type: themeTokensSchema,
    default: () => ({}),
  },

  // Lifecycle state
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  },

  publishedAt: { type: Date, default: null },

  // Authorship — stored as uid string (no populated join needed)
  createdBy: {
    uid:      { type: String, required: true },
    username: { type: String, required: true },
  },

  publishedBy: {
    uid:      { type: String, default: null },
    username: { type: String, default: null },
  },

  // Snapshot of the previously-live theme at publish time (for rollback)
  previousPublishedId: { type: mongoose.Schema.Types.ObjectId, ref: 'FounderTheme', default: null },

  // Free-text notes (founder only)
  notes: { type: String, maxlength: 500, default: '' },
}, {
  timestamps: true,   // createdAt + updatedAt
});

// Only one document should have status='published' at a time.
founderThemeSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model('FounderTheme', founderThemeSchema);
