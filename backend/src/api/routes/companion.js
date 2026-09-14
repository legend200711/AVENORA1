/**
 * AVENORA - Companion API Routes
 * All routes require authentication. Ownership is enforced server-side —
 * users can only read/write their own companion data.
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const Companion = require('../../models/Companion');
const logger = require('../../utils/logger');

// Every companion route requires authentication.
router.use(authenticate);

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(new ValidationError('Validation failed', errors.array()));
  next();
}

// ── Helper: load and own-check ────────────────────────────────
async function loadOwned(userId) {
  const companion = await Companion.findOne({ userId });
  return companion; // may be null — callers handle that
}

// ─────────────────────────────────────────────────────────────
// GET /api/companion/me
// Returns the current user's companion (creates one if first time).
// ─────────────────────────────────────────────────────────────
router.get('/me', async (req, res, next) => {
  try {
    let companion = await loadOwned(req.user.id);

    if (!companion) {
      // First access — create an empty, un-discovered companion record
      companion = new Companion({ userId: req.user.id });
      await companion.save();
    }

    // Reset daily tasks if a new day has started
    const needsSave = companion.maybeResetDailyTasks();
    if (needsSave) await companion.save();

    res.json({ success: true, companion: safeCompanion(companion) });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/companion/discover
// Marks the companion as discovered. Idempotent.
// ─────────────────────────────────────────────────────────────
router.post('/discover', async (req, res, next) => {
  try {
    let companion = await loadOwned(req.user.id);
    if (!companion) {
      companion = new Companion({ userId: req.user.id });
    }
    if (!companion.discovered) {
      companion.discovered = true;
      companion.discoveredAt = new Date();
      await companion.save();
    }
    res.json({ success: true, companion: safeCompanion(companion) });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/companion/setup
// Set name, appearance, and personality after discovery.
// ─────────────────────────────────────────────────────────────
router.patch('/setup',
  [
    body('name').optional().trim().isLength({ min: 1, max: 32 }).withMessage('Name must be 1–32 characters'),
    body('appearance').optional().isIn(['scarab', 'anubis', 'ibis', 'cat', 'falcon']).withMessage('Invalid appearance'),
    body('personality').optional().isIn(['calm', 'curious', 'cheerful', 'wise', 'playful']).withMessage('Invalid personality'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const companion = await loadOwned(req.user.id);
      if (!companion || !companion.discovered) {
        return next(new NotFoundError('Companion'));
      }
      const { name, appearance, personality } = req.body;
      if (name !== undefined)        companion.name = name;
      if (appearance !== undefined)  companion.appearance = appearance;
      if (personality !== undefined) companion.personality = personality;
      await companion.save();
      res.json({ success: true, companion: safeCompanion(companion) });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/companion/care/:action
// Actions: feed | water | play | encourage
// ─────────────────────────────────────────────────────────────
router.post('/care/:action', async (req, res, next) => {
  const VALID_ACTIONS = ['feed', 'water', 'play', 'encourage'];
  try {
    const { action } = req.params;
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ error: true, message: 'Unknown care action' });
    }

    const companion = await loadOwned(req.user.id);
    if (!companion || !companion.discovered) {
      return next(new NotFoundError('Companion'));
    }

    const now = new Date();
    const cap = v => Math.min(100, v);

    switch (action) {
      case 'feed':
        companion.care.hunger = cap(companion.care.hunger + 25);
        companion.care.lastFed = now;
        break;
      case 'water':
        companion.care.water = cap(companion.care.water + 25);
        companion.care.lastWatered = now;
        break;
      case 'play':
        companion.care.happiness = cap(companion.care.happiness + 20);
        companion.care.energy = Math.max(0, companion.care.energy - 10);
        companion.care.lastPlayed = now;
        break;
      case 'encourage':
        companion.care.happiness = cap(companion.care.happiness + 15);
        break;
    }

    await companion.save();
    res.json({ success: true, care: companion.care, message: _careResponse(action, companion.personality) });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/companion/tasks/:key
// Mark a daily task complete or skip it, or toggle enabled.
// body: { action: 'complete' | 'skip' | 'toggle_enabled' }
// ─────────────────────────────────────────────────────────────
router.patch('/tasks/:key',
  [body('action').isIn(['complete', 'skip', 'toggle_enabled']).withMessage('Invalid action')],
  handleValidation,
  async (req, res, next) => {
    try {
      const companion = await loadOwned(req.user.id);
      if (!companion || !companion.discovered) {
        return next(new NotFoundError('Companion'));
      }

      const task = companion.dailyTasks.find(t => t.key === req.params.key);
      if (!task) return res.status(404).json({ error: true, message: 'Task not found' });

      const { action } = req.body;
      if (action === 'complete') {
        task.completedToday = true;
        task.lastCompleted = new Date();
      } else if (action === 'skip') {
        // skip: do nothing — just acknowledge
      } else if (action === 'toggle_enabled') {
        task.enabled = !task.enabled;
      }

      await companion.save();
      res.json({ success: true, task });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/companion/minigame/score
// Submit a mini-game score. Only updates if it's a new high score.
// ─────────────────────────────────────────────────────────────
router.post('/minigame/score',
  [body('score').isInt({ min: 0, max: 99999 }).withMessage('Score must be a positive integer')],
  handleValidation,
  async (req, res, next) => {
    try {
      const companion = await loadOwned(req.user.id);
      if (!companion || !companion.discovered) {
        return next(new NotFoundError('Companion'));
      }

      const { score } = req.body;
      companion.miniGame.gamesPlayed += 1;
      const isHighScore = score > companion.miniGame.highScore;
      if (isHighScore) companion.miniGame.highScore = score;

      // Reward happiness for playing
      companion.care.happiness = Math.min(100, companion.care.happiness + 10);
      companion.care.lastPlayed = new Date();

      await companion.save();
      res.json({ success: true, isHighScore, miniGame: companion.miniGame });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/companion/widget
// Toggle widget visibility (minimize / re-show / disable).
// body: { widgetVisible?: Boolean, disabled?: Boolean }
// ─────────────────────────────────────────────────────────────
router.patch('/widget',
  [
    body('widgetVisible').optional().isBoolean(),
    body('disabled').optional().isBoolean(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const companion = await loadOwned(req.user.id);
      if (!companion) return next(new NotFoundError('Companion'));

      if (req.body.widgetVisible !== undefined) companion.widgetVisible = req.body.widgetVisible;
      if (req.body.disabled !== undefined)      companion.disabled = req.body.disabled;

      await companion.save();
      res.json({ success: true, widgetVisible: companion.widgetVisible, disabled: companion.disabled });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Helpers ─────────────────────────────────────────────────
function safeCompanion(c) {
  return {
    id:               c._id,
    discovered:       c.discovered,
    discoveredAt:     c.discoveredAt,
    name:             c.name,
    appearance:       c.appearance,
    personality:      c.personality,
    care:             c.care,
    dailyTasks:       c.dailyTasks,
    miniGame:         c.miniGame,
    unlockedAppearances: c.unlockedAppearances,
    widgetVisible:    c.widgetVisible,
    disabled:         c.disabled,
    updatedAt:        c.updatedAt,
  };
}

function _careResponse(action, personality) {
  const responses = {
    feed: {
      calm:     'Thank you. I feel nourished.',
      curious:  'Mmm! What is this delightful offering?',
      cheerful: 'Yes! Food! I love food!',
      wise:     'A body well-fed is a mind well-prepared.',
      playful:  'Nom nom! More please!',
    },
    water: {
      calm:     'The water is refreshing. Thank you.',
      curious:  'Water from the Nile? How thoughtful.',
      cheerful: 'So refreshing! Thank you!',
      wise:     'Water sustains all life. A wise gift.',
      playful:  'Splash! I\'m so hydrated now!',
    },
    play: {
      calm:     'That was a pleasant game. Thank you.',
      curious:  'How fascinating! Let\'s explore more!',
      cheerful: 'That was the best! Can we go again?',
      wise:     'Play is the work of the spirit.',
      playful:  'Wheee! Best. Day. Ever!',
    },
    encourage: {
      calm:     'Your kind words mean a great deal.',
      curious:  'Your encouragement gives me new questions to explore!',
      cheerful: 'You\'re amazing! Thank you so much!',
      wise:     'Kind words echo through eternity.',
      playful:  'Yay! You\'re my favorite person!',
    },
  };
  return (responses[action] && responses[action][personality]) || 'Thank you.';
}

module.exports = router;
