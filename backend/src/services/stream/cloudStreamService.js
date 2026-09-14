/**
 * 24-Hour Cloud Stream — Backend Service
 *
 * This Node.js service runs inside the main server process.
 * It continuously cycles a media playlist and pushes to RTMP targets
 * using ffmpeg.
 *
 * REQUIREMENTS:
 *   - ffmpeg installed on the server (https://ffmpeg.org)
 *   - Media files accessible on disk
 *   - RTMP ingest URL(s) for output platforms (optional — simulates if absent)
 *
 * USAGE (standalone):
 *   node src/services/stream/cloudStreamService.js
 *
 * USAGE (embedded — preferred):
 *   const cs = require('./cloudStreamService');
 *   cs.start();
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');

// ─── Configuration ────────────────────────────────────────
const CONFIG = {
  mediaDir: process.env.CLOUD_STREAM_MEDIA_DIR || './media',
  rtmpTargets: (process.env.CLOUD_STREAM_RTMP_TARGETS || '').split(',').filter(Boolean),
  shuffle: process.env.CLOUD_STREAM_SHUFFLE !== 'false',
  repeat: process.env.CLOUD_STREAM_REPEAT !== 'false',
  maxConsecutiveErrors: 5,
  restartDelayMs: 3000,
};

// ─── Supported audio/video extensions ────────────────────
const SUPPORTED_EXTENSIONS = ['.mp4', '.webm', '.mp3', '.wav', '.flac', '.aac', '.ogg', '.mkv', '.mov'];

// ─── State ────────────────────────────────────────────────
let playlist = [];          // Full scanned file list from disk
let queue = [];             // Admin-managed ordered queue (overrides playlist when non-empty)
let currentIndex = 0;       // Index into the active list
let consecutiveErrors = 0;
let currentProcess = null;
let isRunning = false;
let isPaused = false;
let currentTrack = null;    // basename of currently streaming file
let lastActivity = null;    // ISO timestamp of last successful track start
const errorLog = [];        // Rolling error log (last 100)

// ─── Infrastructure check ─────────────────────────────────
function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return { available: true };
  } catch {
    return { available: false, message: 'ffmpeg not found. Install from https://ffmpeg.org/download.html' };
  }
}

// ─── Playlist management ──────────────────────────────────
function buildPlaylist() {
  const dir = CONFIG.mediaDir;
  if (!fs.existsSync(dir)) {
    logger.warn(`[CloudStream] Media dir not found: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir)
    .filter(f => SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(dir, f));

  logger.info(`[CloudStream] Found ${files.length} media files`);
  return files;
}

/** Returns the active list — admin queue takes precedence over scanned playlist */
function getActiveList() {
  return queue.length ? queue : playlist;
}

function getNextTrack() {
  const list = getActiveList();
  if (!list.length) return null;

  if (CONFIG.shuffle) {
    return list[Math.floor(Math.random() * list.length)];
  }

  const track = list[currentIndex % list.length];
  currentIndex++;
  return track;
}

// ─── ffmpeg stream ────────────────────────────────────────
function streamTrack(filePath, onComplete, onError) {
  if (!CONFIG.rtmpTargets.length) {
    logger.warn('[CloudStream] No RTMP targets configured (CLOUD_STREAM_RTMP_TARGETS). Simulating playback.');
    const duration = 10000 + Math.random() * 20000; // 10–30s for simulation
    const timer = setTimeout(() => {
      logger.info(`[CloudStream] Simulated track complete: ${path.basename(filePath)}`);
      onComplete();
    }, duration);
    return () => clearTimeout(timer);
  }

  const rtmpOutput = CONFIG.rtmpTargets[0]; // Primary target

  const ffmpegArgs = [
    '-re',                          // Read at native framerate
    '-i', filePath,                 // Input file
    '-c:v', 'libx264',             // Video codec
    '-preset', 'veryfast',          // Speed/quality tradeoff
    '-maxrate', '3000k',
    '-bufsize', '6000k',
    '-pix_fmt', 'yuv420p',
    '-g', '50',                     // GOP size
    '-c:a', 'aac',                  // Audio codec
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',                    // Output format for RTMP
    rtmpOutput,
  ];

  logger.info(`[CloudStream] Streaming: ${path.basename(filePath)} → ${rtmpOutput}`);

  const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  currentProcess = proc;

  proc.stderr.on('data', (data) => {
    const line = data.toString();
    if (line.includes('Error') || line.includes('error')) {
      logger.warn(`[CloudStream ffmpeg] ${line.trim()}`);
    }
  });

  proc.on('close', (code) => {
    currentProcess = null;
    if (code === 0 || code === null) {
      onComplete();
    } else {
      onError(new Error(`ffmpeg exited with code ${code}`));
    }
  });

  proc.on('error', (err) => {
    currentProcess = null;
    if (err.code === 'ENOENT') {
      onError(new Error('ffmpeg not found. Install ffmpeg: https://ffmpeg.org/download.html'));
    } else {
      onError(err);
    }
  });

  return () => {
    if (proc && !proc.killed) proc.kill('SIGTERM');
  };
}

