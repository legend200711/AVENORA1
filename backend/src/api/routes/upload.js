/**
 * Upload Routes
 * Handles file uploads with validation and size limits.
 * In production, connect to Cloudflare R2 or AWS S3 via presigned URLs.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { uploadRateLimiter } = require('../middleware/rateLimiter');
const { AppError } = require('../middleware/errorHandler');

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 500;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Allowed MIME types per category
const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/ogg'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'],
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
};

const SIZE_LIMITS = {
  image: 20 * 1024 * 1024,   // 20MB
  video: MAX_MB * 1024 * 1024,
  audio: 50 * 1024 * 1024,   // 50MB
  avatar: 5 * 1024 * 1024,   // 5MB
};

function createStorage(category) {
  const dir = path.join(UPLOAD_DIR, category);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    },
  });
}

function createUploader(category) {
  return multer({
    storage: createStorage(category),
    limits: { fileSize: SIZE_LIMITS[category] || SIZE_LIMITS.image },
    fileFilter: (req, file, cb) => {
      const allowed = ALLOWED_TYPES[category] || [];
      if (!allowed.includes(file.mimetype)) {
        return cb(new AppError(`File type ${file.mimetype} not allowed for ${category}`, 415, 'INVALID_FILE_TYPE'));
      }
      cb(null, true);
    },
  });
}

// POST /api/upload/image
router.post('/image', authenticate, uploadRateLimiter, createUploader('image').single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: true, message: 'No file uploaded' });
  res.json({ success: true, url: `/uploads/image/${req.file.filename}` });
});

// POST /api/upload/avatar
router.post('/avatar', authenticate, uploadRateLimiter, createUploader('avatar').single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: true, message: 'No file uploaded' });
  res.json({ success: true, url: `/uploads/avatar/${req.file.filename}` });
});

// POST /api/upload/audio
router.post('/audio', authenticate, uploadRateLimiter, createUploader('audio').single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: true, message: 'No file uploaded' });
  res.json({
    success: true,
    url: `/uploads/audio/${req.file.filename}`,
    filename: req.file.originalname,
    size: req.file.size,
  });
});

// POST /api/upload/video
// In production: return a presigned upload URL to Cloudflare Stream / Mux
router.post('/video', authenticate, uploadRateLimiter, (req, res) => {
  // Real implementation: generate a Mux/Cloudflare Stream upload URL and return it
  // The browser uploads directly to the CDN — the backend never proxies video
  res.json({
    success: false,
    message: 'Video upload requires Mux or Cloudflare Stream integration. Configure MUX_TOKEN_ID or CLOUDFLARE_STREAM_TOKEN in .env.',
    setupRequired: true,
    integrations: ['Mux (https://mux.com)', 'Cloudflare Stream (https://cloudflare.com/products/cloudflare-stream)'],
  });
});

// Handle multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: true, message: `File too large. Maximum size exceeded.` });
    }
    return res.status(400).json({ error: true, message: err.message });
  }
  next(err);
});

module.exports = router;
