const mongoose = require('mongoose');
const { jwtVerify } = require('jose');
const AuditLog = require('../models/AuditLog');
const { secret } = require('./authMiddleware');

// --------------------------------------------------------
// ASYNC WRITE BUFFER CONFIGURATION
// Micro-batching collapses burst traffic into a single bulk insertMany()
// without ever blocking the HTTP request/response cycle.
// --------------------------------------------------------
const MAX_BATCH_SIZE = 25;
const FLUSH_INTERVAL_MS = 250;
const MAX_QUEUE_SIZE = 1000;

const logQueue = [];
let flushTimer = null;
let activeFlush = null;

const flushAuditQueue = async ({ drainAll = false } = {}) => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (activeFlush) {
    await activeFlush;
  }

  if (logQueue.length === 0) return;

  // Avoid throwing errors if MongoDB is disconnected (e.g., startup/shutdown)
  if (mongoose.connection.readyState !== 1) return;

  do {
    const batch = logQueue.splice(0, MAX_BATCH_SIZE);
    try {
      await AuditLog.insertMany(batch, { ordered: false });
    } catch (err) {
      console.error('[AuditLogger] Async batch write failed:', err.message);
      break;
    }
  } while (drainAll && logQueue.length > 0);

  if (logQueue.length > 0) {
    scheduleFlush();
  }
};

const scheduleFlush = () => {
  if (logQueue.length >= MAX_BATCH_SIZE) {
    activeFlush = flushAuditQueue().finally(() => { activeFlush = null; });
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      activeFlush = flushAuditQueue().finally(() => { activeFlush = null; });
    }, FLUSH_INTERVAL_MS);
    // Do not prevent the Node.js process from exiting cleanly
    if (typeof flushTimer.unref === 'function') {
      flushTimer.unref();
    }
  }
};

const enqueueAuditEntry = (entry) => {
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    // Drop oldest entry under extreme backpressure to protect heap memory
    logQueue.shift();
  }
  logQueue.push(entry);
  scheduleFlush();
};

// Best-effort flush before graceful process exit
process.once('beforeExit', () => {
  if (logQueue.length > 0 && !activeFlush) {
    flushAuditQueue();
  }
});

// --------------------------------------------------------
// FORENSIC EXTRACTION HELPERS
// --------------------------------------------------------

/** Extracts the raw JWT from Authorization header (never trusts unverified tokens). */
const extractBearerToken = (req) => {
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
};

/** Resolves the authenticated jose payload, reusing req.user when verifyToken already ran. */
const resolveJwtUser = async (req, rawToken) => {
  if (req.user && req.user.id) {
    return req.user;
  }
  if (!rawToken) return null;

  try {
    const { payload } = await jwtVerify(rawToken, secret);
    return payload;
  } catch {
    return null;
  }
};

/** Normalizes client IP (respects Express 'trust proxy' and strips IPv4-mapped IPv6 prefix). */
const extractClientIp = (req) => {
  const rawIp =
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown';
  return String(rawIp).replace(/^::ffff:/, '');
};

/** Sanitizes resource IDs appended from request bodies so control chars cannot pollute logs. */
const sanitizeIdentifier = (val) =>
  String(val || '').replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 64);

/** Maps HTTP method and normalized endpoint path to an AuditLog actionType. */
const resolveActionType = (method, endpointPath, overrideAction) => {
  if (overrideAction) return overrideAction;
  if (/\/export(?:-|$|\/)/i.test(endpointPath)) return 'EXPORT';

  switch (String(method).toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return 'READ';
    case 'DELETE':
      return 'DELETE';
    case 'POST':
    case 'PUT':
    case 'PATCH':
    default:
      return 'WRITE';
  }
};

/**
 * Builds a clean forensic targetResource string (endpoint path + specific document/entity ID)
 * while deliberately excluding raw query strings (which could contain ?token= secrets).
 */