// ─── Stream loop ──────────────────────────────────────────
function playNext() {
  if (!isRunning || isPaused) return;

  const track = getNextTrack();
  if (!track) {
    logger.warn('[CloudStream] No tracks available. Rebuilding playlist in 30s...');
    setTimeout(() => {
      playlist = buildPlaylist();
      if (!getActiveList().length) {
        logger.error('[CloudStream] Still no media. Add files to: ' + CONFIG.mediaDir);
        setTimeout(playNext, 30000);
      } else {
        playNext();
      }
    }, 30000);
    return;
  }

  // Skip missing files silently
  if (!fs.existsSync(track)) {
    logger.warn(`[CloudStream] File not found, skipping: ${track}`);
    consecutiveErrors++;
    if (consecutiveErrors < CONFIG.maxConsecutiveErrors) {
      setTimeout(playNext, 500);
    } else {
      logger.error(`[CloudStream] ${CONFIG.maxConsecutiveErrors} consecutive errors. Pausing 60s before retry.`);
      setTimeout(() => { consecutiveErrors = 0; playNext(); }, 60000);
    }
    return;
  }

  currentTrack = path.basename(track);
  lastActivity = new Date().toISOString();

  streamTrack(
    track,
    () => {
      consecutiveErrors = 0;
      if (!CONFIG.repeat && currentIndex >= getActiveList().length) {
        logger.info('[CloudStream] Playlist complete. Repeat is off — stopping.');
        isRunning = false;
        currentTrack = null;
        return;
      }
      setTimeout(playNext, 500);
    },
    (err) => {
      consecutiveErrors++;
      const errorEntry = { track: path.basename(track), error: err.message, time: new Date().toISOString() };
      errorLog.push(errorEntry);
      if (errorLog.length > 100) errorLog.shift();

      logger.error(`[CloudStream] Error playing "${path.basename(track)}": ${err.message}`);

      if (consecutiveErrors >= CONFIG.maxConsecutiveErrors) {
        logger.error(`[CloudStream] ${CONFIG.maxConsecutiveErrors} consecutive errors. Pausing 60s before retry.`);
        setTimeout(() => {
          consecutiveErrors = 0;
          playNext();
        }, 60000);
        return;
      }

      logger.info('[CloudStream] Skipping failed track and continuing...');
      setTimeout(playNext, CONFIG.restartDelayMs);
    }
  );
}

// ─── Public API ───────────────────────────────────────────

function start() {
  if (isRunning) {
    logger.warn('[CloudStream] Already running');
    return { ok: false, message: 'Already running' };
  }

  isPaused = false;
  isRunning = true;
  currentIndex = 0;
  playlist = buildPlaylist();

  if (!getActiveList().length) {
    logger.error('[CloudStream] No media files found in: ' + CONFIG.mediaDir);
    isRunning = false;
    return { ok: false, message: 'No media files found in: ' + CONFIG.mediaDir };
  }

  if (CONFIG.shuffle && !queue.length) {
    playlist.sort(() => Math.random() - 0.5);
  }

  logger.info(`[CloudStream] Starting with ${getActiveList().length} tracks`);
  if (CONFIG.rtmpTargets.length) {
    logger.info(`[CloudStream] RTMP targets: ${CONFIG.rtmpTargets.join(', ')}`);
  } else {
    logger.warn('[CloudStream] No RTMP targets. Set CLOUD_STREAM_RTMP_TARGETS=rtmp://... to broadcast.');
  }

  playNext();
  return { ok: true };
}

function stop() {
  isRunning = false;
  isPaused = false;
  currentTrack = null;
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
  }
  logger.info('[CloudStream] Stopped');
  return { ok: true };
}

function pause() {
  if (!isRunning) return { ok: false, message: 'Stream is not running' };
  if (isPaused) return { ok: false, message: 'Already paused' };

  isPaused = true;
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
  }
  logger.info('[CloudStream] Paused');
  return { ok: true };
}

function resume() {
  if (!isRunning) return { ok: false, message: 'Stream is not running' };
  if (!isPaused) return { ok: false, message: 'Stream is not paused' };

  isPaused = false;
  logger.info('[CloudStream] Resumed');
  playNext();
  return { ok: true };
}

