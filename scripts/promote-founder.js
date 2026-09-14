#!/usr/bin/env node
/**
 * promote-founder.js
 * ─────────────────────────────────────────────────────────────
 * One-time utility: finds the user account whose email matches
 * FOUNDER_EMAIL and sets its role to 'founder'.
 *
 * Run AFTER setting FOUNDER_EMAIL in backend/.env.
 *
 * Usage (from the repo root):
 *   cd backend && node ../scripts/promote-founder.js
 *
 * Or with an explicit env file:
 *   cd backend && node ../scripts/promote-founder.js --env .env.production
 *
 * The script makes exactly one DB write and then exits.
 * It never prints the founder email to stdout in full — only a
 * redacted version is shown.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');

// ── Resolve the env file ───────────────────────────────────
const envArgIdx = process.argv.indexOf('--env');
const envFile = envArgIdx !== -1
  ? process.argv[envArgIdx + 1]
  : path.join(__dirname, '../backend/.env');

if (!fs.existsSync(envFile)) {
  console.error(`[promote-founder] .env file not found: ${envFile}`);
  console.error('  Create backend/.env from backend/.env.example and fill in FOUNDER_EMAIL.');
  process.exit(1);
}

require('dotenv').config({ path: envFile });

// ── Validate FOUNDER_EMAIL ────────────────────────────────
const FOUNDER_EMAIL = (process.env.FOUNDER_EMAIL || '').trim().toLowerCase();
if (!FOUNDER_EMAIL) {
  console.error('[promote-founder] FOUNDER_EMAIL is not set in the .env file.');
  console.error('  Add FOUNDER_EMAIL=<address> to backend/.env and re-run.');
  process.exit(1);
}

// Redact for safe console output (e.g. "c*****a@gmail.com")
function redact(email) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1) + '*'.repeat(Math.max(local.length - 2, 3)) + local.slice(-1);
  return `${visible}@${domain}`;
}

const REDACTED = redact(FOUNDER_EMAIL);

// ── Connect to MongoDB ─────────────────────────────────────
const mongoose = require(path.join(__dirname, '../backend/node_modules/mongoose'));

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('[promote-founder] MONGODB_URI is not set.');
    process.exit(1);
  }

  console.log('[promote-founder] Connecting to database...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  // Load the User model via the project's own model file
  const User = require(path.join(__dirname, '../backend/src/models/User'));

  const user = await User.findOne({ email: FOUNDER_EMAIL });

  if (!user) {
    console.error(`[promote-founder] No account found for ${REDACTED}.`);
    console.error('  Register the account first, then re-run this script.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (user.role === 'founder') {
    console.log(`[promote-founder] Account ${REDACTED} already has role=founder. Nothing to do.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const previousRole = user.role;
  user.role = 'founder';
  await user.save();

  console.log(`[promote-founder] ✓ Account ${REDACTED} promoted from '${previousRole}' to 'founder'.`);
  console.log('[promote-founder] Done. The account can now access the Founder Control Center.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[promote-founder] Unexpected error:', err.message);
  process.exit(1);
});
