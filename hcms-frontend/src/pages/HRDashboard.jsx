import { useState, useEffect } from 'react';

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

  // --- VERIFICATION STATE ---
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [verifyingCategory, setVerifyingCategory] = useState("");

  // 1. Retrieve the token once at the top so all functions can use it
  const savedUser = JSON.parse(localStorage.getItem('hireSenseUser'));
  const token = savedUser?.token;

  // --- UPDATED: FETCH WITH TOKEN ---
  const fetchPending = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/pending`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
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

  // --- UPDATED: STATUS UPDATE WITH TOKEN ---
  const executeUpdateStatus = async () => {
    const { facultyId, newStatus, remarks } = confirmDialog;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/status/${facultyId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus, remarks: remarks })
      });

      if (response.ok) {
        setMessage(`Document successfully ${newStatus}!`);
        fetchPending();
        closeConfirmDialog();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to update status.');
        closeConfirmDialog();
      }
    } catch (error) {
      setMessage('Server error.');
      closeConfirmDialog();
    }
  };

  // --- VERIFICATION HANDLER ---
  const handleVerify = async (faculty) => {
    if (!faculty.documentUrl) {
      setMessage("No document URL available to verify.");
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);
    setIsModalOpen(true);
    const documentCategory = faculty.documentType || "Certificate";
    setVerifyingCategory(documentCategory);

    try {
      const fileResponse = await fetch(faculty.documentUrl);
      if (!fileResponse.ok) throw new Error("Failed to fetch document file.");
      const blob = await fileResponse.blob();

      const formData = new FormData();
      let ext = "pdf";
      if (blob.type === "image/jpeg") ext = "jpg";
      if (blob.type === "image/png") ext = "png";
      formData.append('certificate', blob, `document.${ext}`);
      formData.append('category', documentCategory);

      const verifyResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/verify-certificate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await verifyResponse.json();

      if (verifyResponse.ok) {
        setVerificationResult(data);
      } else {
        setVerificationResult({ error: data.error || "Verification failed." });
      }
    } catch (error) {
      console.error("Verification error:", error);
      setVerificationResult({ error: error.message || "An error occurred during verification." });
    } finally {
      setIsVerifying(false);
    }
  };

  // --- EDIT FUNCTIONS ---
  const startEditing = (faculty) => {
    setEditingDoc(faculty._id);
    setEditFormData({
      firstName: faculty.firstName,
      lastName: faculty.lastName,
      department: faculty.department,
      documentTitle: faculty.documentTitle || '',
      documentType: faculty.documentType || 'Certificate',
      tags: faculty.tags ? faculty.tags.join(', ') : ''
    });
  };

  const handleEditChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  // --- UPDATED: EDIT SUBMIT WITH TOKEN ---
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/edit/${editingDoc}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`, // <--- SECURITY INJECTED
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editFormData)
      });

      if (response.ok) {
        setMessage('Document details updated successfully!');
        setEditingDoc(null);
        fetchPending();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save edits.');
      }
    } catch (error) {
      setMessage('Server error during edit.');
    }
  };

  const hasMissingData = verificationResult?.extractedData?.issuer === "Not specified" || verificationResult?.extractedData?.topic === "Not specified";

  return (
    <div className="position-relative">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-dark mb-1">HR Management Dashboard</h2>
          <span className="text-muted">Review, edit, and verify pending faculty documents.</span>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.includes('successfully') ? 'alert-success' : 'alert-danger'} py-2 shadow-sm border-0`}>
          <i className="bi bi-info-circle-fill me-2"></i> {message}
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

      {/* --- VERIFICATION MODAL --- */}
      {isModalOpen && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">AI Certificate Verification</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setIsModalOpen(false)}></button>
              </div>
              <div className="modal-body p-4">
                {isVerifying ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary mb-3" role="status"></div>
                    <h5 className="text-muted">Analyzing Document & Searching Web...</h5>
                    <p className="small text-secondary">This may take a few moments.</p>
                  </div>
                ) : verificationResult?.error ? (
                  <div className="alert alert-danger py-3">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    {verificationResult.error}
                  </div>
                ) : verificationResult ? (
                  <div>
                    {verifyingCategory !== "Contract" && (
                      <div className="mb-4">
                        <div className="d-flex align-items-center">
                          <h6 className="mb-0 me-3 fw-bold text-secondary">Status:</h6>
                          {hasMissingData ? (
                            <span className="badge bg-warning text-dark fs-6 px-3 py-2"><i className="bi bi-exclamation-triangle me-1"></i> Validation Search Failed</span>
                          ) : verificationResult.isValid ? (
                            <span className="badge bg-success fs-6 px-3 py-2"><i className="bi bi-shield-check me-1"></i> Validated Event</span>
                          ) : (
                            <span className="badge bg-danger fs-6 px-3 py-2"><i className="bi bi-shield-x me-1"></i> Unverified / Suspect</span>
                          )}
                        </div>
                        {!hasMissingData && (
                          <div className="mt-3 p-3 bg-light rounded border">
                            <h6><i className="bi bi-search me-2"></i>Web Grounding Verdict</h6>
                            <p className="small text-muted mb-0">{verificationResult.groundingReasoning}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mb-4">
                      <h6 className="fw-bold text-secondary mb-2">Layout Anomaly Score</h6>
                      <div className="d-flex align-items-center">
                        <div className="progress flex-grow-1 me-3" style={{ height: '10px' }}>
                          <div
                            className={`progress-bar ${verificationResult.layoutAnomalyScore > 0.7 ? 'bg-danger' : verificationResult.layoutAnomalyScore > 0.4 ? 'bg-warning' : 'bg-success'}`}
                            role="progressbar"
                            style={{ width: `${(verificationResult.layoutAnomalyScore * 100).toFixed(0)}%` }}
                            aria-valuenow={(verificationResult.layoutAnomalyScore * 100).toFixed(0)}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          ></div>
                        </div>
                        <span className="fw-bold">{(verificationResult.layoutAnomalyScore * 100).toFixed(1)}%</span>
                      </div>
                      <small className="text-muted">Higher scores indicate a higher likelihood of visual manipulation or forgery.</small>
                    </div>

                    <div className="mt-3 p-3 bg-light rounded border mb-4">
                      <h6><i className="bi bi-shield-exclamation me-2"></i>Forensic Layout Analysis</h6>
                      <p className="small text-muted mb-0">{verificationResult.anomalyReasoning}</p>
                    </div>

                    <div className="row mb-4">
                      <div className="col-md-12">
                        <h6 className="fw-bold text-secondary mb-3">Extracted Data</h6>
                        <ul className="list-group list-group-flush border rounded">
                          <li className="list-group-item bg-light"><strong>Issuer:</strong> {verificationResult.extractedData?.issuer}</li>
                          <li className="list-group-item"><strong>Topic:</strong> {verificationResult.extractedData?.topic}</li>
                          <li className="list-group-item bg-light"><strong>Date:</strong> {verificationResult.extractedData?.date}</li>
                        </ul>
                      </div>
                    </div>

                    {hasMissingData && (
                      <div className="alert alert-warning py-3">
                        <i className="bi bi-exclamation-triangle-fill me-2"></i>
                        The AI was unable to execute a verification search because core identity parameters (Issuer or Topic) were missing from the extraction. Please review the document manually.
                      </div>
                    )}

                    {verifyingCategory !== "Contract" && !hasMissingData && (
                      <div>
                        <h6 className="fw-bold text-secondary mb-3">Reference Sources</h6>
                        {verificationResult.referenceUrls && verificationResult.referenceUrls.length > 0 ? (
                          <ul className="list-group border rounded">
                            {verificationResult.referenceUrls.map((url, i) => (
                              <li key={i} className="list-group-item text-truncate">
                                <i className="bi bi-globe me-2 text-primary"></i>
                                <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted fst-italic">No reference URLs provided.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="modal-footer bg-light">
                <button type="button" className="btn btn-outline-secondary fw-bold" onClick={() => setIsModalOpen(false)}>Close</button>
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

            <button type="submit" className="btn btn-primary fw-bold px-5 py-2 shadow-sm">Save Changes</button>
          </form>
        </div>

      ) : (

        /* THE DATA TABLE (Hidden when editing) */
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
                        <a href={faculty.documentUrl} target="_blank" rel="noopener noreferrer" className="d-block mt-2 text-decoration-none small">
                          <i className="bi bi-link-45deg"></i> View File
                        </a>
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
                      <div className="d-flex justify-content-center gap-2 mb-2">
                        <button onClick={() => startEditing(faculty)} className="btn btn-sm btn-outline-primary fw-bold px-3 w-100">
                          <i className="bi bi-pencil-square me-1"></i> Edit Data
                        </button>
                        <button onClick={() => handleVerify(faculty)} className="btn btn-sm btn-outline-info fw-bold px-3 w-100" title="Verify Certificate">
                          <i className="bi bi-search me-1"></i> Verify
                        </button>
                      </div>
                      <div className="d-flex justify-content-center gap-2">
                        <button onClick={() => openConfirmDialog(faculty._id, 'approved')} className="btn btn-sm btn-success fw-bold px-3 shadow-sm w-50" title="Approve">
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
    </div>
  );
}

export default HRDashboard;