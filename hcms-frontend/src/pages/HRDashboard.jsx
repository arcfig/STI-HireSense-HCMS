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

  // 1. Retrieve the token once at the top so all functions can use it
  const savedUser = JSON.parse(localStorage.getItem('hireSenseUser'));
  const token = savedUser?.token;

  // --- UPDATED: FETCH WITH TOKEN ---
  const fetchPending = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/faculty/pending', {
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
      const response = await fetch(`http://localhost:5000/api/faculty/status/${facultyId}`, {
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
      const response = await fetch(`http://localhost:5000/api/faculty/edit/${editingDoc}`, {
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