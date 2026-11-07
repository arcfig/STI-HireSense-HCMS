const ExcelJS = require('exceljs');
const {
  REPORT_TITLE,
  COMPLIANCE_DEFINITIONS,
  DEPARTMENT_COLUMNS,
  FACULTY_COLUMNS,
  DOCUMENT_TYPE_COLUMNS,
  ratio,
  buildReportMeta,
  buildSummarySections,
  toFacultyDisplayRow,
} = require('./reportContent');

// --------------------------------------------------------
// STYLING HELPERS
// --------------------------------------------------------
const BRAND_GREEN = 'FF1B5E20';
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN } };
const SECTION_FONT = { bold: true, size: 12, color: { argb: BRAND_GREEN } };
const STATUS_FILLS = {
  'Compliant': 'FFC8E6C9',
  'Pending Review': 'FFFFF9C4',
  'Action Required': 'FFFFCDD2',
  'No Submissions': 'FFE0E0E0',
};
const NUM_FORMATS = { percent: '0.0%', decimal: '0.00' };

const styleHeaderRow = (row) => {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
};

/** Builds a table-style sheet with a frozen, filterable header row. */
const addTableSheet = (workbook, name, columns, rows) => {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
  sheet.addRows(rows);
  styleHeaderRow(sheet.getRow(1));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const col of columns) {
    if (NUM_FORMATS[col.type]) sheet.getColumn(col.key).numFmt = NUM_FORMATS[col.type];
  }
  return sheet;
};

// --------------------------------------------------------
// WORKBOOK BUILDER
// --------------------------------------------------------
const buildWorkbook = (stats, generatedBy) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HireSense HCMS';
  workbook.created = stats.generatedAt;

  // ---- Sheet 1: Summary ----
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [{ width: 52 }, { width: 18 }, { width: 14 }];

  sheet.addRow([REPORT_TITLE]).font = { bold: true, size: 16, color: { argb: BRAND_GREEN } };
  for (const metaRow of buildReportMeta(stats, generatedBy)) sheet.addRow(metaRow);
  sheet.addRow([]);

  for (const section of buildSummarySections(stats)) {
    const hasPercent = section.percentOf !== undefined;
    sheet.addRow([section.title]).font = SECTION_FONT;
    const header = sheet.addRow(['Metric', 'Count', hasPercent ? '% of Total' : '']);
    styleHeaderRow(header);
    header.height = 20;
    for (const [label, value] of section.rows) {
      const row = sheet.addRow([label, value, hasPercent ? ratio(value, section.percentOf) : null]);
      if (hasPercent) row.getCell(3).numFmt = NUM_FORMATS.percent;
    }
    sheet.addRow([]);
  }

  sheet.addRow(['Definitions']).font = SECTION_FONT;
  for (const [term, definition] of COMPLIANCE_DEFINITIONS) {
    const row = sheet.addRow([term, definition]);
    row.getCell(1).font = { bold: true };
    sheet.mergeCells(row.number, 2, row.number, 3);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }

  // ---- Sheet 2: By Department ----
  addTableSheet(workbook, 'By Department', DEPARTMENT_COLUMNS, stats.byDepartment);

  // ---- Sheet 3: Faculty Detail ----
  const facultySheet = addTableSheet(workbook, 'Faculty Detail', FACULTY_COLUMNS, stats.faculty.map(toFacultyDisplayRow));
  facultySheet.getColumn('complianceStatus').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
    const argb = STATUS_FILLS[cell.value];
    if (rowNumber > 1 && argb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });

  // ---- Sheet 4: By Document Type ----
  addTableSheet(workbook, 'By Document Type', DOCUMENT_TYPE_COLUMNS, stats.byDocumentType);

  return workbook;
};

/** Builds the faculty statistics workbook and returns it as a Buffer. */
const buildXlsxReport = async (stats, generatedBy) => {
  const workbook = buildWorkbook(stats, generatedBy);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

module.exports = { buildXlsxReport };

