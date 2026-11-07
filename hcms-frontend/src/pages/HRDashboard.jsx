import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import ExportFacultyStatsButton from '../components/ExportFacultyStatsButton';

const VERIFICATION_STATUS_META = {
  verified: {
    variantClass: 'verification-result-card--verified',
    icon: 'bi-shield-fill-check',
    label: 'AI Verified',
  },
  flagged: {
    variantClass: 'verification-result-card--flagged',
    icon: 'bi-exclamation-triangle-fill',
    label: 'Needs Review',
  },
  failed: {
    variantClass: 'verification-result-card--failed',
    icon: 'bi-x-octagon-fill',
    label: 'Verification Failed',
  },
};

function HRDashboard({ user }) {
  const [pendingFaculty, setPendingFaculty] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDept, setFilterDept] = useState('');

  // State to track editing
  const [editingDoc, setEditingDoc] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // State to manage the confirmation modal and remarks
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    facultyId: null,
    newStatus: '',
    remarks: ''
  });

  const [previewDoc, setPreviewDoc] = useState({ isOpen: false, url: '', title: '' });
  const [reportDoc, setReportDoc] = useState(null);

  // Track in-flight verification requests locally for instant button lock before server round-trip
  const [submittingIds, setSubmittingIds] = useState(() => new Set());
  // Track the most recently updated verification card so useEffect can auto-scroll it into view
  const [scrollTarget, setScrollTarget] = useState(null);
  const resultCardRefs = useRef({});
  const reportModalRef = useRef(null);

  // 1. Retrieve the token once at the top so all functions can use it
  const savedUser = JSON.parse(sessionStorage.getItem('hireSenseUser'));
  const token = savedUser?.token;

  // --- FETCH PENDING ---
  const fetchPending = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/pending`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (response.ok) {
        setPendingFaculty(data);
      } else {
        console.error("Backend refused the request:", data.error);
      }
    } catch (error) {
      console.error("Error fetching pending data:", error);
    }
  }, [token]);

  useEffect(() => {
    let ignore = false;
    const loadInitialPending = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/pending`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await response.json();
        if (!ignore && response.ok) {
          setPendingFaculty(data);
        }
      } catch (error) {
        if (!ignore) console.error("Error fetching pending data:", error);
      }
    };
    loadInitialPending();
    return () => { ignore = true; };
  }, [token]);

  // Listen to global verification events to refresh the table and auto-scroll to the completed result
  useEffect(() => {
    const handleVerificationComplete = (event) => {
      const completedId = event?.detail?.facultyId;
      fetchPending();
      if (completedId) {
        setSubmittingIds(prev => {
          if (!prev.has(completedId)) return prev;
          const next = new Set(prev);
          next.delete(completedId);
          return next;
        });
        setScrollTarget({ id: completedId, timestamp: Date.now() });
      }
    };
    window.addEventListener('verificationCompleted', handleVerificationComplete);
    return () => window.removeEventListener('verificationCompleted', handleVerificationComplete);
  }, [fetchPending]);

  // Auto-scroll viewport to the verification result container when triggered or completed
  useEffect(() => {
    if (!scrollTarget?.id) return undefined;

    const timer = setTimeout(() => {
      const targetNode = resultCardRefs.current[scrollTarget.id];
      if (targetNode) {
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof targetNode.focus === 'function') {
          targetNode.focus({ preventScroll: true });
        }
      }
    }, 80);

    const clearHighlightTimer = setTimeout(() => {
      setScrollTarget(prev => (prev?.timestamp === scrollTarget.timestamp ? null : prev));
    }, 3400);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearHighlightTimer);
    };
  }, [scrollTarget, pendingFaculty]);

  // Auto-scroll and focus the detailed report modal container immediately when opened
  useEffect(() => {
    if (reportDoc && reportModalRef.current) {
      reportModalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      reportModalRef.current.focus({ preventScroll: true });
    }
  }, [reportDoc]);

  // --- MODAL HANDLERS ---
  const openConfirmDialog = (id, status) => {
    setConfirmDialog({
      isOpen: true,
      facultyId: id,
      newStatus: status,
      remarks: ''
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({ isOpen: false, facultyId: null, newStatus: '', remarks: '' });
  };

  const openViewer = (url, title) => url ? setPreviewDoc({ isOpen: true, url, title }) : toast.error("No file attached.");
  const closeViewer = () => setPreviewDoc({ isOpen: false, url: '', title: '' });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (previewDoc.isOpen) {
          closeViewer();
        } else if (confirmDialog.isOpen) {
          closeConfirmDialog();
        } else if (reportDoc) {
          setReportDoc(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmDialog.isOpen, previewDoc.isOpen, reportDoc]);

  // --- STATUS UPDATE ---
  const executeUpdateStatus = async () => {
    const { facultyId, newStatus, remarks } = confirmDialog;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/status/${facultyId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus, remarks: remarks })
      });

      if (response.ok) {
        toast.success(`Document successfully ${newStatus}!`);
        fetchPending();
        closeConfirmDialog();
      } else {
        toast.error('Failed to update status.');
        closeConfirmDialog();
      }
    } catch {
      toast.error('Server error.');
      closeConfirmDialog();
    }
  };

  // --- VERIFICATION HANDLER (ASYNC FIRE AND FORGET WITH DUPLICATE SUBMISSION LOCK) ---
  const handleVerify = async (faculty) => {
    const id = faculty._id;

    // Guard against duplicate clicks if already verifying or already verified/flagged
    if (
      submittingIds.has(id) ||
      faculty.verificationStatus === 'verifying' ||
      faculty.verificationStatus === 'verified' ||
      faculty.verificationStatus === 'flagged'
    ) {
      return;
    }

    if (!faculty.documentUrl) {
      toast.error("No document URL available to verify.");
      return;
    }

    // Lock the button synchronously and optimistically show the processing status banner
    setSubmittingIds(prev => new Set(prev).add(id));
    setPendingFaculty(prev =>
      prev.map(f => (f._id === id ? { ...f, verificationStatus: 'verifying' } : f))
    );
    setScrollTarget({ id, timestamp: Date.now() });

    toast(`AI Verification started for ${faculty.firstName}. Please wait while we analyze the certificate.`, { icon: '⏳' });

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/verify-certificate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ facultyId: id })
      });

      if (!response.ok) {
        toast.error("Failed to start verification.");
        setSubmittingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        fetchPending(); // Revert optimistic update
      }
    } catch (error) {
      console.error("Verification error:", error);
      toast.error("An error occurred starting verification.");
      setSubmittingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fetchPending(); // Revert optimistic update
    }
  };

  // --- EDIT FUNCTIONS ---
  const startEditing = (faculty) => {
    setEditingDoc(faculty._id);
    setEditFormData({
      id: faculty._id,
      firstName: faculty.firstName,
      lastName: faculty.lastName,
      department: faculty.department,
      documentTitle: faculty.documentTitle || '',
      documentType: faculty.documentType || 'Certificate',
      tags: faculty.tags ? faculty.tags.join(', ') : '',
      eligibleSubjects: faculty.eligibleSubjects ? faculty.eligibleSubjects.join(', ') : ''
    });
  };

  const handleEditChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/edit/${editFormData.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: editFormData.firstName,
          lastName: editFormData.lastName,
          department: editFormData.department,
          documentTitle: editFormData.documentTitle,
          documentType: editFormData.documentType,
          tags: editFormData.tags,
          eligibleSubjects: editFormData.eligibleSubjects
        })
      });

      if (response.ok) {
        toast.success('Document details updated successfully!');
        setEditingDoc(null);
        fetchPending();
      } else {
        toast.error('Failed to save edits.');
      }
    } catch {
      toast.error('Server error during edit.');
    }
  };

  return (
    <div className="position-relative">
      <div className="mb-4 flex-shrink-0 d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          <h2 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>
            <i className="bi bi-shield-lock-fill text-primary me-2"></i>HR Management Dashboard
          </h2>
          <p className="text-muted mb-0">Review, edit, and verify pending faculty documents.</p>
        </div>
        <ExportFacultyStatsButton user={user} />
      </div>

      {/* --- SEARCH & FILTER BAR --- */}
      {!editingDoc && (
        <div className="card shadow-sm border-0 mb-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
          <div className="card-body p-3">
            <div className="row g-2">
              <div className="col-md-5">
                <div className="input-group">
                  <span className="input-group-text border-end-0" style={{ backgroundColor: 'transparent' }}><i className="bi bi-search text-muted"></i></span>
                  <input
                    type="text"
                    className="form-control border-start-0 ps-0"
                    placeholder="Search by faculty name or document title..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="col-md-4">
                <select className="form-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">All Document Types</option>
                  <option value="201 File">201 File</option>
                  <option value="Identification">Identification (ID)</option>
                  <option value="Certificate">Certificate / Seminar</option>
                  <option value="Faculty Evaluation">Faculty Evaluation</option>
                  <option value="Contract">Contract</option>
                  <option value="Letter of Intent">Letter of Intent</option>
                  <option value="Non-Renewal Contract">Non-Renewal Contract</option>
                </select>
              </div>
              <div className="col-md-3">
                <select className="form-select" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                  <option value="">All Departments</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="General Education">General Education</option>
                  <option value="Tourism & Hospitality">Tourism & Hospitality</option>
                  <option value="Unassigned">Unassigned</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {confirmDialog.isOpen && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className={`modal-header text-white ${confirmDialog.newStatus === 'approved' ? 'bg-success' : 'bg-danger'}`}>
                <h5 className="modal-title fw-bold">
                  {confirmDialog.newStatus === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeConfirmDialog}></button>
              </div>
              <div className="modal-body p-4">
                <p className="mb-3" style={{ color: 'var(--text-main)' }}>
                  Are you sure you want to mark this document as <strong>{confirmDialog.newStatus}</strong>?
                </p>
                <div className="mb-2">
                  <label className="form-label fw-bold text-muted small text-uppercase">Administrative Remarks (Optional)</label>
                  <textarea
                    className="form-control bg-light"
                    rows="3"
                    placeholder={confirmDialog.newStatus === 'rejected' ? "Please state the reason for rejection..." : "Add any internal notes here..."}
                    value={confirmDialog.remarks}
                    onChange={(e) => setConfirmDialog({ ...confirmDialog, remarks: e.target.value })}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer bg-light">
                <button type="button" className="btn btn-outline-secondary fw-bold" onClick={closeConfirmDialog}>Cancel</button>
                <button
                  type="button"
                  className={`btn fw-bold px-4 ${confirmDialog.newStatus === 'approved' ? 'btn-success' : 'btn-danger'}`}
                  onClick={executeUpdateStatus}
                >
                  Confirm {confirmDialog.newStatus === 'approved' ? 'Approval' : 'Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONDITIONAL UI: Show Edit Form OR the Table --- */}
      {editingDoc ? (

        /* THE EDIT FORM */
        <div className="card shadow-sm border-0 rounded-3 p-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
          <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-4">
            <h5 className="fw-bold text-primary mb-0"><i className="bi bi-pencil-square me-2"></i> Edit Credential Details</h5>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditingDoc(null)}>Cancel</button>
          </div>

          <form onSubmit={handleEditSubmit}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">First Name</label>
                <input type="text" className="form-control bg-light" name="firstName" value={editFormData.firstName} onChange={handleEditChange} required />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">Last Name</label>
                <input type="text" className="form-control bg-light" name="lastName" value={editFormData.lastName} onChange={handleEditChange} required />
              </div>
            </div>

            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">Department</label>
                <select className="form-select bg-light border-primary" name="department" value={editFormData.department} onChange={handleEditChange} required>
                  <option value="Information Technology">Information Technology</option>
                  <option value="General Education">General Education</option>
                  <option value="Tourism & Hospitality">Tourism & Hospitality</option>
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label fw-semibold text-secondary">Document Type</label>
                <select className="form-select bg-light border-primary" name="documentType" value={editFormData.documentType} onChange={handleEditChange} required>
                  <optgroup label="Training & Academics">
                    <option value="Certificate">Certificate</option>
                  </optgroup>
                  <optgroup label="201 File (Personal Documents)">
                    <option value="Identification">Identification (ID)</option>
                    <option value="201 File">General 201 File</option>
                  </optgroup>
                  <optgroup label="Performance & Employment">
                    <option value="Faculty Evaluation">Faculty Evaluation</option>
                    <option value="Contract">Contract</option>
                    <option value="Letter of Intent">Letter of Intent</option>
                    <option value="Non-Renewal Contract">Non-Renewal Contract</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold text-secondary">Document Title</label>
              <input type="text" className="form-control bg-light border-primary" name="documentTitle" value={editFormData.documentTitle} onChange={handleEditChange} required />
            </div>

            <div className="mb-4">
              <label className="form-label fw-semibold text-secondary">AI Skill Tags (Comma Separated)</label>
              <input type="text" className="form-control bg-light" name="tags" value={editFormData.tags} onChange={handleEditChange} />
              <small className="text-muted">Separate multiple skills with a comma (e.g., Java, Python, React)</small>
            </div>

            <div className="mb-4">
              <label className="form-label fw-semibold text-secondary">Teaching Eligibilities (Course Codes)</label>
              <input type="text" className="form-control bg-light border-success" name="eligibleSubjects" value={editFormData.eligibleSubjects || ''} onChange={handleEditChange} placeholder="e.g., IT1808, CITE1004" />
              <small className="text-muted">Enter course codes separated by commas to grant the faculty member eligibility to teach them.</small>
            </div>

            <button type="submit" className="btn btn-primary fw-bold px-5 py-2 shadow-sm">Save Changes</button>
          </form>
        </div>

      ) : (

        /* THE DATA TABLE */
        <div className="card shadow-sm border-0 rounded-3 overflow-hidden">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="text-secondary" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
                <tr>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Faculty Member</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Document Submitted</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">AI Extracted Details</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0 text-center" style={{ width: '250px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingFaculty
                  .filter(faculty => {
                    const matchesSearch =
                      `${faculty.firstName} ${faculty.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (faculty.documentTitle || '').toLowerCase().includes(searchTerm.toLowerCase());
                    const matchesType = filterType === '' || faculty.documentType === filterType || (filterType === '201 File' && faculty.documentType === 'Identification');
                    const matchesDept = filterDept === '' || (faculty.department || 'Unassigned') === filterDept;
                    return matchesSearch && matchesType && matchesDept;
                  })
                  .map((faculty) => {
                    const isVerifying = submittingIds.has(faculty._id) || faculty.verificationStatus === 'verifying';
                    const isAlreadyVerified = faculty.verificationStatus === 'verified' || faculty.verificationStatus === 'flagged';
                    const isVerifyDisabled = isVerifying || isAlreadyVerified;
                    const statusMeta = VERIFICATION_STATUS_META[faculty.verificationStatus];
                    const isHighlighted = scrollTarget?.id === faculty._id;

                    return (
                      <tr key={faculty._id}>
                        <td className="px-4 py-3">
                          <p className="fw-bold mb-0" style={{ color: 'var(--text-main)' }}>{faculty.firstName} {faculty.lastName}</p>
                          <small className="text-muted">{faculty.department}</small>
                        </td>
                        <td className="px-4 py-3">
                          <p className="fw-bold text-primary mb-0">{faculty.documentTitle || 'Untitled'}</p>
                          <span className="badge border mt-1" style={{ backgroundColor: 'var(--bg-neutral-light)', color: 'var(--text-main)' }}>{faculty.documentType || 'Other'}</span>
                          {faculty.documentUrl && (
                            <button
                              type="button"
                              onClick={() => openViewer(faculty.documentUrl, faculty.documentTitle || 'Document Preview')}
                              className="btn btn-link p-0 text-decoration-none small d-block mt-2 text-start"
                            >
                              <i className="bi bi-link-45deg"></i> View File
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {faculty.tags && faculty.tags.length > 0 ? (
                            <div className="d-flex flex-wrap gap-1">
                              {faculty.tags.map((tag, index) => (
                                <span key={index} className="badge border" style={{ backgroundColor: 'var(--bg-neutral-light)', color: 'var(--text-main)' }}>{tag}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted small fst-italic">No tags extracted</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {/* --- VERIFICATION RESULT / PROCESSING CONTAINER --- */}
                          <div
                            ref={el => { resultCardRefs.current[faculty._id] = el; }}
                            tabIndex={-1}
                            aria-live="polite"
                            className="mb-2"
                          >
                            {isVerifying && (
                              <div className="verification-processing-banner" role="status">
                                <span className="spinner-border spinner-border-sm flex-shrink-0" aria-hidden="true"></span>
                                <div>
                                  <div className="fw-bold">AI Verifying Certificate...</div>
                                  <div className="small fw-normal opacity-75">Please wait, do not click again</div>
                                </div>
                              </div>
                            )}

                            {!isVerifying && statusMeta && (
                              <button
                                type="button"
                                onClick={() => setReportDoc(faculty)}
                                className={`verification-result-card ${statusMeta.variantClass} ${isHighlighted ? 'verification-result-card--highlight' : ''}`}
                                aria-label={`${statusMeta.label} for ${faculty.firstName} ${faculty.lastName}. Click here to view full AI verification details.`}
                              >
                                <span className="verification-result-card__status">
                                  <i className={`bi ${statusMeta.icon}`} aria-hidden="true"></i>
                                  <span>{statusMeta.label}</span>
                                </span>
                                <span className="verification-result-card__cta">
                                  <span className="verification-result-card__cta-text">
                                    Click here to view full details
                                  </span>
                                  <i className="bi bi-chevron-right verification-result-card__chevron" aria-hidden="true"></i>
                                </span>
                              </button>
                            )}
                          </div>

                          {/* --- PRIMARY ROW ACTIONS --- */}
                          <div className="d-flex justify-content-center gap-2 mb-2">
                            <button
                              type="button"
                              onClick={() => startEditing(faculty)}
                              className="btn btn-sm btn-outline-primary fw-bold px-2 w-100"
                            >
                              <i className="bi bi-pencil-square me-1"></i> Edit Data
                            </button>
                            {faculty.documentType === 'Certificate' && (
                              <button
                                type="button"
                                onClick={() => handleVerify(faculty)}
                                className="btn btn-sm btn-outline-primary btn-verify-trigger fw-bold px-2 w-100 d-inline-flex align-items-center justify-content-center gap-1"
                                title={
                                  isVerifying
                                    ? 'Verification is currently in progress'
                                    : isAlreadyVerified
                                      ? 'Verification completed — click the result card above to view full details'
                                      : 'Run AI certificate verification'
                                }
                                disabled={isVerifyDisabled}
                                aria-busy={isVerifying}
                              >
                                {isVerifying ? (
                                  <>
                                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                    <span>Verifying...</span>
                                  </>
                                ) : isAlreadyVerified ? (
                                  <>
                                    <i className="bi bi-check2-circle" aria-hidden="true"></i>
                                    <span>Verified</span>
                                  </>
                                ) : faculty.verificationStatus === 'failed' ? (
                                  <>
                                    <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
                                    <span>Retry Verify</span>
                                  </>
                                ) : (
                                  <>
                                    <i className="bi bi-search" aria-hidden="true"></i>
                                    <span>Verify</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          <div className="d-flex justify-content-center gap-2">
                            <button
                              type="button"
                              onClick={() => openConfirmDialog(faculty._id, 'approved')}
                              className="btn btn-sm btn-outline-success fw-bold px-3 shadow-sm w-50"
                              title="Approve Document"
                            >
                              <i className="bi bi-check-lg"></i>
                            </button>
                            <button
                              type="button"
                              onClick={() => openConfirmDialog(faculty._id, 'rejected')}
                              className="btn btn-sm btn-outline-danger fw-bold px-3 w-50"
                              title="Reject Document"
                            >
                              <i className="bi bi-x-lg"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {pendingFaculty.length === 0 && (
            <div className="text-center py-5">
              <i className="bi bi-inbox fs-1 text-muted opacity-50 mb-3 d-block"></i>
              <h5 className="text-muted">No pending approvals.</h5>
            </div>
          )}
        </div>
      )}

      {/* --- DOCUMENT VIEWER MODAL --- */}
      {previewDoc.isOpen && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1060 }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content bg-dark border-0 shadow-lg">
              <div className="modal-header border-bottom border-secondary px-4 py-3">
                <h5 className="modal-title text-white"><i className="bi bi-file-earmark-text text-primary me-2"></i>{previewDoc.title}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeViewer}></button>
              </div>
              <div className="modal-body p-0 d-flex justify-content-center align-items-center" style={{ height: '75vh', backgroundColor: '#1e1e1e', overflow: 'hidden' }}>
                {previewDoc.url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? (
                  <img src={previewDoc.url} alt="Document Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <object data={previewDoc.url} type="application/pdf" width="100%" height="100%" style={{ border: 'none' }}>
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-white">
                      <p className="mb-3">Browser native PDF viewer is disabled.</p>
                      <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light">Open Externally</a>
                    </div>
                  </object>
                )}
              </div>
              <div className="modal-footer border-top border-secondary px-4 py-3 bg-dark d-flex justify-content-between">
                <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light btn-sm">Fallback: Open in New Tab</a>
                <button type="button" className="btn btn-primary fw-bold" onClick={closeViewer}>Close Viewer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- VERIFICATION REPORT MODAL --- */}
      {reportDoc && reportDoc.verificationData && (
        <div
          className="modal d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
          onClick={(e) => { if (e.target === e.currentTarget) setReportDoc(null); }}
        >
          <div
            ref={reportModalRef}
            tabIndex={-1}
            className="modal-dialog modal-lg modal-dialog-centered"
          >
            <div className="modal-content border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-neutral)' }}>
              <div className="modal-header bg-dark text-white">
                <h5 className="modal-title fw-bold text-white">
                  <i className="bi bi-shield-check me-2"></i>
                  AI Verification Report — {reportDoc.firstName} {reportDoc.lastName}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setReportDoc(null)}></button>
              </div>
              <div className="modal-body p-4">
                <div className="alert alert-warning mb-4 shadow-sm" role="alert">
                  <h6 className="alert-heading fw-bold mb-1"><i className="bi bi-exclamation-triangle-fill me-2"></i>Disclaimer</h6>
                  <p className="mb-0 small">
                    AI verification is not 100% accurate and may occasionally produce incorrect results. This report is provided for suggestion and guidance purposes only. Please manually review the document if necessary.
                  </p>
                </div>
                <h6 className="fw-bold text-primary mb-3">AI Extracted Data</h6>
                <div className="p-3 rounded mb-4" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
                  <p className="mb-1"><strong>Issuer:</strong> {reportDoc.verificationData.extractedData?.issuer || 'Not specified'}</p>
                  <p className="mb-1"><strong>Topic:</strong> {reportDoc.verificationData.extractedData?.topic || 'Not specified'}</p>
                  <p className="mb-0"><strong>Date:</strong> {reportDoc.verificationData.extractedData?.date || 'Not specified'}</p>
                </div>

                <h6 className="fw-bold text-danger mb-3">Forgery & Manipulation Analysis</h6>
                <div className="p-3 rounded mb-4 border-start border-danger border-4" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
                  <p className="mb-1"><strong>Anomaly Score:</strong> {reportDoc.verificationData.layoutAnomalyScore !== undefined ? (reportDoc.verificationData.layoutAnomalyScore * 100).toFixed(0) + '%' : 'N/A'}</p>
                  <p className="mb-0 text-muted small">{reportDoc.verificationData.anomalyReasoning}</p>
                </div>

                <h6 className="fw-bold text-warning mb-3">Document File History</h6>
                <div className="p-3 rounded mb-4 border-start border-warning border-4" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
                  {reportDoc.verificationData.metadata?.hasDigitalMetadata ? (
                    <>
                      <p className="mb-1"><strong>Creation Date:</strong> {reportDoc.verificationData.metadata.creationDate || 'Unknown'}</p>
                      <p className="mb-1"><strong>Last Modified:</strong> {reportDoc.verificationData.metadata.modificationDate || 'Unknown'}</p>
                      <p className="mb-1"><strong>Creator:</strong> {reportDoc.verificationData.metadata.creator}</p>
                      <p className="mb-0"><strong>Producer:</strong> {reportDoc.verificationData.metadata.producer}</p>
                    </>
                  ) : (
                    <p className="mb-0 text-muted small fst-italic">No digital metadata available for this file format.</p>
                  )}
                </div>

                <h6 className="fw-bold text-info mb-3">Grounding & Web Verification</h6>
                <div className="p-3 rounded mb-3 border-start border-info border-4" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
                  <p className="mb-2 text-muted small">{reportDoc.verificationData.groundingReasoning}</p>
                  {reportDoc.verificationData.referenceUrls && reportDoc.verificationData.referenceUrls.length > 0 && (
                    <div>
                      <strong className="d-block mb-1" style={{ fontSize: '0.8rem' }}>Reference Links:</strong>
                      <ul className="mb-0 ps-3 small text-break">
                        {reportDoc.verificationData.referenceUrls.map((url, i) => (
                          <li key={i}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {reportDoc.verificationData.error && (
                  <div className="alert alert-danger mt-3">
                    <strong>Error:</strong> {reportDoc.verificationData.error}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderTopColor: 'var(--border-subtle)' }}>
                <button type="button" className="btn btn-outline-secondary fw-bold" onClick={() => setReportDoc(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default HRDashboard;
