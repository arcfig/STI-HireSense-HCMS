import toast from 'react-hot-toast';

const escapeCsv = (val) => {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const getAuthToken = () => {
  try {
    return JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}')?.token;
  } catch {
    return null;
  }
};

/**
 * Exports a single faculty member's 201 portfolio as a formatted Excel (.xlsx) workbook.
 */
export const exportPortfolioXLSX = async (payload) => {
  const token = getAuthToken();
  const safeFileName = (payload.fullName || 'Faculty')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_');

  const toastId = toast.loading('Generating Excel (.xlsx) portfolio...');
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/portfolio/export-xlsx`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Failed to generate Excel workbook.');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HireSense_Portfolio_${safeFileName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    toast.success(`Portfolio Excel (.xlsx) exported for ${payload.fullName}!`, { id: toastId });
  } catch (error) {
    toast.error(error.message || 'Excel export failed.', { id: toastId });
  }
};

/**
 * Exports a single faculty member's 201 portfolio as a structured CSV spreadsheet.
 */
export const exportPortfolioCSV = ({
  fullName,
  department,
  overallRating,
  skills = [],
  eligibleSubjects = [],
  documents = []
}) => {
  const safeFileName = (fullName || 'Faculty')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_');

  const lines = [
    ['HireSense - Official Faculty 201 Portfolio Dossier'].map(escapeCsv).join(','),
    ['Faculty Name', fullName || 'N/A', 'Department', department || 'N/A'].map(escapeCsv).join(','),
    [
      'Overall Evaluation Score',
      overallRating && Number(overallRating) > 0 ? `${overallRating} / 5.00` : 'No Evaluations Yet',
      'Report Generated',
      new Date().toLocaleDateString()
    ].map(escapeCsv).join(','),
    ['Approved Teaching Eligibilities', eligibleSubjects.length > 0 ? eligibleSubjects.join('; ') : 'None'].map(escapeCsv).join(','),
    ['Verified Skill Proficiencies', skills.length > 0 ? skills.join('; ') : 'None'].map(escapeCsv).join(','),
    '',
    [
      'Document Type',
      'Document Title',
      'Issuing Institution',
      'Date Issued / Added',
      'Expiration Date',
      'Academic Year / Term',
      'Evaluation Rating',
      'Extracted Skills / Tags',
      'Document URL'
    ].map(escapeCsv).join(',')
  ];

  documents.forEach((doc) => {
    const issued = doc.dateReceived
      ? doc.dateReceived.split('T')[0]
      : doc.createdAt
      ? new Date(doc.createdAt).toLocaleDateString()
      : '';
    const expires = doc.expirationDate ? doc.expirationDate.split('T')[0] : 'N/A';
    const period = [doc.academicYear, doc.term].filter(Boolean).join(' ') || 'N/A';
    const rating = doc.evaluationRating ?? 'N/A';
    const tags = Array.isArray(doc.tags) ? doc.tags.filter(Boolean).join('; ') : '';

    lines.push(
      [
        doc.documentType || '',
        doc.documentTitle || '',
        doc.issuingInstitution || 'N/A',
        issued,
        expires,
        period,
        rating,
        tags,
        doc.documentUrl || ''
      ]
        .map(escapeCsv)
        .join(',')
    );
  });

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HireSense_Portfolio_${safeFileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  toast.success(`Portfolio CSV exported for ${fullName}!`);
};

/**
 * Opens a print-ready institutional 201 Portfolio Dossier (Save as PDF / Print).
 */
export const exportPortfolioPDF = ({
  fullName,
  department,
  overallRating,
  skills = [],
  eligibleSubjects = [],
  documents = []
}) => {
  const printWindow = window.open('', '_blank', 'width=960,height=800');
  if (!printWindow) {
    toast.error('Pop-up blocked. Please allow pop-ups to print or save the PDF dossier.');
    return;
  }

  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const skillsHtml =
    skills.length > 0
      ? skills.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join('')
      : '<span class="muted">No verified skills indexed yet.</span>';

  const subjectsHtml =
    eligibleSubjects.length > 0
      ? eligibleSubjects.map((sub) => `<span class="chip chip-primary">${escapeHtml(sub)}</span>`).join('')
      : '<span class="muted">No course teaching eligibilities verified yet.</span>';

  const rowsHtml =
    documents.length > 0
      ? documents
          .map((doc) => {
            const issued = doc.dateReceived
              ? doc.dateReceived.split('T')[0]
              : doc.createdAt
              ? new Date(doc.createdAt).toLocaleDateString()
              : 'N/A';
            const expires = doc.expirationDate ? doc.expirationDate.split('T')[0] : '—';
            const detailsParts = [];
            if (doc.issuingInstitution) detailsParts.push(`Issuer: ${doc.issuingInstitution}`);
            if (doc.academicYear || doc.term) detailsParts.push(`Period: ${[doc.academicYear, doc.term].filter(Boolean).join(' ')}`);
            if (doc.evaluationRating) detailsParts.push(`Rating: ${doc.evaluationRating} / 5.00`);
            if (doc.intent) detailsParts.push(`Intent: ${doc.intent}`);

            return `
              <tr>
                <td><strong>${escapeHtml(doc.documentType || 'Credential')}</strong></td>
                <td>${escapeHtml(doc.documentTitle || 'Untitled')}</td>
                <td>${escapeHtml(detailsParts.join(' • ') || '—')}</td>
                <td>${escapeHtml(issued)}</td>
                <td>${escapeHtml(expires)}</td>
              </tr>
            `;
          })
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:#6b7280;">No verified documents on file.</td></tr>';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>201 Portfolio Dossier - ${escapeHtml(fullName)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      color: #1f2937;
      margin: 0;
      padding: 32px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #08612F;
      padding-bottom: 16px;
      margin-bottom: 22px;
    }
    .brand {
      font-size: 22px;
      font-weight: 800;
      color: #08612F;
      letter-spacing: -0.3px;
    }
    .subtitle {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 2px;
    }
    .meta {
      text-align: right;
      font-size: 12px;
      color: #4b5563;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 22px;
    }
    .summary-card {
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .summary-label {
      font-size: 11px;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .summary-value {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #08612F;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .chip-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: inline-block;
      font-size: 11.5px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      color: #1f2937;
      font-weight: 600;
    }
    .chip-primary {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #065f46;
    }
    .muted {
      font-size: 12.5px;
      color: #6b7280;
      font-style: italic;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #08612F;
      color: #ffffff;
      font-weight: 700;
      font-size: 11.5px;
      text-transform: uppercase;
    }
    tr:nth-child(even) td {
      background: #f9fafb;
    }
    .signatures {
      margin-top: 44px;
      display: flex;
      justify-content: space-between;
      gap: 40px;
      page-break-inside: avoid;
    }
    .sig-box {
      flex: 1;
      border-top: 1px solid #374151;
      padding-top: 6px;
      font-size: 12px;
      color: #4b5563;
      text-align: center;
    }
    @media print {
      body { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">HireSense — Faculty 201 Portfolio Dossier</div>
      <div class="subtitle">Institutional Human Capital &amp; Competency Record</div>
    </div>
    <div class="meta">
      <div><strong>Date Generated:</strong> ${escapeHtml(generatedDate)}</div>
      <div><strong>Status:</strong> HR Verified Portfolio</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-label">Faculty Member</div>
      <div class="summary-value">${escapeHtml(fullName || 'N/A')}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Academic Department</div>
      <div class="summary-value">${escapeHtml(department || 'Unassigned')}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Verified 201 Documents</div>
      <div class="summary-value">${documents.length} Record(s)</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Evaluation Average</div>
      <div class="summary-value">${overallRating && Number(overallRating) > 0 ? `${escapeHtml(overallRating)} / 5.00` : 'N/A'}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Approved Teaching Eligibilities (${eligibleSubjects.length})</div>
    <div class="chip-wrap">${subjectsHtml}</div>
  </div>

  <div class="section">
    <div class="section-title">Verified Skill Proficiencies (${skills.length})</div>
    <div class="chip-wrap">${skillsHtml}</div>
  </div>

  <div class="section">
    <div class="section-title">Verified 201 Document &amp; Credential Inventory (${documents.length})</div>
    <table>
      <thead>
        <tr>
          <th style="width: 18%;">Category</th>
          <th style="width: 28%;">Document Title</th>
          <th style="width: 30%;">Institution / Evaluation Details</th>
          <th style="width: 12%;">Issued</th>
          <th style="width: 12%;">Expires</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>

  <div class="signatures">
    <div class="sig-box">
      <strong>${escapeHtml(fullName || 'Faculty Member')}</strong><br/>
      Faculty Signature Over Printed Name
    </div>
    <div class="sig-box">
      <strong>Human Resources / Academic Head</strong><br/>
      Verified &amp; Certified Correct
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

/**
 * Dispatcher for single faculty portfolio export by format ('pdf' | 'xlsx' | 'csv').
 */
export const exportPortfolioByFormat = (format, payload) => {
  if (format === 'pdf') return exportPortfolioPDF(payload);
  if (format === 'xlsx') return exportPortfolioXLSX(payload);
  return exportPortfolioCSV(payload);
};

/**
 * Exports the filtered Faculty Directory overview as a styled Excel (.xlsx) workbook.
 */
export const exportDirectoryXLSX = async (facultyList = []) => {
  const token = getAuthToken();
  const toastId = toast.loading('Generating Faculty Directory (.xlsx)...');
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/directory/export-xlsx`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ facultyList })
    });

    if (!response.ok) {
      throw new Error('Failed to generate Excel workbook.');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HireSense_Faculty_Directory_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${facultyList.length} faculty profile(s) to Excel (.xlsx)!`, { id: toastId });
  } catch (error) {
    toast.error(error.message || 'Excel export failed.', { id: toastId });
  }
};

/**
 * Exports the filtered Faculty Directory overview as a CSV report.
 */
export const exportDirectoryCSV = (facultyList = []) => {
  const lines = [
    [
      'Faculty Name',
      'Department',
      'Verified Credentials Count',
      'Approved Subject Eligibilities',
      'Verified Skills'
    ]
      .map(escapeCsv)
      .join(',')
  ];

  facultyList.forEach((f) => {
    lines.push(
      [
        f.fullName || '',
        f.department || '',
        f.documentCount ?? 0,
        Array.isArray(f.eligibleSubjects) ? f.eligibleSubjects.join('; ') : '',
        Array.isArray(f.tags) ? f.tags.join('; ') : ''
      ]
        .map(escapeCsv)
        .join(',')
    );
  });

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HireSense_Faculty_Directory_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  toast.success(`Exported ${facultyList.length} faculty profile(s) to CSV!`);
};

/**
 * Exports the filtered Faculty Directory overview as a printable PDF summary report.
 */
export const exportDirectoryPDF = (facultyList = []) => {
  const printWindow = window.open('', '_blank', 'width=960,height=800');
  if (!printWindow) {
    toast.error('Pop-up blocked. Please allow pop-ups to print or save the PDF report.');
    return;
  }

  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const rowsHtml =
    facultyList.length > 0
      ? facultyList
          .map(
            (f) => `
          <tr>
            <td><strong>${escapeHtml(f.fullName)}</strong></td>
            <td>${escapeHtml(f.department || 'Unassigned')}</td>
            <td style="text-align:center;">${escapeHtml(f.documentCount ?? 0)}</td>
            <td>${escapeHtml(Array.isArray(f.eligibleSubjects) && f.eligibleSubjects.length > 0 ? f.eligibleSubjects.join(', ') : '—')}</td>
            <td>${escapeHtml(Array.isArray(f.tags) && f.tags.length > 0 ? f.tags.slice(0, 12).join(', ') : '—')}</td>
          </tr>
        `
          )
          .join('')
      : '<tr><td colspan="5" style="text-align:center;">No faculty profiles found.</td></tr>';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>HireSense - Faculty Directory Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2937; padding: 28px; }
    .header { display: flex; justify-content: space-between; border-bottom: 3px solid #08612F; padding-bottom: 14px; margin-bottom: 20px; }
    .brand { font-size: 20px; font-weight: 800; color: #08612F; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #08612F; color: #fff; text-transform: uppercase; font-size: 11px; }
    tr:nth-child(even) td { background: #f9fafb; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">HireSense — Institutional Faculty Competency Directory</div>
      <div style="font-size:12px;color:#6b7280;">Total Profiles: ${facultyList.length}</div>
    </div>
    <div style="font-size:12px;color:#4b5563;"><strong>Generated:</strong> ${escapeHtml(generatedDate)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:20%;">Faculty Name</th>
        <th style="width:18%;">Department</th>
        <th style="width:10%;">Docs</th>
        <th style="width:22%;">Eligible Subjects</th>
        <th style="width:30%;">Verified Skills</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

/**
 * Dispatcher for Faculty Directory export by format ('xlsx' | 'csv' | 'pdf').
 */
export const exportDirectoryByFormat = (format, facultyList) => {
  if (format === 'xlsx') return exportDirectoryXLSX(facultyList);
  if (format === 'pdf') return exportDirectoryPDF(facultyList);
  return exportDirectoryCSV(facultyList);
};
