const { getFacultyStatistics } = require('../services/facultyStatsService');
const { buildXlsxReport } = require('../services/exporters/xlsxExporter');
const { buildPdfReport } = require('../services/exporters/pdfExporter');
const { buildCsvZipReport } = require('../services/exporters/csvExporter');

// --------------------------------------------------------
// SUPPORTED EXPORT FORMATS
// Add a new format by adding an entry here + an exporter in services/exporters/.
// --------------------------------------------------------
const EXPORT_FORMATS = {
  xlsx: {
    label: 'Excel',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: (date) => `faculty-statistics-${date}.xlsx`,
    build: buildXlsxReport,
  },
  pdf: {
    label: 'PDF',
    mime: 'application/pdf',
    filename: (date) => `faculty-statistics-${date}.pdf`,
    build: buildPdfReport,
  },
  csv: {
    label: 'CSV (ZIP)',
    mime: 'application/zip',
    filename: (date) => `faculty-statistics-${date}-csv.zip`,
    build: buildCsvZipReport,
  },
};

const DEFAULT_FORMAT = 'xlsx';
const FORMAT_ALIASES = { excel: 'xlsx', zip: 'csv' };

// --------------------------------------------------------
// MIDDLEWARE: validate ?format= before any database work is done
// --------------------------------------------------------
const validateExportFormat = (req, res, next) => {
  const raw = req.query.format ?? DEFAULT_FORMAT;

  // Reject arrays (?format=pdf&format=csv) and other non-string values.
  if (typeof raw !== 'string') {
    return res.status(400).json({ error: 'The "format" parameter must be a single value.' });
  }

  const normalized = raw.trim().toLowerCase();
  const format = FORMAT_ALIASES[normalized] || normalized;

  if (!Object.prototype.hasOwnProperty.call(EXPORT_FORMATS, format)) {
    return res.status(400).json({
      error: `Unsupported export format. Supported formats: ${Object.keys(EXPORT_FORMATS).join(', ')}.`,
    });
  }

  req.exportFormat = format;
  next();
};

// --------------------------------------------------------
// CONTROLLER: GET /api/statistics/export-faculty?format=xlsx|pdf|csv
// --------------------------------------------------------
const exportFacultyStatistics = async (req, res) => {
  const format = req.exportFormat || DEFAULT_FORMAT;
  const exporter = EXPORT_FORMATS[format];
  const generatedBy = req.user?.username || 'Unknown';

  try {
    const stats = await getFacultyStatistics();

    // Build the complete file *before* sending headers so any failure still
    // returns a clean JSON error instead of a truncated/corrupt download.
    const buffer = await exporter.build(stats, generatedBy);
    const filename = exporter.filename(stats.reportDate);

    res.setHeader('Content-Type', exporter.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    // The report contains personnel data; never let browsers or proxies cache it.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    console.log(
      `[Export] Faculty statistics (${format}) exported by ${generatedBy} ` +
      `(${stats.summary.totalFaculty} faculty, ${buffer.length} bytes)`
    );
    return res.status(200).send(buffer);
  } catch (error) {
    console.error(`Faculty Statistics Export Error (${format}):`, error);
    return res.status(500).json({ error: `Failed to generate the ${exporter.label} export.` });
  }
};

module.exports = { exportFacultyStatistics, validateExportFormat, EXPORT_FORMATS };
