/**
 * Authentication & Authorization middleware
 *
 * Supports two token types:
 *   1. Firebase ID tokens (issued by avenora-6e147) — preferred when the frontend
 *      uses Firebase Authentication (AvenoraFirebase.Auth).
 *   2. Local JWT tokens (signed with JWT_SECRET) — legacy / admin backend tokens.
 *
 * Firebase ID tokens are verified via the Firebase REST API
 * (https://identitytoolkit.googleapis.com/v1/accounts:lookup) so no Admin SDK
 * or private key is needed.
 *
 * req.user shape (same for both token types):
 *   { id, uid, username, role, email }
 */

const jwt = require('jsonwebtoken');
const https = require('https');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');
const logger = require('../../utils/logger');

// ─── Firebase project ID ───────────────────────────────────────────────────
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'avenora-6e147';

/**
 * Verify a Firebase ID token via the Google token-info REST endpoint.
 * Returns the decoded payload (uid, email, etc.) on success.
 * Throws on invalid/expired tokens.
 *
 * This approach requires no Firebase Admin SDK and no private keys.
 * The public token-info endpoint validates the token server-side.
 */
async function verifyFirebaseIdToken(idToken) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ idToken });
    const options = {
      hostname: 'identitytoolkit.googleapis.com',
      path:     `/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY || 'AIzaSyDnEEYamIVYfn7l6sPPS1Dp2fWJE34OXlI'}`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.error) {
            return reject(new Error(data.error.message || 'Firebase token verification failed'));
          }
          const user = data.users && data.users[0];
          if (!user) return reject(new Error('Firebase: user not found'));
          resolve(user);
        } catch (e) {
          reject(new Error('Firebase: invalid response'));
        }
      });
    });

    req.on('error', err => reject(err));
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Firebase token verification timeout')); });
    req.write(postData);
    req.end();
  });
}

/**
 * Detect whether a bearer token looks like a Firebase ID token.
 * Firebase JWTs have three dot-separated parts with a header claiming alg=RS256
 * and aud=<firebaseProjectId>. We do a quick structural check before attempting
 * a full server-side verification call.
 */
function looksLikeFirebaseToken(token) {
  try {
    // All JWTs have three dot-separated base64url parts
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    // Firebase tokens use RS256 and have a 'kid' for key lookup
    return header.alg === 'RS256' && !!header.kid;
  } catch {
    return false;
  }
}

// Simple in-memory cache to avoid hammering the Firebase endpoint.
// Key: token substring (first 32 chars). Value: { user, expiresAt }.
const _tokenCache = new Map();
const _TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveFirebaseUser(token) {
  const cacheKey = token.slice(0, 32);
  const cached = _tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }
  const fbUser = await verifyFirebaseIdToken(token);
  _tokenCache.set(cacheKey, { user: fbUser, expiresAt: Date.now() + _TOKEN_CACHE_TTL_MS });
  return fbUser;
}

const ROLES = {
  USER: 'user',
  MODERATOR: 'moderator',
  FOUNDER: 'founder',
  ADMIN: 'admin',
};

const ROLE_HIERARCHY = {
  [ROLES.USER]: 0,
  [ROLES.MODERATOR]: 1,
  [ROLES.FOUNDER]: 2,
  [ROLES.ADMIN]: 3,
};

