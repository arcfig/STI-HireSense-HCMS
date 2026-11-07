const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { auditLogger } = require('../middleware/auditLogger');
const { exportFacultyStatistics, validateExportFormat } = require('../controllers/statisticsController');

// Same roles that can open the HR Dashboard (where the export button lives).
// Change to ['admin'] to restrict exports to administrators only.
const STATISTICS_EXPORT_ROLES = ['admin', 'academic_head', 'program_head'];

// Report generation is heavier than a normal request; cap it per IP.
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many export requests. Please wait a minute and try again.' },
});

// --------------------------------------------------------
// ROUTE: Export Faculty Compliance Statistics (Secured: Admins and Heads)
//   GET /api/statistics/export-faculty?format=xlsx   -> Excel workbook (default)
//   GET /api/statistics/export-faculty?format=pdf    -> PDF report
//   GET /api/statistics/export-faculty?format=csv    -> ZIP of CSV files
// Format is validated only after auth, so unauthenticated callers can't probe the endpoint.
// --------------------------------------------------------
router.get(
  '/export-faculty',
  exportLimiter,
  verifyToken,
  auditLogger({ actionType: 'EXPORT' }),
  requireRole(STATISTICS_EXPORT_ROLES),
  validateExportFormat,
  exportFacultyStatistics
);

module.exports = router;
