const Faculty = require('../models/Faculty');
const User = require('../models/User');

// --------------------------------------------------------
// CONFIGURATION
// --------------------------------------------------------

// Roles counted as "faculty members" (mirrors hasPortfolioAccess in the frontend:
// everyone except pure admins can own a credential portfolio).
const FACULTY_ROLES = ['faculty', 'program_head', 'academic_head'];

// Documents expiring within this many days are reported as "expiring soon".
const EXPIRING_SOON_DAYS = 30;

// All date comparisons use the institution's local calendar day, not the server's (Hostinger may run in UTC).
const REPORT_TIMEZONE = 'Asia/Manila';

const CORE_201_TYPES = ['201 File', 'Identification'];

// --------------------------------------------------------
// HELPERS
// --------------------------------------------------------

/** Returns YYYY-MM-DD for the given date in REPORT_TIMEZONE. */
const toLocalISODate = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/**
 * Faculty documents are linked to Users only by name (no foreign key exists),
 * so both sides must be normalized identically before joining.
 */
const normalizeName = (name = '') => String(name).toLowerCase().trim().replace(/\s+/g, ' ');

const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

const emptyCounters = () => ({
  totalDocuments: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
  aiVerified: 0,
  aiFlagged: 0,
  aiFlaggedPending: 0,
  aiFailed: 0,
  aiVerifying: 0,
  expired: 0,
  expiringSoon: 0,
});

const addCounters = (target, source) => {
  for (const key of Object.keys(emptyCounters())) {
    target[key] += source[key] || 0;
  }
};

/**
 * Derives a single, mutually-exclusive compliance status for a faculty member.
 * Rules are evaluated in priority order (see COMPLIANCE_DEFINITIONS for the exported wording).
 */
const deriveComplianceStatus = (s) => {
  if (s.totalDocuments === 0) return 'No Submissions';
  if (s.expired > 0 || s.aiFlaggedPending > 0 || (s.approved === 0 && s.rejected > 0)) return 'Action Required';
  if (s.pending > 0) return 'Pending Review';
  return 'Compliant';
};

const COMPLIANCE_STATUSES = ['Compliant', 'Pending Review', 'Action Required', 'No Submissions'];

const COMPLIANCE_DEFINITIONS = [
  ['Compliant', 'Has at least one HR-approved document, nothing pending review, and no expired documents.'],
  ['Pending Review', 'Has one or more documents awaiting HR approval (and no blocking issues).'],
  ['Action Required', `Has an expired document, an AI-flagged document still pending, or every submission was rejected.`],
  ['No Submissions', 'Has an active account but has not submitted any documents.'],
  ['Expiring Soon', `Expiration date falls within the next ${EXPIRING_SOON_DAYS} days.`],
  ['AI Verified / Flagged', 'Result of the Gemini + Tavily certificate verification pipeline (Certificates only).'],
];

// --------------------------------------------------------
// MAIN QUERY
// --------------------------------------------------------

/**
 * Aggregates faculty compliance statistics.
 * Runs exactly three DB queries (one aggregation, one find, one count) in parallel.
 */