/**
 * Verifies the Bearer token from Authorization header.
 * Accepts both Firebase ID tokens (RS256) and local JWTs (HS256).
 * Attaches req.user = { id, uid, username, role, email }
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No authentication token provided'));
  }

  const token = authHeader.slice(7);

  // ── Firebase ID token path ─────────────────────────────
  if (looksLikeFirebaseToken(token)) {
    resolveFirebaseUser(token)
      .then(fbUser => {
        // Map Firebase user to req.user shape.
        // Role defaults to 'user' — elevated roles must be provisioned via
        // admin panel (sets custom claims or a Firestore role field).
        const email = fbUser.email || '';
        const isFounder = process.env.FOUNDER_EMAIL &&
          email.toLowerCase() === process.env.FOUNDER_EMAIL.toLowerCase();
        req.user = {
          id:       fbUser.localId,
          uid:      fbUser.localId,
          username: fbUser.displayName || email.split('@')[0] || 'user',
          role:     isFounder ? ROLES.FOUNDER : (fbUser.customAttributes
            ? (JSON.parse(fbUser.customAttributes).role || ROLES.USER)
            : ROLES.USER),
          email,
        };
        logger.debug(`[Auth] Firebase token verified: ${fbUser.localId} (${email})`);
        next();
      })
      .catch(err => {
        logger.warn(`[Auth] Firebase token rejected: ${err.message}`);
        return next(new UnauthorizedError('Firebase authentication failed. Please sign in again.'));
      });
    return; // async path
  }

  // ── Local JWT path ─────────────────────────────────────
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id:       payload.sub,
      uid:      payload.sub,
      username: payload.username,
      role:     payload.role || ROLES.USER,
      email:    payload.email,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Session expired. Please sign in again.'));
    }
    return next(new UnauthorizedError('Invalid authentication token'));
  }
}

/**
 * Optional authentication — attaches user if token present, continues either way.
 * Accepts both Firebase ID tokens and local JWTs.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7);

  // ── Firebase ID token path ─────────────────────────────
  if (looksLikeFirebaseToken(token)) {
    resolveFirebaseUser(token)
      .then(fbUser => {
        const email = fbUser.email || '';
        const isFounder = process.env.FOUNDER_EMAIL &&
          email.toLowerCase() === process.env.FOUNDER_EMAIL.toLowerCase();
        req.user = {
          id:       fbUser.localId,
          uid:      fbUser.localId,
          username: fbUser.displayName || email.split('@')[0] || 'user',
          role:     isFounder ? ROLES.FOUNDER : (fbUser.customAttributes
            ? (JSON.parse(fbUser.customAttributes).role || ROLES.USER)
            : ROLES.USER),
          email,
        };
        next();
      })
      .catch(() => {
        req.user = null;
        next();
      });
    return;
  }

  // ── Local JWT path ─────────────────────────────────────
  try {
    const token2 = token;
    const payload = jwt.verify(token2, process.env.JWT_SECRET);
    req.user = {
      id:       payload.sub,
      uid:      payload.sub,
      username: payload.username,
      role:     payload.role || ROLES.USER,
      email:    payload.email,
    };
  } catch {
    req.user = null;
  }
  next();
}

/**
 * Require a minimum role level
 */
function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    const userLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 99;
    if (userLevel < requiredLevel) {
      return next(new ForbiddenError(`Requires ${minRole} privileges`));
    }
    next();
  };
}

/**
 * Require that the authenticated user is the authorized platform founder.
 *
 * This is a server-side identity check: the caller's email (embedded in the
 * JWT by the auth service) must exactly match the FOUNDER_EMAIL environment
 * variable.  Role alone is not sufficient — this prevents any escalated
 * account from accessing founder-exclusive routes if the email doesn't match.
 *
 * Must be applied AFTER authenticate() and requireFounder() so req.user
 * is already populated and role-gated.
 *
 * The FOUNDER_EMAIL value is never sent to the client.
 */
function requireFounderEmail(req, res, next) {
  // FOUNDER_EMAIL must be configured in the environment — fail closed if missing
  const authorizedEmail = (process.env.FOUNDER_EMAIL || '').trim().toLowerCase();
  if (!authorizedEmail) {
    // Misconfiguration: block all access rather than accidentally open it
    return next(new ForbiddenError('Founder account not configured on this server'));
  }

  if (!req.user) return next(new UnauthorizedError());

  const callerEmail = (req.user.email || '').trim().toLowerCase();
  if (callerEmail !== authorizedEmail) {
    // Return a generic 403 — do not reveal the authorized email
    return next(new ForbiddenError('Access restricted to the authorized founder account'));
  }

  next();
}

const requireModerator = requireRole(ROLES.MODERATOR);
const requireFounder = requireRole(ROLES.FOUNDER);
const requireAdmin = requireRole(ROLES.ADMIN);

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  requireModerator,
  requireFounder,
  requireFounderEmail,
  requireAdmin,
  ROLES,
  ROLE_HIERARCHY,
};
