import React, { useState } from 'react';

const UploadCredential = () => {
  const userRole = localStorage.getItem('role') || 'faculty';
  
  // Helper to check if user is a Head or Admin
  const isHeadOrAdmin = ['admin', 'academic_head', 'program_head'].includes(userRole);

  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedTags, setExtractedTags] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // Expanded State to hold all possible fields
  const [formData, setFormData] = useState({
    documentType: 'Certificate',
    documentTitle: '',
    firstName: '',
    lastName: '',
    department: '',
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
    setIsExtracting(true);
    setStatusMessage({ type: 'info', text: 'Extracting data with AI...' });

    const extractPayload = new FormData();
    extractPayload.append('document', selectedFile);

    try {
      const response = await fetch('http://localhost:5000/api/faculty/extract', {
        method: 'POST',
        body: extractPayload
      });
      const data = await response.json();

      if (response.ok) {
        setFormData(prev => ({
          ...prev,
          documentType: data.documentType || prev.documentType,
          documentTitle: data.documentTitle || prev.documentTitle,
          firstName: data.firstName || prev.firstName,
          lastName: data.lastName || prev.lastName,
          department: data.department || prev.department,
          issuingInstitution: data.issuingInstitution || prev.issuingInstitution,
          dateReceived: data.dateReceived || prev.dateReceived,
          expirationDate: data.expirationDate || prev.expirationDate,
          academicYear: data.academicYear || prev.academicYear,
          term: data.term || prev.term,
          evaluationRating: data.evaluationRating || prev.evaluationRating // <-- NEW: Catch AI output
        }));
        
        setExtractedTags(data.tags || "");
        setStatusMessage({ type: 'success', text: 'Data extracted successfully. Please review before submitting.' });
      } else {
        setStatusMessage({ type: 'danger', text: data.message || 'Failed to extract data.' });
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
      const response = await fetch('http://localhost:5000/api/faculty/add', {
        method: 'POST',
        body: finalPayload
      });
      const data = await response.json();

      if (response.ok) {
        setStatusMessage({ type: 'success', text: 'Credential successfully saved to the database.' });
        // Reset form
        setFormData(prev => ({ ...prev, documentTitle: '', issuingInstitution: '', dateReceived: '', expirationDate: '', academicYear: '', term: '', contractStart: '', contractEnd: '', offenseType: '' }));
        setSelectedFile(null);
      } else {
        setStatusMessage({ type: 'danger', text: data.message || 'Error saving to database.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'danger', text: 'Network error during submission.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mt-4">
      <h3 className="mb-4">Submit New Credential</h3>

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
                <option value="Certificate">Certificate / Seminar</option>
                <option value="201 File">201 File (Personal Document)</option>
                <option value="Faculty Evaluation">Faculty Evaluation</option>
                <option value="Contract">Contract</option>
                <option value="Letter of Intent">Letter of Intent</option>
                {/* Strictly render Non-Renewal only for Admins/Heads */}
                {isHeadOrAdmin && (
                  <option value="Non-Renewal Contract">Non-Renewal Contract</option>
                )}
              </select>
            </div>

            {/* UNIVERSAL FIELDS (Always shown) */}
            <div className="card border bg-light mb-4">
              <div className="card-body py-3">
                <h6 className="fw-bold mb-3">File Upload & AI Extraction</h6>
                <div className="input-group mb-3">
                  <input type="file" className="form-control" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
                  <button type="button" className="btn btn-primary" onClick={handleAutoFill} disabled={!selectedFile || isExtracting}>
                    {isExtracting ? 'Extracting...' : 'Auto-Fill Details'}
                  </button>
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
                    <input type="text" className="form-control" name="department" value={formData.department} onChange={handleInputChange} />
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
                  {/* NEW: Evaluation Rating Input */}
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

            <button type="submit" className="btn btn-success px-4 fw-bold" disabled={isSubmitting}>
              {isSubmitting ? 'Uploading to System...' : 'Upload Document'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
};

export default UploadCredential;