const getFacultyStatistics = async () => {
  const now = new Date();
  const today = toLocalISODate(now);
  const soon = toLocalISODate(new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000));

  // expirationDate is a free-form String in the schema; only trust strict YYYY-MM-DD values.
  const validExpiry = {
    $cond: [
      { $regexMatch: { input: { $ifNull: ['$expirationDate', ''] }, regex: '^\\d{4}-\\d{2}-\\d{2}$' } },
      '$expirationDate',
      null,
    ],
  };
  const notRejected = { $ne: ['$status', 'rejected'] };
  const isApprovedEvaluationWithRating = {
    $and: [
      { $eq: ['$documentType', 'Faculty Evaluation'] },
      { $eq: ['$status', 'approved'] },
      { $isNumber: '$evaluationRating' },
    ],
  };

  const documentPipeline = [
    {
      $project: {
        nameKey: {
          $toLower: {
            $concat: [
              { $trim: { input: { $ifNull: ['$firstName', ''] } } },
              ' ',
              { $trim: { input: { $ifNull: ['$lastName', ''] } } },
            ],
          },
        },
        displayName: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$lastName', ''] }] },
        department: 1,
        documentType: 1,
        status: 1,
        verificationStatus: 1,
        evaluationRating: 1,
        createdAt: 1,
        expiry: validExpiry,
      },
    },
    // Newest first so $first picks the most recent department/display name.
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { nameKey: '$nameKey', documentType: '$documentType' },
        displayName: { $first: '$displayName' },
        department: { $first: '$department' },
        lastSubmissionAt: { $max: '$createdAt' },
        totalDocuments: { $sum: 1 },
        approved: countIf({ $eq: ['$status', 'approved'] }),
        pending: countIf({ $eq: ['$status', 'pending'] }),
        rejected: countIf({ $eq: ['$status', 'rejected'] }),
        aiVerified: countIf({ $eq: ['$verificationStatus', 'verified'] }),
        aiFlagged: countIf({ $eq: ['$verificationStatus', 'flagged'] }),
        aiFlaggedPending: countIf({
          $and: [{ $eq: ['$verificationStatus', 'flagged'] }, { $eq: ['$status', 'pending'] }],
        }),
        aiFailed: countIf({ $eq: ['$verificationStatus', 'failed'] }),
        aiVerifying: countIf({ $eq: ['$verificationStatus', 'verifying'] }),
        expired: countIf({ $and: [notRejected, { $ne: ['$expiry', null] }, { $lt: ['$expiry', today] }] }),
        expiringSoon: countIf({
          $and: [notRejected, { $ne: ['$expiry', null] }, { $gte: ['$expiry', today] }, { $lte: ['$expiry', soon] }],
        }),
        ratingSum: { $sum: { $cond: [isApprovedEvaluationWithRating, '$evaluationRating', 0] } },
        ratingCount: countIf(isApprovedEvaluationWithRating),
      },
    },
  ];

  const [documentGroups, facultyUsers, archivedFacultyCount] = await Promise.all([
    Faculty.aggregate(documentPipeline).allowDiskUse(true),
    User.find({ role: { $in: FACULTY_ROLES }, isArchived: { $ne: true } })
      .select('name username role department')
      .sort({ name: 1 })
      .lean(),
    User.countDocuments({ role: { $in: FACULTY_ROLES }, isArchived: true }),
  ]);

  // --- 1. Seed one stats row per active faculty account ---
  const facultyByKey = new Map();
  for (const user of facultyUsers) {
    const key = normalizeName(user.name);
    if (facultyByKey.has(key)) continue; // Duplicate names cannot be disambiguated (no FK on documents).
    facultyByKey.set(key, {
      name: user.name,
      username: user.username,
      role: user.role,
      accountDepartment: user.department || '',
      latestDocDepartment: '',
      latestDocAt: null,
      lastSubmissionAt: null,
      ...emptyCounters(),
      approved201: 0,
      approvedContract: 0,
      approvedEvaluation: 0,
      ratingSum: 0,
      ratingCount: 0,
    });
  }

  // --- 2. Fold document groups into faculty rows, per-type totals, and global totals ---
  const documentTotals = emptyCounters();
  const byDocumentType = new Map();
  const unlinked = { documents: 0, names: new Set() };

  for (const group of documentGroups) {
    const key = normalizeName(group._id.nameKey);
    const docType = group._id.documentType || 'Unspecified';
    const faculty = facultyByKey.get(key);

    if (!faculty) {
      // Document belongs to an archived user, an admin, or a name that matches no account.
      unlinked.documents += group.totalDocuments;
      unlinked.names.add(key);
      continue;
    }

    addCounters(faculty, group);
    addCounters(documentTotals, group);

    if (!byDocumentType.has(docType)) byDocumentType.set(docType, { documentType: docType, ...emptyCounters() });
    addCounters(byDocumentType.get(docType), group);

    if (CORE_201_TYPES.includes(docType)) faculty.approved201 += group.approved;
    if (docType === 'Contract') faculty.approvedContract += group.approved;
    if (docType === 'Faculty Evaluation') faculty.approvedEvaluation += group.approved;
    faculty.ratingSum += group.ratingSum;
    faculty.ratingCount += group.ratingCount;

    if (!faculty.lastSubmissionAt || group.lastSubmissionAt > faculty.lastSubmissionAt) {
      faculty.lastSubmissionAt = group.lastSubmissionAt;
    }
    if (group.department && (!faculty.latestDocAt || group.lastSubmissionAt > faculty.latestDocAt)) {
      faculty.latestDocDepartment = group.department;
      faculty.latestDocAt = group.lastSubmissionAt;
    }
  }

  // --- 3. Finalize per-faculty rows ---
  const facultyRows = Array.from(facultyByKey.values()).map((f) => ({
    name: f.name,
    username: f.username,
    role: f.role,
    department: f.accountDepartment || f.latestDocDepartment || 'Unassigned',
    complianceStatus: deriveComplianceStatus(f),
    totalDocuments: f.totalDocuments,
    approved: f.approved,
    pending: f.pending,
    rejected: f.rejected,
    aiVerified: f.aiVerified,
    aiFlagged: f.aiFlagged,
    aiFailed: f.aiFailed,
    expired: f.expired,
    expiringSoon: f.expiringSoon,
    hasApproved201: f.approved201 > 0,
    hasApprovedContract: f.approvedContract > 0,
    hasApprovedEvaluation: f.approvedEvaluation > 0,
    avgEvaluationRating: f.ratingCount > 0 ? Number((f.ratingSum / f.ratingCount).toFixed(2)) : null,
    lastSubmission: f.lastSubmissionAt ? toLocalISODate(new Date(f.lastSubmissionAt)) : '',
  }));

  // --- 4. Faculty-level summary ---
  const countWhere = (predicate) => facultyRows.filter(predicate).length;
  const statusCounts = Object.fromEntries(COMPLIANCE_STATUSES.map((s) => [s, countWhere((r) => r.complianceStatus === s)]));
  const totalFaculty = facultyRows.length;

  const summary = {
    totalFaculty,
    archivedFacultyExcluded: archivedFacultyCount,
    withApprovedDocuments: countWhere((r) => r.approved > 0),
    withPendingDocuments: countWhere((r) => r.pending > 0),
    withNoApprovedDocuments: countWhere((r) => r.approved === 0),
    withRejectedDocuments: countWhere((r) => r.rejected > 0),
    withAiVerifiedCertificates: countWhere((r) => r.aiVerified > 0),
    withAiFlaggedDocuments: countWhere((r) => r.aiFlagged > 0),
    withExpiredDocuments: countWhere((r) => r.expired > 0),
    withExpiringSoonDocuments: countWhere((r) => r.expiringSoon > 0),
    withApproved201: countWhere((r) => r.hasApproved201),
    withApprovedContract: countWhere((r) => r.hasApprovedContract),
    withApprovedEvaluation: countWhere((r) => r.hasApprovedEvaluation),
    statusCounts,
    complianceRate: totalFaculty > 0 ? statusCounts['Compliant'] / totalFaculty : 0,
  };

  // --- 5. Department breakdown ---
  const departments = new Map();
  for (const row of facultyRows) {
    if (!departments.has(row.department)) {
      departments.set(row.department, {
        department: row.department,
        facultyCount: 0,
        ...Object.fromEntries(COMPLIANCE_STATUSES.map((s) => [s, 0])),
        ...emptyCounters(),
      });
    }
    const dept = departments.get(row.department);
    dept.facultyCount += 1;
    dept[row.complianceStatus] += 1;
    addCounters(dept, row);
  }
  const byDepartment = Array.from(departments.values())
    .map((d) => ({ ...d, complianceRate: d.facultyCount > 0 ? d['Compliant'] / d.facultyCount : 0 }))
    .sort((a, b) => a.department.localeCompare(b.department));

  return {
    generatedAt: now,
    reportDate: today,
    timezone: REPORT_TIMEZONE,
    expiringSoonDays: EXPIRING_SOON_DAYS,
    summary,
    documentTotals,
    unlinkedDocuments: { documents: unlinked.documents, distinctNames: unlinked.names.size },
    byDepartment,
    byDocumentType: Array.from(byDocumentType.values()).sort((a, b) => a.documentType.localeCompare(b.documentType)),
    faculty: facultyRows,
  };
};

module.exports = {
  getFacultyStatistics,
  COMPLIANCE_STATUSES,
  COMPLIANCE_DEFINITIONS,
  FACULTY_ROLES,
};