function skip() {
  if (!isRunning) return { ok: false, message: 'Stream is not running' };
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
  }
  // playNext() will be called by the close handler (code=null) → onComplete
  return { ok: true };
}

function getStatus() {
  const list = getActiveList();
  const nextTrack = list.length
    ? path.basename(list[currentIndex % list.length] || '')
    : null;

  let state;
  if (!isRunning) state = 'stopped';
  else if (isPaused) state = 'paused';
  else if (consecutiveErrors >= CONFIG.maxConsecutiveErrors) state = 'reconnecting';
  else if (!list.length) state = 'no_media';
  else state = 'running';

  return {
    state,                         // stopped | running | paused | reconnecting | no_media
    running: isRunning,
    paused: isPaused,
    currentTrack,
    nextTrack,
    queueSize: list.length,
    managedQueueSize: queue.length,
    playlistSize: playlist.length,
    currentIndex: currentIndex % Math.max(1, list.length),
    consecutiveErrors,
    shuffle: CONFIG.shuffle,
    repeat: CONFIG.repeat,
    rtmpConfigured: CONFIG.rtmpTargets.length > 0,
    rtmpTargetCount: CONFIG.rtmpTargets.length,
    mediaDir: CONFIG.mediaDir,
    recentErrors: errorLog.slice(-10),
    lastActivity,
    ffmpeg: checkFfmpeg(),
  };
}

function getQueue() {
  const list = getActiveList();
  return list.map((filePath, i) => ({
    index: i,
    name: path.basename(filePath),
    active: i === (currentIndex % Math.max(1, list.length)) && isRunning && !isPaused,
  }));
}

/** Append absolute or relative paths to the admin-managed queue */
function addToQueue(filePaths) {
  const added = [];
  for (const fp of filePaths) {
    const resolved = path.isAbsolute(fp) ? fp : path.join(CONFIG.mediaDir, fp);
    if (!fs.existsSync(resolved)) {
      logger.warn(`[CloudStream] addToQueue: file not found: ${resolved}`);
      continue;
    }
    if (!SUPPORTED_EXTENSIONS.includes(path.extname(resolved).toLowerCase())) {
      logger.warn(`[CloudStream] addToQueue: unsupported extension: ${resolved}`);
      continue;
    }
    queue.push(resolved);
    added.push(path.basename(resolved));
  }
  logger.info(`[CloudStream] Queue updated — ${queue.length} items`);
  return added;
}

function removeFromQueue(index) {
  if (index < 0 || index >= queue.length) return { ok: false, message: 'Index out of range' };
  const removed = queue.splice(index, 1)[0];
  if (currentIndex > index) currentIndex--;
  logger.info(`[CloudStream] Removed from queue: ${path.basename(removed)}`);
  return { ok: true, removed: path.basename(removed) };
}

function reorderQueue(fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
    return { ok: false, message: 'Index out of range' };
  }
  const [item] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, item);
  logger.info(`[CloudStream] Queue reordered: ${path.basename(item)} moved to position ${toIndex}`);
  return { ok: true };
}

function clearQueue() {
  queue = [];
  currentIndex = 0;
  logger.info('[CloudStream] Queue cleared');
  return { ok: true };
}

function setShuffle(enabled) {
  CONFIG.shuffle = !!enabled;
  logger.info(`[CloudStream] Shuffle: ${CONFIG.shuffle}`);
  return { ok: true, shuffle: CONFIG.shuffle };
}

function setRepeat(enabled) {
  CONFIG.repeat = !!enabled;
  logger.info(`[CloudStream] Repeat: ${CONFIG.repeat}`);
  return { ok: true, repeat: CONFIG.repeat };
}

/** Scan the media dir and refresh the playlist */
function refreshPlaylist() {
  playlist = buildPlaylist();
  logger.info(`[CloudStream] Playlist refreshed — ${playlist.length} files`);
  return { ok: true, playlistSize: playlist.length };
}

/** List all media files on disk (for the add-to-queue picker) */
function listMediaFiles() {
  const dir = CONFIG.mediaDir;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
}

// ─── Run if called directly ───────────────────────────────
if (require.main === module) {
  logger.info('=== AVENORA — 24-Hour Cloud Stream Service ===');
  logger.info('Configure: CLOUD_STREAM_MEDIA_DIR, CLOUD_STREAM_RTMP_TARGETS');
  start();

  process.on('SIGTERM', () => { stop(); process.exit(0); });
  process.on('SIGINT',  () => { stop(); process.exit(0); });
}

module.exports = {
  start,
  stop,
  pause,
  resume,
  skip,
  getStatus,
  getQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearQueue,
  setShuffle,
  setRepeat,
  refreshPlaylist,
  listMediaFiles,
  checkFfmpeg,
};
