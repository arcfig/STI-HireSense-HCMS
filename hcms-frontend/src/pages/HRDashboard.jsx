import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

function HRDashboard({ user }) {
  const [pendingFaculty, setPendingFaculty] = useState([]);
  const [message, setMessage] = useState('');

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

  // 1. Retrieve the token once at the top so all functions can use it
  const savedUser = JSON.parse(sessionStorage.getItem('hireSenseUser'));
  const token = savedUser?.token;

  // --- FETCH PENDING ---
  const fetchPending = async () => {
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
  };

  useEffect(() => {
    fetchPending();
  }, []);

  // Listen to global verification events to refresh the table automatically
  useEffect(() => {
    const handleVerificationComplete = () => {
      fetchPending();
    };
    window.addEventListener('verificationCompleted', handleVerificationComplete);
    return () => window.removeEventListener('verificationCompleted', handleVerificationComplete);
  }, []);

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
  }, [confirmDialog.isOpen, previewDoc.isOpen]);

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
    } catch (error) {
      toast.error('Server error.');
      closeConfirmDialog();
    }
  };

  // --- VERIFICATION HANDLER (ASYNC FIRE AND FORGET) ---
  const handleVerify = async (faculty) => {
    if (!faculty.documentUrl) {
      toast.error("No document URL available to verify.");
      return;
    }

    toast(`AI Verification started for ${faculty.firstName}. You will be notified when complete.`, { icon: '⏳' });

    // Optimistically update UI
    setPendingFaculty(prev => prev.map(f => f._id === faculty._id ? { ...f, verificationStatus: 'verifying' } : f));

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/verify-certificate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ facultyId: faculty._id })
      });

      if (!response.ok) {
        toast.error("Failed to start verification.");
        fetchPending(); // Revert optimistic update
      }
    } catch (error) {
      console.error("Verification error:", error);
      toast.error("An error occurred starting verification.");
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
    } catch (error) {
      toast.error('Server error during edit.');
    }
  };

  return (
    <div className="position-relative">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-dark mb-1">HR Management Dashboard</h2>
          <span className="text-muted">Review, edit, and verify pending faculty documents.</span>
        </div>
      </div>

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
                <p className="mb-3 text-dark">
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
        <div className="card shadow-sm border-0 rounded-3 p-4 bg-white">
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
                  <option value="201 File">201 File</option>
                  <option value="Certificate">Certificate</option>
                  <option value="Faculty Evaluation">Faculty Evaluation</option>
                  <option value="Contract">Contract</option>
                  <option value="Letter of Intent">Letter of Intent</option>
                  <option value="Non-Renewal Contract">Non-Renewal Contract</option>
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
              <thead className="table-light text-secondary">
                <tr>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Faculty Member</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">Document Submitted</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0">AI Extracted Details</th>
                  <th className="py-3 px-4 fw-semibold border-bottom-0 text-center" style={{ width: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingFaculty.map((faculty) => (
                  <tr key={faculty._id}>
                    <td className="px-4 py-3">
                      <p className="fw-bold text-dark mb-0">{faculty.firstName} {faculty.lastName}</p>
                      <small className="text-muted">{faculty.department}</small>
                    </td>
                    <td className="px-4 py-3">
                      <p className="fw-bold text-primary mb-0">{faculty.documentTitle || 'Untitled'}</p>
                      <span className="badge bg-light text-secondary border mt-1">{faculty.documentType || 'Other'}</span>
                      {faculty.documentUrl && (
                        <button 
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
                            <span key={index} className="badge bg-light text-dark border">{tag}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted small fst-italic">No tags extracted</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="mb-2">
                        {faculty.verificationStatus === 'verifying' && <span className="badge bg-warning text-dark"><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Verifying...</span>}
                        {faculty.verificationStatus === 'verified' && <span className="badge bg-success" style={{cursor: 'pointer'}} onClick={() => setReportDoc(faculty)} title="Click to view full AI report"><i className="bi bi-shield-check me-1"></i> Verified</span>}
                        {faculty.verificationStatus === 'flagged' && <span className="badge bg-danger" style={{cursor: 'pointer'}} onClick={() => setReportDoc(faculty)} title="Click to view full AI report"><i className="bi bi-shield-x me-1"></i> Flagged</span>}
                        {faculty.verificationStatus === 'failed' && <span className="badge bg-secondary" style={{cursor: 'pointer'}} onClick={() => setReportDoc(faculty)} title="Click to view full AI report"><i className="bi bi-exclamation-triangle me-1"></i> Failed</span>}
                      </div>
                      <div className="d-flex justify-content-center gap-2 mb-2">
                        <button onClick={() => startEditing(faculty)} className="btn btn-sm btn-outline-primary fw-bold px-3 w-100">
                          <i className="bi bi-pencil-square me-1"></i> Edit Data
                        </button>
                        <button onClick={() => handleVerify(faculty)} className="btn btn-sm btn-outline-primary fw-bold px-3 w-100" title="Verify Certificate" disabled={faculty.verificationStatus === 'verifying'}>
                          <i className="bi bi-search me-1"></i> Verify
                        </button>
                      </div>
                      <div className="d-flex justify-content-center gap-2">
                        <button onClick={() => openConfirmDialog(faculty._id, 'approved')} className="btn btn-sm btn-outline-success fw-bold px-3 shadow-sm w-50" title="Approve">
                          <i className="bi bi-check-lg"></i>
                        </button>
                        <button onClick={() => openConfirmDialog(faculty._id, 'rejected')} className="btn btn-sm btn-outline-danger fw-bold px-3 w-50" title="Reject">
                          <i className="bi bi-x-lg"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-dark text-white">
                <h5 className="modal-title fw-bold text-white">
                  AI Verification Report
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setReportDoc(null)}></button>
              </div>
              <div className="modal-body p-4">
                <h6 className="fw-bold text-primary mb-3">AI Extracted Data</h6>
                <div className="bg-light p-3 rounded mb-4">
                  <p className="mb-1"><strong>Issuer:</strong> {reportDoc.verificationData.extractedData?.issuer}</p>
                  <p className="mb-1"><strong>Topic:</strong> {reportDoc.verificationData.extractedData?.topic}</p>
                  <p className="mb-0"><strong>Date:</strong> {reportDoc.verificationData.extractedData?.date}</p>
                </div>
                
                <h6 className="fw-bold text-danger mb-3">Forgery & Manipulation Analysis</h6>
                <div className="bg-light p-3 rounded mb-4 border-start border-danger border-4">
                  <p className="mb-1"><strong>Anomaly Score:</strong> {reportDoc.verificationData.layoutAnomalyScore !== undefined ? (reportDoc.verificationData.layoutAnomalyScore * 100).toFixed(0) + '%' : 'N/A'}</p>
                  <p className="mb-0 text-muted small">{reportDoc.verificationData.anomalyReasoning}</p>
                </div>

                <h6 className="fw-bold text-warning mb-3">Document File History</h6>
                <div className="bg-light p-3 rounded mb-4 border-start border-warning border-4">
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
                <div className="bg-light p-3 rounded mb-3 border-start border-info border-4">
                  <p className="mb-1"><strong>Is Valid Event?</strong> {reportDoc.verificationData.isValid === true ? 'Yes' : (reportDoc.verificationData.isValid === false ? 'No' : 'Unsure / Not Analyzed')}</p>
                  <p className="mb-2 text-muted small">{reportDoc.verificationData.groundingReasoning}</p>
                  {reportDoc.verificationData.referenceUrls && reportDoc.verificationData.referenceUrls.length > 0 && (
                    <div>
                      <strong className="d-block mb-1" style={{fontSize: '0.8rem'}}>Reference Links:</strong>
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
              <div className="modal-footer bg-light">
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