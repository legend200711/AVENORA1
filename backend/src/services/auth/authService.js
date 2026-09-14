/**
 * Authentication Service
 * Handles sign-up, login, token issuance, refresh, logout
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const { AppError, UnauthorizedError } = require('../../api/middleware/errorHandler');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// ─── Token generation ────────────────────────────────────────

function generateAccessToken(user) {
  if (!JWT_SECRET) throw new AppError('JWT_SECRET not configured', 500, 'CONFIG_ERROR');
  return jwt.sign(
    { sub: user._id.toString(), username: user.username, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'legend-universe' }
  );
}

function generateRefreshToken(user) {
  if (!JWT_REFRESH_SECRET) throw new AppError('JWT_REFRESH_SECRET not configured', 500, 'CONFIG_ERROR');
  const token = crypto.randomBytes(64).toString('hex');
  const signed = jwt.sign(
    { sub: user._id.toString(), tokenId: token },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN, issuer: 'legend-universe' }
  );
  return { signed, raw: token };
}

// ─── Auth operations ─────────────────────────────────────────

async function register({ username, email, password }) {
  // Check uniqueness
  const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
  if (existingUser) {
    if (existingUser.email === email.toLowerCase()) {
      throw new AppError('Email already registered', 409, 'EMAIL_TAKEN');
    }
    throw new AppError('Username already taken', 409, 'USERNAME_TAKEN');
  }

  const passwordHash = await User.hashPassword(password);

  // If the registering email matches the configured founder address, assign the
  // founder role automatically.  FOUNDER_EMAIL is never sent to the client — this
  // check is purely server-side at registration time.
  const authorizedFounderEmail = (process.env.FOUNDER_EMAIL || '').trim().toLowerCase();
  const normalizedEmail = email.toLowerCase();
  const role = (authorizedFounderEmail && normalizedEmail === authorizedFounderEmail)
    ? 'founder'
    : 'user';

  const user = await User.create({ username, email: normalizedEmail, passwordHash, role });

  if (role === 'founder') {
    logger.info(`Founder account registered: ${username} (${user._id})`);
  } else {
    logger.info(`New user registered: ${username} (${user._id})`);
  }

  const accessToken = generateAccessToken(user);
  const { signed: refreshToken } = generateRefreshToken(user);

  return { user: user.toPublicProfile(), accessToken, refreshToken };
}

async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw new UnauthorizedError('Invalid email or password');

  const valid = await user.comparePassword(password);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  if (user.isSuspendedNow()) {
    throw new AppError(
      `Account suspended${user.status.suspendedUntil ? ` until ${user.status.suspendedUntil.toISOString()}` : ''}. Reason: ${user.status.suspendedReason || 'Policy violation'}`,
      403, 'ACCOUNT_SUSPENDED'
    );
  }

  if (!user.status.isActive) {
    throw new AppError('Account is deactivated', 403, 'ACCOUNT_DEACTIVATED');
  }

  // Update online status
  user.status.isOnline = true;
  user.status.lastSeen = new Date();
  await user.save();

  const accessToken = generateAccessToken(user);
  const { signed: refreshToken } = generateRefreshToken(user);

  logger.info(`User logged in: ${user.username}`);
  return { user: user.toPublicProfile(), accessToken, refreshToken };
}

async function refreshAccessToken(refreshToken) {
  if (!JWT_REFRESH_SECRET) throw new AppError('Not configured', 500);
  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.status.isActive) throw new UnauthorizedError('User not found');

  const accessToken = generateAccessToken(user);
  return { accessToken };
}

async function logout(userId) {
  await User.findByIdAndUpdate(userId, {
    'status.isOnline': false,
    'status.lastSeen': new Date(),
  });
}

module.exports = { register, login, refreshAccessToken, logout, generateAccessToken };