const resolveTargetResource = ({ endpointPath, req, resourceResolver }) => {
  if (typeof resourceResolver === 'function') {
    const custom = resourceResolver(req, endpointPath);
    if (custom) return String(custom).slice(0, 256);
  }

  // Body-carried document ID (e.g., POST /api/verify-certificate with { facultyId })
  const bodyDocId = req.body?.facultyId || req.body?.documentId;
  if (bodyDocId) {
    return `${endpointPath} [doc:${sanitizeIdentifier(bodyDocId)}]`;
  }

  // Export format qualifier (e.g., GET /api/statistics/export-faculty?format=pdf)
  if (/\/export(?:-|$|\/)/i.test(endpointPath)) {
    const fmt = sanitizeIdentifier(req.exportFormat || req.query?.format || 'xlsx');
    return `${endpointPath} [format:${fmt}]`;
  }

  return endpointPath;
};

// --------------------------------------------------------
// EXPRESS MIDDLEWARE FACTORY
// --------------------------------------------------------

/**
 * Non-blocking Express audit middleware.
 * Calls next() synchronously with zero I/O wait, then schedules jose payload resolution
 * and buffered MongoDB persistence via setImmediate() after the response finishes.
 *
 * @param {Object} [options]
 * @param {'READ'|'WRITE'|'DELETE'|'EXPORT'} [options.actionType] - Explicit actionType override
 * @param {(req: import('express').Request, path: string) => string} [options.resourceResolver]
 */
const auditLogger = (options = {}) => {
  const { actionType: overrideAction, resourceResolver } = options;

  return (req, res, next) => {
    // Ignore CORS preflight requests
    if (req.method === 'OPTIONS') return next();

    // Capture routing context synchronously before sub-routers unwind
    const method = req.method;
    const rawPath = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+$/, '') || '/';
    const ipAddress = extractClientIp(req);
    const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 256);
    const rawToken = extractBearerToken(req);
    const requestTimestamp = new Date();

    res.once('finish', () => {
      const statusCode = res.statusCode;

      // Offload JWT verification (if needed) and DB queueing off the current tick
      setImmediate(async () => {
        try {
          const userPayload = (req.user && req.user.id) ? req.user : await resolveJwtUser(req, rawToken);
          const rawUserId = userPayload?.id;

          // Only log authenticated principals with a valid MongoDB ObjectId
          if (!rawUserId || !mongoose.Types.ObjectId.isValid(String(rawUserId))) {
            return;
          }

          const actionType = resolveActionType(method, rawPath, overrideAction);
          const targetResource = resolveTargetResource({
            endpointPath: rawPath,
            req,
            resourceResolver,
          });

          enqueueAuditEntry({
            userId: new mongoose.Types.ObjectId(String(rawUserId)),
            username: String(userPayload.username || ''),
            userRole: String(userPayload.role || ''),
            actionType,
            targetResource,
            httpMethod: method,
            statusCode,
            ipAddress,
            userAgent,
            timestamp: requestTimestamp,
          });
        } catch (err) {
          console.error('[AuditLogger] Unexpected logging error:', err.message);
        }
      });
    });

    // Proceed immediately without blocking the request lifecycle
    return next();
  };
};

/**
 * Non-blocking explicit audit recorder for pre-JWT authentication flows
 * (e.g., recording admin and user LOGIN successes or failed password/biometric attempts).
 */
const recordAuditEvent = (req, res, { userId, username = '', userRole = '', actionType = 'LOGIN', targetResource }) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return;

  const method = req.method || 'POST';
  const rawPath = targetResource || `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+$/, '') || '/';
  const ipAddress = extractClientIp(req);
  const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 256);
  const requestTimestamp = new Date();

  const dispatch = () => {
    const statusCode = res.statusCode;
    setImmediate(() => {
      enqueueAuditEntry({
        userId: new mongoose.Types.ObjectId(String(userId)),
        username: String(username),
        userRole: String(userRole),
        actionType,
        targetResource: String(rawPath).slice(0, 256),
        httpMethod: method,
        statusCode,
        ipAddress,
        userAgent,
        timestamp: requestTimestamp,
      });
    });
  };

  if (res.writableEnded) {
    dispatch();
  } else {
    res.once('finish', dispatch);
  }
};

module.exports = {
  auditLogger,
  recordAuditEvent,
  flushAuditQueue,
  resolveActionType,
  resolveTargetResource,
};

