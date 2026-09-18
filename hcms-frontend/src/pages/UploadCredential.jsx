import React, { useState, useEffect } from 'react';

const UploadCredential = () => {
  // 1. Extract the token and role securely from session
  const savedUser = JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}');
  const userRole = savedUser.role || 'faculty';
  const token = savedUser.token;
  
  // Helper to check if user is a Head or Admin
  const isHeadOrAdmin = ['admin', 'academic_head', 'program_head'].includes(userRole);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPreviewOpen) {
        setIsPreviewOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewOpen]);
  const [extractedTags, setExtractedTags] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [dataPrivacyConsent, setDataPrivacyConsent] = useState(false);

  // Expanded State to hold all possible fields
  const [formData, setFormData] = useState({
    documentType: 'Certificate',
    documentTitle: '',
    firstName: '',
    lastName: '',
    department: 'Information Technology',
    // Certificate specific
    issuingInstitution: '',
    dateReceived: '',
    expirationDate: '',
    // Evaluation specific
    academicYear: '',
    term: '',
    evaluationRating: '',
    // Contract specific
    contractStart: '',
    contractEnd: '',
    // Letter of Intent specific
    intent: 'Yes',
    // Non-Renewal specific
    offenseType: '',
    // Identification specific
    idType: '',
    idNumber: '',
    autoValidate: userRole === 'admin'
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setStatusMessage({ type: '', text: '' }); 
    }
  };

  const handleAutoFill = async () => {
    if (!selectedFile) return;
    
    if (!token) {
      setStatusMessage({ type: 'danger', text: 'Authentication token missing. Please sign in again.' });
      return;
    }

    setIsExtracting(true);
    setStatusMessage({ type: 'info', text: 'Extracting data with AI...' });

    const extractPayload = new FormData();
    extractPayload.append('document', selectedFile);

    try {
      // --- UPDATED: FETCH WITH TOKEN (No Content-Type for FormData) ---
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/extract`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: extractPayload
      });
      const data = await response.json();

      if (response.ok) {
        setFormData(prev => ({
          ...prev,
          documentType: prev.documentType === 'Identification' ? 'Identification' : (data.documentType || prev.documentType),
          documentTitle: data.documentTitle || prev.documentTitle,
          firstName: data.firstName || prev.firstName,
          lastName: data.lastName || prev.lastName,
          department: data.department || prev.department,
          issuingInstitution: data.issuingInstitution || prev.issuingInstitution,
          dateReceived: data.dateReceived || prev.dateReceived,
          expirationDate: data.expirationDate || prev.expirationDate,
          academicYear: data.academicYear || prev.academicYear,
          term: data.term || prev.term,
          evaluationRating: data.evaluationRating || prev.evaluationRating,
          idType: data.idType || prev.idType,
          idNumber: data.idNumber || prev.idNumber
        }));
        
        setExtractedTags(data.tags || "");
        setStatusMessage({ type: 'success', text: 'Data extracted successfully. Please review before submitting.' });
      } else {
        setStatusMessage({ type: 'danger', text: data.error || data.message || 'Failed to extract data.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'danger', text: 'Network error during extraction.' });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setStatusMessage({ type: 'danger', text: 'A document file is required.' });
      return;
    }

    if (!token) {
      setStatusMessage({ type: 'danger', text: 'Authentication token missing. Please sign in again.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({ type: 'info', text: 'Uploading document and saving record...' });

    const finalPayload = new FormData();
    Object.keys(formData).forEach(key => {
      finalPayload.append(key, formData[key]);
    });

    finalPayload.append('document', selectedFile);
    finalPayload.append('uploaderRole', userRole);
    
    if (extractedTags) {
        const tagsString = Array.isArray(extractedTags) ? extractedTags.join(', ') : extractedTags;
        finalPayload.append('tags', tagsString);
    }

    try {
      // --- UPDATED: FETCH WITH TOKEN (No Content-Type for FormData) ---
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: finalPayload
      });
      const data = await response.json();

      if (response.ok) {
        setStatusMessage({ type: 'success', text: 'Credential successfully saved to the database.' });
        // Reset form
        setFormData(prev => ({ ...prev, documentTitle: '', issuingInstitution: '', dateReceived: '', expirationDate: '', academicYear: '', term: '', contractStart: '', contractEnd: '', offenseType: '', idNumber: '' }));
        setSelectedFile(null);
        setDataPrivacyConsent(false);
      } else {
        setStatusMessage({ type: 'danger', text: data.error || data.message || 'Error saving to database.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'danger', text: 'Network error during submission.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="d-flex flex-column h-100 pb-5">
      <div className="mb-4 flex-shrink-0">
        <h2 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>
          <i className="bi bi-cloud-arrow-up-fill text-primary me-2"></i>Submit New Credential
        </h2>
        <p className="text-muted mb-0">Upload official documents, certificates, and compliance records.</p>
      </div>

      {statusMessage.text && (
        <div className={`alert alert-${statusMessage.type}`} role="alert">
          {statusMessage.text}
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            
            {/* DOCUMENT TYPE SELECTION (Controls dynamic rendering) */}
            <div className="mb-3">
              <label className="form-label text-muted">Document Type</label>
              <select className="form-select border-primary" name="documentType" value={formData.documentType} onChange={handleInputChange}>
                <optgroup label="Training & Academics">
                  <option value="Certificate">Certificate / Seminar</option>
                </optgroup>
                <optgroup label="201 File (Personal Documents)">
                  <option value="Identification">Identification (ID)</option>
                  <option value="201 File">General 201 File</option>
                </optgroup>
                <optgroup label="Performance & Employment">
                  <option value="Faculty Evaluation">Faculty Evaluation</option>
                  <option value="Contract">Contract</option>
                  <option value="Letter of Intent">Letter of Intent</option>
                  {/* Strictly render Non-Renewal only for Admins/Heads */}
                  {isHeadOrAdmin && (
                    <option value="Non-Renewal Contract">Non-Renewal Contract</option>
                  )}
                </optgroup>
              </select>
            </div>

            {/* UNIVERSAL FIELDS (Always shown) */}
            <div className="card border mb-4" style={{ backgroundColor: 'var(--bg-neutral-light)' }}>
              <div className="card-body py-3">
                <h6 className="fw-bold mb-3">File Upload & AI Extraction</h6>
                <div className="input-group mb-1">
                  <input type="file" className="form-control" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
                  <button type="button" className="btn btn-primary" onClick={handleAutoFill} disabled={!selectedFile || isExtracting}>
                    {isExtracting ? 'Extracting...' : 'Auto-Fill Details'}
                  </button>
                </div>
                <div className="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <small className="text-muted fst-italic">Note: Only PDF or Image formats (.png, .jpg, .jpeg) are processed.</small>
                  {previewUrl && (
                    <button type="button" onClick={() => setIsPreviewOpen(true)} className="btn btn-sm btn-outline-info fw-bold shadow-sm">
                      <i className="bi bi-eye me-1"></i> Preview File
                    </button>
                  )}
                </div>

                <div className="alert alert-warning py-2 px-3 small border-0 shadow-sm d-flex align-items-center" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
                  <span><strong>Disclaimer:</strong> Auto-extracted details might have mistakes. Please check and verify that all details are correct before submitting.</span>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-2">
                    <label className="form-label text-muted small">First Name</label>
                    <input type="text" className="form-control" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
                  </div>
                  <div className="col-md-6 mb-2">
                    <label className="form-label text-muted small">Last Name</label>
                    <input type="text" className="form-control" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
                  </div>
                </div>
                
                <div className="mb-2">
                  <label className="form-label text-muted small">Document Name / Title</label>
                  <input type="text" className="form-control" name="documentTitle" placeholder="e.g., BSIT Diploma, 2025 Contract" value={formData.documentTitle} onChange={handleInputChange} required />
                </div>
              </div>
            </div>

            {/* DYNAMIC FIELD RENDERING */}
            <div className="mb-4">
              <h6 className="fw-bold mb-3 border-bottom pb-2">Specific Document Details</h6>
              
              {/* 1. CERTIFICATE FIELDS */}
              {formData.documentType === 'Certificate' && (
                <>
                  <div className="mb-3">
                    <label className="form-label text-muted">Issuing Institution</label>
                    <input type="text" className="form-control" name="issuingInstitution" value={formData.issuingInstitution} onChange={handleInputChange} />
                  </div>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label text-muted">Date Received</label>
                      <input type="date" className="form-control" name="dateReceived" value={formData.dateReceived} onChange={handleInputChange} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label text-muted">Expiration Date (Optional)</label>
                      <input type="date" className="form-control" name="expirationDate" value={formData.expirationDate} onChange={handleInputChange} />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-muted">Department</label>
                    <select className="form-select border-primary" name="department" value={formData.department} onChange={handleInputChange} required>
                      <option value="Information Technology">Information Technology</option>
                      <option value="General Education">General Education</option>
                      <option value="Tourism & Hospitality">Tourism & Hospitality</option>
                    </select>
                  </div>
                </>
              )}

              {/* 2. FACULTY EVALUATION FIELDS */}
              {formData.documentType === 'Faculty Evaluation' && (
                <>
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="form-label text-muted">Academic Year</label>
                      <input type="text" className="form-control" name="academicYear" placeholder="e.g., SY 2025-2026" value={formData.academicYear} onChange={handleInputChange} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label text-muted">Term</label>
                      <select className="form-select" name="term" value={formData.term} onChange={handleInputChange}>
                        <option value="">Select Term</option>
                        <option value="Term 1">Term 1</option>
                        <option value="Term 2">Term 2</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-muted">Overall Evaluation Rating</label>
                    <input type="number" step="0.01" min="1" max="5" className="form-control border-primary" name="evaluationRating" placeholder="e.g., 4.35" value={formData.evaluationRating} onChange={handleInputChange} />
                  </div>
                </>
              )}

              {/* 3. CONTRACT FIELDS */}
              {formData.documentType === 'Contract' && (
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label text-muted">Start of Contract</label>
                    <input type="date" className="form-control" name="contractStart" value={formData.contractStart} onChange={handleInputChange} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted">End of Contract</label>
                    <input type="date" className="form-control" name="contractEnd" value={formData.contractEnd} onChange={handleInputChange} />
                  </div>
                </div>
              )}

              {/* 4. LETTER OF INTENT FIELDS */}
              {formData.documentType === 'Letter of Intent' && (
                <div className="mb-3">
                  <label className="form-label text-muted">Intent to Continue?</label>
                  <select className="form-select" name="intent" value={formData.intent} onChange={handleInputChange}>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              )}

              {/* 5. NON-RENEWAL FIELDS */}
              {formData.documentType === 'Non-Renewal Contract' && (
                <div className="mb-3">
                  <label className="form-label text-muted text-danger fw-bold">Type of Offense / Reason</label>
                  <textarea className="form-control" name="offenseType" rows="3" placeholder="State the reason for non-renewal..." value={formData.offenseType} onChange={handleInputChange}></textarea>
                </div>
              )}

              {/* 6. IDENTIFICATION FIELDS */}
              {formData.documentType === 'Identification' && (
                <div className="row mb-3">
                  <div className="col-md-4">
                    <label className="form-label text-muted">ID Type</label>
                    <select className="form-select border-primary" name="idType" value={formData.idType} onChange={handleInputChange}>
                      <option value="">Select Type</option>
                      <option value="Driver's License">Driver's License</option>
                      <option value="SSS">SSS</option>
                      <option value="TIN">TIN</option>
                      <option value="Pag-IBIG">Pag-IBIG</option>
                      <option value="PhilHealth">PhilHealth</option>
                      <option value="Passport">Passport</option>
                      <option value="Postal">Postal ID</option>
                      <option value="UMID">UMID</option>
                      <option value="PRC">PRC</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="col-md-8">
                    <label className="form-label text-muted">ID Number</label>
                    <input type="text" className="form-control" name="idNumber" placeholder="e.g., 123-456-789" value={formData.idNumber} onChange={handleInputChange} required />
                  </div>
                </div>
              )}
            </div>

            {/* STRICT RBAC: Render Auto-Approve Checkbox ONLY if role is 'admin' */}
            {userRole === 'admin' && (
              <div className="card border-warning mb-4">
                <div className="card-body py-3">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="autoValidate" name="autoValidate" checked={formData.autoValidate} onChange={handleInputChange} />
                    <label className="form-check-label fw-bold" htmlFor="autoValidate">
                      Automatic Validation: Approve & Publish Immediately
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Privacy Consent */}
            <div className="card shadow-sm border-0 mb-4" style={{ backgroundColor: 'var(--surface-neutral)' }}>
              <div className="card-body p-4">
                <div className="form-check mb-3">
                  <input 
                    className="form-check-input" 
                    type="checkbox" 
                    id="dataPrivacyConsent" 
                    checked={dataPrivacyConsent}
                    onChange={(e) => setDataPrivacyConsent(e.target.checked)}
                    required 
                  />
                  <label className="form-check-label text-muted small" htmlFor="dataPrivacyConsent">
                    <strong>Data Privacy Consent:</strong> By uploading this document, I consent to the collection, storage, and processing of my personal and identification data by the HR department. Under the <a href="https://privacy.gov.ph/data-privacy-act/" target="_blank" rel="noopener noreferrer">Data Privacy Act of 2012 (RA 10173)</a>, Human Resources departments are legally allowed to collect and store identification data for legitimate employment and verification purposes. I understand this data will be securely stored.
                  </label>
                </div>

                <button type="submit" className="btn btn-success px-4 fw-bold" disabled={isSubmitting || !dataPrivacyConsent}>
                  {isSubmitting ? 'Uploading to System...' : 'Upload Document'}
                </button>
              </div>
            </div>

          </form>
        </div>
      </div>

      {isPreviewOpen && previewUrl && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1060 }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content bg-dark border-0 shadow-lg">
              <div className="modal-header border-bottom border-secondary px-4 py-3">
                <h5 className="modal-title text-white"><i className="bi bi-file-earmark-text text-primary me-2"></i>{selectedFile?.name}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setIsPreviewOpen(false)}></button>
              </div>
              <div className="modal-body p-0 d-flex justify-content-center align-items-center" style={{ height: '75vh', backgroundColor: '#1e1e1e', overflow: 'hidden' }}>
                {selectedFile?.type.startsWith('image/') ? (
                  <img src={previewUrl} alt="Document Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <object data={previewUrl} type="application/pdf" width="100%" height="100%" style={{ border: 'none' }}>
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-white">
                      <p className="mb-3">Browser native PDF viewer is disabled.</p>
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light">Open Externally</a>
                    </div>
                  </object>
                )}
              </div>
              <div className="modal-footer border-top border-secondary px-4 py-3 bg-dark d-flex justify-content-between">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light btn-sm">Fallback: Open in New Tab</a>
                <button type="button" className="btn btn-primary fw-bold" onClick={() => setIsPreviewOpen(false)}>Close Viewer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadCredential;