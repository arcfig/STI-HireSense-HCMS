const PDFDocument = require('pdfkit');
const {
  REPORT_TITLE,
  COMPLIANCE_DEFINITIONS,
  ratio,
  buildReportMeta,
  buildSummarySections,
  buildDetailTables,
} = require('./reportContent');

// --------------------------------------------------------
// THEME
// Built-in Helvetica is used so no font files need to be deployed to Hostinger.
// --------------------------------------------------------
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const MARGIN = 40;
const COLORS = {
  brand: '#1B5E20',
  brandDark: '#091F0C',
  text: '#212529',
  muted: '#6C757D',
  stripe: '#F4F8F4',
  border: '#D5DDD5',
  white: '#FFFFFF',
};
const STATUS_FILLS = {
  'Compliant': '#C8E6C9',
  'Pending Review': '#FFF9C4',
  'Action Required': '#FFCDD2',
  'No Submissions': '#E0E0E0',
};
const NUMERIC_TYPES = new Set(['number', 'percent', 'decimal']);

// --------------------------------------------------------
// LAYOUT HELPERS
// --------------------------------------------------------
const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const pageBottom = (doc) => doc.page.height - doc.page.margins.bottom;

/** Adds a page with the given orientation (defaults to the current page's orientation). */
const addPage = (doc, layout = doc.page.layout) => {
  doc.addPage({ size: 'A4', layout, margin: MARGIN });
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
};

/** Starts a new page if fewer than `height` points remain on the current one. */
const ensureSpace = (doc, height) => {
  if (doc.y + height > pageBottom(doc)) addPage(doc);
};

const formatCell = (value, type) => {
  if (value === null || value === undefined || value === '') return NUMERIC_TYPES.has(type) ? '-' : '';
  if (type === 'percent') return `${(Number(value) * 100).toFixed(1)}%`;
  if (type === 'decimal') return Number(value).toFixed(2);
  return String(value);
};

const sectionHeading = (doc, title, subtitle) => {
  ensureSpace(doc, 70); // Heading + at least a table header and one row, so headings are never orphaned.
  const x = doc.page.margins.left;
  doc.font(FONT_BOLD).fontSize(13).fillColor(COLORS.brand).text(title, x, doc.y);
  if (subtitle) doc.font(FONT).fontSize(8.5).fillColor(COLORS.muted).text(subtitle, x);
  const lineY = doc.y + 3;
  doc.moveTo(x, lineY).lineTo(x + contentWidth(doc), lineY).lineWidth(1).strokeColor(COLORS.brand).stroke();
  doc.y = lineY + 8;
};

/**
 * Draws a paginated table. The header row is repeated on every page and rows are
 * never split across pages.
 *   columns: [{ header, key, pdf (weight), type }]
 *   cellStyle(column, rawValue, row) => { fill?, bold?, color? }
 */
const drawTable = (doc, { columns, rows, width = contentWidth(doc), fontSize = 8, cellStyle }) => {
  const x = doc.page.margins.left;
  const pad = 4;
  const totalWeight = columns.reduce((sum, c) => sum + (c.pdf || 1), 0);
  const widths = columns.map((c) => (width * (c.pdf || 1)) / totalWeight);
  const alignOf = (col) => (NUMERIC_TYPES.has(col.type) ? 'right' : 'left');

  const measureRow = (cells, font) => {
    doc.font(font).fontSize(fontSize);
    const heights = cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - pad * 2 }));
    return Math.max(...heights) + pad * 2;
  };

  const headerCells = columns.map((c) => c.header);
  const drawHeader = () => {
    const height = measureRow(headerCells, FONT_BOLD);
    const y = doc.y;
    doc.rect(x, y, width, height).fill(COLORS.brand);
    let cx = x;
    headerCells.forEach((text, i) => {
      doc.font(FONT_BOLD).fontSize(fontSize).fillColor(COLORS.white)
        .text(text, cx + pad, y + pad, { width: widths[i] - pad * 2, align: alignOf(columns[i]) });
      cx += widths[i];
    });
    doc.y = y + height;
  };

  ensureSpace(doc, measureRow(headerCells, FONT_BOLD) + 20);
  drawHeader();

  const bodyRows = rows.length > 0 ? rows : [null];
  bodyRows.forEach((row, rowIndex) => {
    const cells = row
      ? columns.map((c) => formatCell(row[c.key], c.type))
      : columns.map((_, i) => (i === 0 ? 'No data available.' : ''));
    const height = measureRow(cells, FONT);

    if (doc.y + height > pageBottom(doc)) {
      addPage(doc);
      drawHeader();
    }

    const y = doc.y;
    if (rowIndex % 2 === 1) doc.rect(x, y, width, height).fill(COLORS.stripe);

    let cx = x;
    cells.forEach((text, i) => {
      const style = (row && cellStyle?.(columns[i], row[columns[i].key], row)) || {};
      if (style.fill) doc.rect(cx, y, widths[i], height).fill(style.fill);
      doc.font(style.bold ? FONT_BOLD : FONT).fontSize(fontSize).fillColor(style.color || (row ? COLORS.text : COLORS.muted))
        .text(text, cx + pad, y + pad, { width: widths[i] - pad * 2, align: alignOf(columns[i]) });
      cx += widths[i];
    });

    doc.moveTo(x, y + height).lineTo(x + width, y + height).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.y = y + height;
  });

  doc.x = x;
  doc.y += 14;
};

// --------------------------------------------------------
// REPORT SECTIONS
// --------------------------------------------------------
const drawTitleBlock = (doc, stats, generatedBy) => {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const bandTop = doc.page.margins.top;

  doc.rect(x, bandTop, width, 64).fill(COLORS.brandDark);
  doc.font(FONT_BOLD).fontSize(20).fillColor(COLORS.white).text(REPORT_TITLE, x + 18, bandTop + 14, { width: width - 36 });
  doc.font(FONT).fontSize(10).fillColor('#C8E6C9').text('HireSense Human Capital Management System', x + 18, bandTop + 40);
  doc.y = bandTop + 78;

  for (const [label, value] of buildReportMeta(stats, generatedBy)) {
    const y = doc.y;
    doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.muted).text(`${label}:`, x, y, { width: 80 });
    doc.font(FONT).fontSize(9).fillColor(COLORS.text).text(String(value), x + 80, y, { width: width - 80 });
  }
  doc.y += 12;
};

const drawKpiCards = (doc, stats) => {
  const { summary, documentTotals } = stats;
  const cards = [
    { label: 'Total Faculty', value: summary.totalFaculty, accent: COLORS.brand },
    { label: 'Compliance Rate', value: `${(summary.complianceRate * 100).toFixed(1)}%`, accent: '#2E7D32' },
    { label: 'Total Documents', value: documentTotals.totalDocuments, accent: '#1565C0' },
    { label: 'Pending Review', value: summary.statusCounts['Pending Review'], accent: '#F9A825' },
    { label: 'Action Required', value: summary.statusCounts['Action Required'], accent: '#C62828' },
    { label: 'No Submissions', value: summary.statusCounts['No Submissions'], accent: '#757575' },
  ];

  const perRow = 3;
  const gap = 10;
  const cardWidth = (contentWidth(doc) - gap * (perRow - 1)) / perRow;
  const cardHeight = 54;
  const x0 = doc.page.margins.left;

  ensureSpace(doc, Math.ceil(cards.length / perRow) * (cardHeight + gap));
  const y0 = doc.y;

  cards.forEach((card, i) => {
    const x = x0 + (i % perRow) * (cardWidth + gap);
    const y = y0 + Math.floor(i / perRow) * (cardHeight + gap);
    doc.roundedRect(x, y, cardWidth, cardHeight, 4).fillAndStroke(COLORS.white, COLORS.border);
    doc.rect(x, y, 4, cardHeight).fill(card.accent);
    doc.font(FONT_BOLD).fontSize(20).fillColor(COLORS.text).text(String(card.value), x + 14, y + 9, { width: cardWidth - 20 });
    doc.font(FONT).fontSize(8.5).fillColor(COLORS.muted).text(card.label.toUpperCase(), x + 14, y + 35, { width: cardWidth - 20 });
  });

  doc.x = x0;
  doc.y = y0 + Math.ceil(cards.length / perRow) * (cardHeight + gap) + 8;
};

const drawSummarySections = (doc, stats) => {
  for (const section of buildSummarySections(stats)) {
    const hasPercent = section.percentOf !== undefined;
    sectionHeading(doc, section.title);

    const columns = [
      { header: 'Metric', key: 'label', pdf: 5, type: 'text' },
      { header: 'Count', key: 'value', pdf: 1, type: 'number' },
      ...(hasPercent ? [{ header: '% of Total', key: 'percent', pdf: 1.2, type: 'percent' }] : []),
    ];
    const rows = section.rows.map(([label, value]) => ({
      label,
      value,
      percent: hasPercent ? ratio(value, section.percentOf) : null,
    }));

    drawTable(doc, { columns, rows, fontSize: 9 });
  }
};

const drawDefinitions = (doc) => {
  sectionHeading(doc, 'Definitions');
  drawTable(doc, {
    columns: [
      { header: 'Term', key: 'term', pdf: 1.3, type: 'text' },
      { header: 'Definition', key: 'definition', pdf: 4, type: 'text' },
    ],
    rows: COMPLIANCE_DEFINITIONS.map(([term, definition]) => ({ term, definition })),
    fontSize: 8.5,
    cellStyle: (col) => (col.key === 'term' ? { bold: true } : null),
  });
};

const TABLE_SUBTITLES = {
  by_department: 'Compliance status and document counts grouped by department.',
  faculty_detail: 'One row per active faculty member. Username, role, AI-failed and expiring-soon counts are in the Excel/CSV exports.',
  by_document_type: 'Document counts for active faculty, grouped by document category.',
};

/** Footer + running header on every page (requires bufferPages: true). */
const drawPageChrome = (doc, stats) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { width, height, margins } = doc.page;
    const usable = width - margins.left - margins.right;

    // Writing inside the bottom margin would otherwise trigger an automatic page break.
    const originalBottom = margins.bottom;
    doc.page.margins.bottom = 0;

    if (i > range.start) {
      doc.font(FONT).fontSize(7.5).fillColor(COLORS.muted)
        .text(`${REPORT_TITLE}  |  ${stats.reportDate}`, margins.left, 20, { width: usable, align: 'right' });
    }

    const footerY = height - 26;
    doc.moveTo(margins.left, footerY - 6).lineTo(width - margins.right, footerY - 6).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.font(FONT).fontSize(7.5).fillColor(COLORS.muted)
      .text('CONFIDENTIAL - Contains personnel data. For authorized HR use only.', margins.left, footerY, { width: usable, align: 'left' });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, margins.left, footerY, { width: usable, align: 'right' });

    doc.page.margins.bottom = originalBottom;
  }
};

const collectBuffer = (doc) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

// --------------------------------------------------------
// PUBLIC API
// --------------------------------------------------------

/**
 * Builds the PDF report and returns it as a Buffer.
 * Layout: portrait summary pages (title, KPI cards, summary tables, definitions),
 * then landscape pages for the wide detail tables.
 */
const buildPdfReport = async (stats, generatedBy) => {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${REPORT_TITLE} - ${stats.reportDate}`,
      Author: 'HireSense HCMS',
      Subject: 'Faculty compliance statistics export',
      Creator: `HireSense HCMS (exported by ${generatedBy})`,
      CreationDate: stats.generatedAt,
    },
  });
  const bufferPromise = collectBuffer(doc);

  // --- Part 1: Summary (portrait) ---
  drawTitleBlock(doc, stats, generatedBy);
  drawKpiCards(doc, stats);
  drawSummarySections(doc, stats);
  drawDefinitions(doc);

  // --- Part 2: Detail tables (landscape) ---
  const tables = buildDetailTables(stats);
  tables.forEach((table, index) => {
    // Department + Faculty Detail each start on a fresh landscape page; Document Type follows on.
    if (index === 0 || table.id === 'faculty_detail') addPage(doc, 'landscape');
    sectionHeading(doc, table.title, TABLE_SUBTITLES[table.id]);
    drawTable(doc, {
      columns: table.columns.filter((c) => c.pdf),
      rows: table.rows,
      fontSize: table.id === 'faculty_detail' ? 7.5 : 8,
      cellStyle: (col, value) =>
        col.key === 'complianceStatus' && STATUS_FILLS[value] ? { fill: STATUS_FILLS[value], bold: true } : null,
    });
  });

  drawPageChrome(doc, stats);
  doc.end();
  return bufferPromise;
};

module.exports = { buildPdfReport };

