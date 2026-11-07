const archiver = require('archiver');
const {
  REPORT_TITLE,
  COMPLIANCE_DEFINITIONS,
  ratio,
  buildReportMeta,
  buildSummarySections,
  buildDetailTables,
} = require('./reportContent');

// UTF-8 byte-order mark so Excel opens accented names (e.g. "Peña") correctly.
const BOM = '\uFEFF';
// RFC 4180 line ending.
const EOL = '\r\n';

// --------------------------------------------------------
// CSV ENCODING
// --------------------------------------------------------

/**
 * Escapes a single CSV field.
 * - Strings starting with = + - @ TAB or CR are prefixed with a single quote to block
 *   CSV/formula injection when the file is opened in Excel or Google Sheets (OWASP).
 * - Fields containing commas, quotes or newlines are quoted, with quotes doubled.
 */
const escapeField = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (headers, rows) =>
  BOM + [headers, ...rows].map((row) => row.map(escapeField).join(',')).join(EOL) + EOL;

/** Converts a value to a CSV-friendly number (percentages become 0-100 with one decimal). */
const csvValue = (value, type) => {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'percent') return Math.round(Number(value) * 1000) / 10;
  if (type === 'decimal') return Math.round(Number(value) * 100) / 100;
  return value;
};

// --------------------------------------------------------
// FILE BUILDERS
// --------------------------------------------------------
const buildSummaryCsv = (stats) => {
  const rows = [];
  for (const section of buildSummarySections(stats)) {
    const hasPercent = section.percentOf !== undefined;
    for (const [label, value] of section.rows) {
      rows.push([section.title, label, value, hasPercent ? csvValue(ratio(value, section.percentOf), 'percent') : '']);
    }
  }
  return toCsv(['Section', 'Metric', 'Count', 'Percent of Total (%)'], rows);
};

const buildTableCsv = ({ columns, rows }) =>
  toCsv(
    columns.map((c) => (c.type === 'percent' ? `${c.header} (%)` : c.header)),
    rows.map((row) => columns.map((c) => csvValue(row[c.key], c.type)))
  );

const buildReadme = (stats, generatedBy, files) =>
  [
    `${REPORT_TITLE} - CSV Export`,
    '='.repeat(40),
    '',
    ...buildReportMeta(stats, generatedBy).map(([label, value]) => `${label}: ${value}`),
    '',
    'FILES',
    ...files.map(({ name, description }) => `  ${name.padEnd(28)} ${description}`),
    '',
    'NOTES',
    '  - Files are UTF-8 encoded (with BOM) and comma-separated (RFC 4180).',
    '  - Percentages are expressed as numbers from 0 to 100.',
    "  - Text values beginning with = + - or @ are prefixed with ' to prevent spreadsheet formula execution.",
    '',
    'DEFINITIONS',
    ...COMPLIANCE_DEFINITIONS.map(([term, definition]) => `  ${term}: ${definition}`),
    '',
  ].join(EOL);

/** Zips an array of { name, content } entries into a single Buffer. */
const zipToBuffer = (entries, date) =>
  new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('warning', reject);
    archive.on('error', reject);

    for (const { name, content } of entries) archive.append(content, { name, date });
    archive.finalize().catch(reject);
  });

// --------------------------------------------------------
// PUBLIC API
// --------------------------------------------------------

/** Builds one CSV per dataset, bundles them (plus a README) into a ZIP, and returns the Buffer. */
const buildCsvZipReport = async (stats, generatedBy) => {
  const [departments, faculty, documentTypes] = buildDetailTables(stats);

  const files = [
    { name: '01_summary.csv', description: 'Aggregate faculty and document metrics', content: buildSummaryCsv(stats) },
    { name: '02_by_department.csv', description: 'Compliance breakdown per department', content: buildTableCsv(departments) },
    { name: '03_faculty_detail.csv', description: 'One row per active faculty member', content: buildTableCsv(faculty) },
    { name: '04_by_document_type.csv', description: 'Document counts per document type', content: buildTableCsv(documentTypes) },
  ];

  const folder = `faculty-statistics-${stats.reportDate}`;
  const entries = [
    ...files.map(({ name, content }) => ({ name: `${folder}/${name}`, content })),
    { name: `${folder}/README.txt`, content: buildReadme(stats, generatedBy, files) },
  ];

  return zipToBuffer(entries, stats.generatedAt);
};

module.exports = { buildCsvZipReport, escapeField };

