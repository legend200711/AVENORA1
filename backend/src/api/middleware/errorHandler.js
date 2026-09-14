/**
 * Global error handler middleware
 */

const logger = require('../../utils/logger');

function errorHandler(err, req, res, next) {
  // Log full error server-side
  logger.error(`${err.name}: ${err.message}`, { stack: err.stack, url: req.url, method: req.method });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Never expose stack traces or internal details to the client
  const response = {
    error: true,
    message: statusCode >= 500
      ? 'An internal server error occurred. Please try again later.'
      : err.message || 'Request failed',
    code: err.code || 'SERVER_ERROR',
  };

  // Add validation details if available (safe to expose)
  if (err.details && statusCode === 422) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
}

/**
 * Creates a typed API error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 422, 'VALIDATION_ERROR');
    this.details = details;
  }
}

module.exports = { errorHandler, AppError, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError };
