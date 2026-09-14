/**
 * Authentication & Authorization middleware
 * Uses JWT. Swap the verify logic to use a different provider
 * (Auth0, Clerk, etc.) without changing downstream route code.
 */

const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');

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
 * Verifies the JWT from Authorization: Bearer <token>
 * Attaches req.user = { id, username, role, email }
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No authentication token provided'));
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role || ROLES.USER,
      email: payload.email,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Session expired. Please log in again.'));
    }
    return next(new UnauthorizedError('Invalid authentication token'));
  }
}

/**
 * Optional authentication — attaches user if token present, continues either way
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username, role: payload.role || ROLES.USER };
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
