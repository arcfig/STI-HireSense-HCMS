const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { auditLogger, flushAuditQueue } = require('../middleware/auditLogger');

const VALID_ROLES = ['admin', 'academic_head', 'program_head', 'faculty'];
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --------------------------------------------------------
// ROUTE: Fetch Security & Forensic Audit Logs (Secured: Admins Only)
// Note: auditLogger() runs here too so admin inspection of audit logs
// (and any 403 unauthorized attempts) is itself recorded in the trail.
// --------------------------------------------------------
router.get(
  '/',
  verifyToken,
  auditLogger(),
  requireRole(['admin']),
  async (req, res) => {
    try {
      // Flush any buffered in-memory audit entries first for read-your-own-writes consistency
      await flushAuditQueue({ drainAll: true });

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 50));

      const filter = {};

      const { actionType, userRole, status, search, excludeSelfReads } = req.query;

      if (actionType && AuditLog.ACTION_TYPES.includes(String(actionType).toUpperCase())) {
        filter.actionType = String(actionType).toUpperCase();
      }

      if (userRole && VALID_ROLES.includes(String(userRole).toLowerCase())) {
        filter.userRole = String(userRole).toLowerCase();
      }

      if (status === 'success') {
        filter.statusCode = { $gte: 200, $lt: 400 };
      } else if (status === 'error') {
        filter.statusCode = { $gte: 400 };
      }

      if (excludeSelfReads === 'true') {
        filter.targetResource = { $ne: '/api/audit-logs' };
      }

      const trimmedSearch = String(search || '').trim().slice(0, 100);
      if (trimmedSearch) {
        const regex = new RegExp(escapeRegex(trimmedSearch), 'i');
        const matchedUsers = await User.find({ name: regex }).select('_id').lean();
        const matchedIds = matchedUsers.map((u) => u._id);

        const orClauses = [
          { username: regex },
          { targetResource: regex },
          { ipAddress: regex },
          { httpMethod: regex },
        ];
        if (matchedIds.length > 0) {
          orClauses.push({ userId: { $in: matchedIds } });
        }
        filter.$or = orClauses;
      }

      const [rawLogs, total, totalEvents, adminEvents, securityAlerts, exportEvents] =
        await Promise.all([
          AuditLog.find(filter)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'name username role')
            .lean(),
          AuditLog.countDocuments(filter),
          AuditLog.countDocuments(),
          AuditLog.countDocuments({ userRole: 'admin' }),
          AuditLog.countDocuments({ statusCode: { $gte: 400 } }),
          AuditLog.countDocuments({ actionType: 'EXPORT' }),
        ]);

      const logs = rawLogs.map((entry) => {
        const populatedUser =
          entry.userId && typeof entry.userId === 'object' ? entry.userId : null;

        return {
          _id: entry._id,
          userId: populatedUser ? populatedUser._id : entry.userId,
          actorName: populatedUser?.name || entry.username || 'Deleted Account',
          username: entry.username || populatedUser?.username || 'unknown',
          userRole: entry.userRole || populatedUser?.role || 'unknown',
          isDeletedUser: !populatedUser,
          actionType: entry.actionType,
          targetResource: entry.targetResource,
          httpMethod: entry.httpMethod,
          statusCode: entry.statusCode,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          timestamp: entry.timestamp,
        };
      });

      res.status(200).json({
        logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        summary: {
          totalEvents,
          adminEvents,
          securityAlerts,
          exportEvents,
        },
      });
    } catch (error) {
      console.error('Audit Log Fetch Error:', error);
      res.status(500).json({ error: 'Failed to retrieve audit history.' });
    }
  }
);

module.exports = router;

