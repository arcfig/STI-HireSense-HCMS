const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { exportFacultyStatistics } = require('../controllers/statisticsController');

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
// ROUTE: Export Faculty Compliance Statistics (.xlsx) (Secured: Admins and Heads)
// --------------------------------------------------------
router.get(
  '/export-faculty',
  exportLimiter,
  verifyToken,
  requireRole(STATISTICS_EXPORT_ROLES),
  exportFacultyStatistics
);

module.exports = router;
