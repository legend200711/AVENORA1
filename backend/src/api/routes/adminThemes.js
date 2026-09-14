/**
 * Admin Theme Routes — Founder Theme Control Center
 * All routes require authentication + founder/admin role.
 * Theme data is never exposed to ordinary users.
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireFounder, requireFounderEmail } = require('../middleware/auth');
const FounderTheme = require('../../models/FounderTheme');
const logger = require('../../utils/logger');

// ── All theme routes: must be authenticated, hold founder role,
//    AND be the authorized founder account verified server-side.
router.use(authenticate, requireFounder, requireFounderEmail);

// ── Validation helper ──────────────────────────────────────
const HEX_RE = /^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const RGBA_RE = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*[\d.]+)?\s*\)$/;

function isValidColor(v) {
  if (typeof v !== 'string') return false;
  return HEX_RE.test(v.trim()) || RGBA_RE.test(v.trim());
}

// Only validate fields that are expected to be plain CSS colors.
// rgba() border values are also acceptable.
const COLOR_FIELDS = [
  'bgPrimary','bgSecondary','bgCard','bgElevated',
  'textPrimary','textSecondary','textMuted',
  'accent','accentDim','buttonBg','buttonText',
  'textLink','success','warning','error','emerald','violet',
];

function validateTokens(tokens) {
  if (!tokens || typeof tokens !== 'object') return 'tokens must be an object';
  const { colors } = tokens;
  if (colors && typeof colors === 'object') {
    for (const field of COLOR_FIELDS) {
      if (colors[field] !== undefined && !isValidColor(colors[field])) {
        return `colors.${field} is not a valid CSS color`;
      }
    }
    // borderSubtle / borderAccent may be rgba(…) with alpha — covered by isValidColor
    for (const field of ['borderSubtle', 'borderAccent']) {
      if (colors[field] !== undefined && !isValidColor(colors[field])) {
        return `colors.${field} is not a valid CSS color`;
      }
    }
  }
  const { typography } = tokens;
  if (typography) {
    const allowedHeadingStyles = ['egyptian', 'modern', 'serif', 'minimal'];
    if (typography.headingStyle && !allowedHeadingStyles.includes(typography.headingStyle)) {
      return 'typography.headingStyle is invalid';
    }
    if (typography.baseFontSize) {
      const px = parseFloat(typography.baseFontSize);
      if (isNaN(px) || px < 10 || px > 24) return 'typography.baseFontSize must be 10–24px';
    }
  }
  return null; // valid
}

// ── GET /api/admin/themes — list all themes (newest first) ─
router.get('/', async (req, res, next) => {
  try {
    const themes = await FounderTheme.find({})
      .sort({ updatedAt: -1 })
      .select('-tokens') // lean list; tokens loaded on demand
      .lean();
    res.json({ success: true, themes });
  } catch (err) { next(err); }
});

// ── GET /api/admin/themes/published — current live theme ──
router.get('/published', async (req, res, next) => {
  try {
    const theme = await FounderTheme.findOne({ status: 'published' })
      .sort({ publishedAt: -1 })
      .lean();
    res.json({ success: true, theme: theme || null });
  } catch (err) { next(err); }
});

// ── GET /api/admin/themes/published/tokens ─────────────────
// This endpoint is also exposed without founder-gate via
// /api/themes/published/tokens (see admin.js for that mount).
// The tokens object itself contains only safe CSS values.
router.get('/published/tokens', async (req, res, next) => {
  try {
    const theme = await FounderTheme.findOne({ status: 'published' })
      .sort({ publishedAt: -1 })
      .select('name tokens publishedAt')
      .lean();
    res.json({ success: true, theme: theme ? { name: theme.name, tokens: theme.tokens, publishedAt: theme.publishedAt } : null });
  } catch (err) { next(err); }
});

// ── GET /api/admin/themes/history — published history ──────
router.get('/history', async (req, res, next) => {
  try {
    const history = await FounderTheme.find({ status: { $in: ['published', 'archived'] } })
      .sort({ publishedAt: -1 })
      .limit(50)
      .select('name status publishedAt publishedBy createdAt previousPublishedId')
      .lean();
    res.json({ success: true, history });
  } catch (err) { next(err); }
});

// ── GET /api/admin/themes/:id — single theme with tokens ───
router.get('/:id', async (req, res, next) => {
  try {
    const theme = await FounderTheme.findById(req.params.id).lean();
    if (!theme) return res.status(404).json({ error: true, message: 'Theme not found' });
    res.json({ success: true, theme });
  } catch (err) { next(err); }
});

// ── POST /api/admin/themes — create new draft ──────────────
router.post('/', async (req, res, next) => {
  try {
    const { name, tokens, presetKey, notes } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return res.status(422).json({ error: true, message: 'Theme name is required' });
    }
    const tokenError = validateTokens(tokens || {});
    if (tokenError) return res.status(422).json({ error: true, message: tokenError });

    const theme = await FounderTheme.create({
      name: name.trim().slice(0, 80),
      tokens: tokens || {},
      presetKey: presetKey || null,
      notes: (notes || '').slice(0, 500),
      status: 'draft',
      createdBy: { uid: req.user.id, username: req.user.username },
    });

    logger.info(`[Theme] Founder ${req.user.username} created theme "${theme.name}" (${theme._id})`);
    res.status(201).json({ success: true, theme });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/themes/:id — update draft tokens/name ──
router.put('/:id', async (req, res, next) => {
  try {
    const theme = await FounderTheme.findById(req.params.id);
    if (!theme) return res.status(404).json({ error: true, message: 'Theme not found' });

    const { name, tokens, notes } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1)
        return res.status(422).json({ error: true, message: 'Theme name cannot be empty' });
      theme.name = name.trim().slice(0, 80);
    }

    if (tokens !== undefined) {
      const tokenError = validateTokens(tokens);
      if (tokenError) return res.status(422).json({ error: true, message: tokenError });
      // Deep-merge tokens so partial updates don't wipe unset fields
      theme.tokens = _deepMerge((theme.tokens?.toObject ? theme.tokens.toObject() : theme.tokens) || {}, tokens);
    }

    if (notes !== undefined) theme.notes = (notes || '').slice(0, 500);

    await theme.save();
    logger.info(`[Theme] Founder ${req.user.username} updated theme "${theme.name}" (${theme._id})`);
    res.json({ success: true, theme });
  } catch (err) { next(err); }
});

// ── POST /api/admin/themes/:id/publish — go live ──────────
router.post('/:id/publish', async (req, res, next) => {
  try {
    const theme = await FounderTheme.findById(req.params.id);
    if (!theme) return res.status(404).json({ error: true, message: 'Theme not found' });

    // Find current live theme (if any) to record for rollback
    const currentLive = await FounderTheme.findOne({ status: 'published' }).sort({ publishedAt: -1 });

    // Archive the old live theme
    if (currentLive && !currentLive._id.equals(theme._id)) {
      currentLive.status = 'archived';
      await currentLive.save();
    }

    // Promote this theme
    theme.status = 'published';
    theme.publishedAt = new Date();
    theme.publishedBy = { uid: req.user.id, username: req.user.username };
    theme.previousPublishedId = currentLive ? currentLive._id : null;
    await theme.save();

    logger.info(`[Theme] Founder ${req.user.username} PUBLISHED theme "${theme.name}" (${theme._id})`);
    res.json({ success: true, theme });
  } catch (err) { next(err); }
});

// ── POST /api/admin/themes/:id/rollback — restore old live ─
router.post('/:id/rollback', async (req, res, next) => {
  try {
    const target = await FounderTheme.findById(req.params.id);
    if (!target) return res.status(404).json({ error: true, message: 'Theme not found' });

    // Archive current live theme
    const currentLive = await FounderTheme.findOne({ status: 'published' }).sort({ publishedAt: -1 });
    if (currentLive && !currentLive._id.equals(target._id)) {
      currentLive.status = 'archived';
      await currentLive.save();
    }

    // Promote target
    target.status = 'published';
    target.publishedAt = new Date();
    target.publishedBy = { uid: req.user.id, username: req.user.username };
    await target.save();

    logger.info(`[Theme] Founder ${req.user.username} ROLLED BACK to theme "${target.name}" (${target._id})`);
    res.json({ success: true, theme: target });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/themes/:id — delete draft ────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const theme = await FounderTheme.findById(req.params.id);
    if (!theme) return res.status(404).json({ error: true, message: 'Theme not found' });
    if (theme.status === 'published') {
      return res.status(409).json({ error: true, message: 'Cannot delete the currently published theme. Publish another theme first.' });
    }
    await FounderTheme.findByIdAndDelete(req.params.id);
    logger.info(`[Theme] Founder ${req.user.username} deleted theme "${theme.name}" (${theme._id})`);
    res.json({ success: true, message: 'Theme deleted' });
  } catch (err) { next(err); }
});

// ── Utility ────────────────────────────────────────────────
function _deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = _deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

module.exports = router;
