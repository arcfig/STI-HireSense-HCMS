import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { confirmAction, showAlert } from '../utils/swal';
import ExportDropdownButton from '../components/ExportDropdownButton';

const SubjectManager = () => {
  const [hierarchy, setHierarchy] = useState({});
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [eligibleFaculty, setEligibleFaculty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingFaculty, setFetchingFaculty] = useState(false);

  // Tracks which department folder is currently open
  const [openDept, setOpenDept] = useState(null);

  // Curriculum Modals & Import/Export State
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [defaultDepartment, setDefaultDepartment] = useState('Information Technology');
  const [defaultProgram, setDefaultProgram] = useState('BSIT');
  const [importing, setImporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null);
  const importInputRef = useRef(null);

  // Single Subject Form State
  const [newSubject, setNewSubject] = useState({
    department: 'Information Technology',
    program: 'BSIT',
    courseCode: '',
    subjectName: ''
  });
  const [savingSubject, setSavingSubject] = useState(false);

  // Retrieve the token once at the top
  const savedUser = JSON.parse(sessionStorage.getItem('hireSenseUser') || '{}');
  const token = savedUser?.token;

  const fetchHierarchy = useCallback(async (preserveOpenDept = true) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/subjects/hierarchy`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setHierarchy(data);

        const depts = Object.keys(data);
        if (depts.length > 0) {
          setOpenDept(prev => (preserveOpenDept && prev && depts.includes(prev) ? prev : depts[0]));
        } else {
          setOpenDept(null);
        }
      } else {
        console.error("Backend refused the request. Token may be invalid or expired.");
      }
    } catch (error) {
      console.error("Failed to fetch hierarchy:", error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchHierarchy(false);
  }, [fetchHierarchy]);

  const handleSubjectClick = async (subject, deptName = null, progName = null) => {
    setSelectedSubject({ ...subject, department: deptName, program: progName });
    setFetchingFaculty(true);
    setEligibleFaculty([]);

    try {
      const safeCourseCode = encodeURIComponent(subject.courseCode);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/subjects/${safeCourseCode}/faculty`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEligibleFaculty(data);
      } else {
        console.error("Backend refused the request. Token may be invalid or expired.");
      }
    } catch (error) {
      console.error("Failed to fetch eligible faculty:", error);
    } finally {
      setFetchingFaculty(false);
    }
  };

  const handleExportCurriculum = async (format = 'xlsx', isTemplate = false) => {
    setExportingFormat(isTemplate ? `template-${format}` : format);
    const toastId = toast.loading(
      isTemplate ? `Preparing .${format} template...` : `Exporting curriculum as .${format}...`
    );

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/faculty/subjects/export?format=${format}${isTemplate ? '&template=true' : ''}`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to export curriculum file.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isTemplate
        ? `HireSense_Curriculum_Template.${format}`
        : `HireSense_Curriculum_Subjects.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success(
        isTemplate ? `Curriculum template (.${format}) downloaded!` : `Curriculum exported (.${format})!`,
        { id: toastId }
      );
    } catch (error) {
      toast.error(error.message || 'Export failed.', { id: toastId });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) {
      toast.error('Please select an .xlsx or .csv file first.');
      return;
    }

    setImporting(true);
    const toastId = toast.loading('Importing curriculum subjects...');

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('defaultDepartment', defaultDepartment);
      formData.append('defaultProgram', defaultProgram);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/subjects/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        toast.dismiss(toastId);
        setShowImportModal(false);
        setImportFile(null);
        if (importInputRef.current) importInputRef.current.value = '';
        await fetchHierarchy(true);

        await showAlert({
          title: 'Curriculum Import Complete',
          text: data.message,
          icon: 'success'
        });
      } else {
        toast.error(data.error || 'Failed to import curriculum.', { id: toastId });
      }
    } catch {
      toast.error('Network error while importing curriculum.', { id: toastId });
    } finally {
      setImporting(false);
    }
  };

  const handleAddSubjectSubmit = async (e) => {
    e.preventDefault();
    setSavingSubject(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/subjects/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSubject)
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message);
        setShowAddModal(false);
        setOpenDept(newSubject.department.trim());
        setNewSubject(prev => ({ ...prev, courseCode: '', subjectName: '' }));
        await fetchHierarchy(true);
      } else {
        toast.error(data.error || 'Failed to save subject.');
      }
    } catch {
      toast.error('Server error while saving subject.');
    } finally {
      setSavingSubject(false);
    }
  };

  const handleDeleteSubject = async (subject) => {
    const confirmed = await confirmAction({
      title: `Remove ${subject.courseCode}?`,
      text: `Are you sure you want to remove "${subject.courseCode} - ${subject.subjectName}" from the curriculum hierarchy?`,
      icon: 'warning',
      confirmButtonText: 'Yes, Remove Subject',
      confirmColor: '#dc3545'
    });
    if (!confirmed) return;

    try {
      const safeCode = encodeURIComponent(subject.courseCode);
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/faculty/subjects/${safeCode}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message);
        if (selectedSubject?.courseCode === subject.courseCode) {
          setSelectedSubject(null);
          setEligibleFaculty([]);
        }
        await fetchHierarchy(true);
      } else {
        toast.error(data.error || 'Failed to remove subject.');
      }
    } catch {
      toast.error('Server error while deleting subject.');
    }
  };

  // Toggles the accordion state natively in React
  const toggleDept = (deptName) => {
    setOpenDept(openDept === deptName ? null : deptName);
  };

  // Count total subjects across all departments/programs
  const totalSubjectsCount = Object.values(hierarchy).reduce(
    (sum, progs) => sum + Object.values(progs).reduce((pSum, list) => pSum + list.length, 0),
    0
  );

  if (loading) {
    return <div className="container mt-5 text-center"><h5>Loading Subject Hierarchy...</h5></div>;
  }

  return (
    <div className="d-flex flex-column h-100 pb-5">
      {/* Header with Curriculum Import / Export & Add Controls */}
      <div className="mb-4 flex-shrink-0 d-flex justify-content-between align-items-start align-items-md-center flex-wrap gap-3">
        <div>
          <h2 className="fw-bold mb-1" style={{ color: 'var(--text-main)' }}>
            <i className="bi bi-journal-bookmark-fill text-primary me-2"></i>Subject Eligibility Manager
          </h2>
          <p className="text-muted mb-0">
            Browse institutional subjects, manage curriculum courses, and verify faculty teaching eligibilities.
          </p>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary fw-semibold shadow-sm px-3 py-2"
            onClick={() => setShowAddModal(true)}
          >
            <i className="bi bi-plus-lg me-1"></i>Add Subject
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-success fw-semibold shadow-sm px-3 py-2"
            onClick={() => setShowImportModal(true)}
          >
            <i className="bi bi-file-earmark-arrow-up me-1"></i>Import Curriculum
          </button>

          <ExportDropdownButton
            label="Export Curriculum"
            formats={['xlsx', 'csv']}
            defaultFormat="xlsx"
            storageKey="hireSenseCurriculumExportFormat"
            isExporting={exportingFormat !== null}
            onExport={(fmt) => handleExportCurriculum(fmt, false)}
          />
        </div>
      </div>

      <div className="row g-4">
        {/* LEFT COLUMN: The Hierarchy Tree */}
        <div className="col-md-5">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-dark text-white fw-bold py-3 d-flex justify-content-between align-items-center">
              <span>Institutional Hierarchy</span>
              <span className="badge bg-secondary rounded-pill">{totalSubjectsCount} Subjects</span>
            </div>
            <div className="card-body p-0" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {Object.keys(hierarchy).length === 0 ? (
                <div className="p-4 text-center text-muted">
                  <i className="bi bi-folder2-open fs-2 d-block mb-2 opacity-50"></i>
                  <p className="small mb-3">No curriculum subjects found yet.</p>
                  <div className="d-flex justify-content-center gap-2">
                    <button className="btn btn-sm btn-primary" onClick={() => setShowAddModal(true)}>
                      <i className="bi bi-plus-lg me-1"></i>Add Subject
                    </button>
                    <button className="btn btn-sm btn-outline-primary" onClick={() => setShowImportModal(true)}>
                      <i className="bi bi-upload me-1"></i>Import File
                    </button>
                  </div>
                </div>
              ) : (
                <div className="accordion accordion-flush">
                  {Object.keys(hierarchy).map((dept, deptIndex) => {
                    const isOpen = openDept === dept;

                    return (
                      <div className="accordion-item border-bottom" key={deptIndex}>
                        <h2 className="accordion-header">
                          <button
                            className={`accordion-button fw-bold ${isOpen ? '' : 'collapsed'}`}
                            type="button"
                            onClick={() => toggleDept(dept)}
                            style={{ boxShadow: 'none' }}
                          >
                            <i className="bi bi-building me-2 text-primary"></i> Department: {dept}
                          </button>
                        </h2>

                        <div className={`accordion-collapse collapse ${isOpen ? 'show' : ''}`}>
                          <div className="accordion-body p-0">
                            {Object.keys(hierarchy[dept]).map((prog, progIndex) => (
                              <div className="border-bottom" key={progIndex}>
                                <div
                                  className="px-4 py-2 fw-semibold border-bottom d-flex justify-content-between align-items-center"
                                  style={{ backgroundColor: 'var(--bg-neutral-light)', color: 'var(--text-main)' }}
                                >
                                  <span>
                                    <i className="bi bi-diagram-2 me-2 text-success"></i> Program: {prog}
                                  </span>
                                  <span className="badge bg-secondary bg-opacity-10 text-muted border rounded-pill small">
                                    {hierarchy[dept][prog].length}
                                  </span>
                                </div>

                                <div className="list-group list-group-flush rounded-0">
                                  {hierarchy[dept][prog].map((sub, subIndex) => (
                                    <button
                                      key={subIndex}
                                      className={`list-group-item list-group-item-action ps-4 ps-md-5 pe-3 py-3 ${selectedSubject?.courseCode === sub.courseCode ? 'active bg-primary text-white border-primary' : ''}`}
                                      onClick={() => handleSubjectClick(sub, dept, prog)}
                                    >
                                      <div className="d-flex w-100 justify-content-between align-items-center">
                                        <h6 className="mb-1 fw-bold">{sub.subjectName}</h6>
                                      </div>
                                      <small className={selectedSubject?.courseCode === sub.courseCode ? 'text-white-50' : 'text-muted'}>
                                        {sub.courseCode}
                                      </small>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: The Faculty Results */}
        <div className="col-md-7">
          <div className="card shadow-sm border-0 h-100" style={{ backgroundColor: 'var(--surface-neutral)' }}>
            <div className="card-body p-4">
              {!selectedSubject ? (
                <div className="text-center text-muted mt-5 pt-5">
                  <i className="bi bi-hand-index text-primary opacity-50" style={{ fontSize: '3rem' }}></i>
                  <h5 className="mt-3">Select a subject from the hierarchy</h5>
                  <p>Click on any course code on the left to view eligible faculty members.</p>
                </div>
              ) : (
                <>
                  <div
                    className="pb-4 mb-4 rounded-3 position-relative overflow-hidden shadow-sm d-flex justify-content-between align-items-center flex-wrap gap-3 px-4 py-4"
                    style={{
                      backgroundColor: 'var(--bg-neutral-light)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div className="position-relative z-1">
                      <div className="d-flex align-items-baseline flex-wrap">
                        <h4 className="fw-bold mb-0 me-2" style={{ color: 'var(--brand-primary-bg)' }}>
                          Faculty Competency:
                        </h4>
                        <h4 className="mb-0 fw-semibold" style={{ color: 'var(--text-main)' }}>
                          {selectedSubject.courseCode} - {selectedSubject.subjectName}
                        </h4>
                      </div>
                      {(selectedSubject.department || selectedSubject.program) && (
                        <div className="small text-muted mt-1">
                          {selectedSubject.department && <span className="me-3"><i className="bi bi-building me-1"></i>{selectedSubject.department}</span>}
                          {selectedSubject.program && <span><i className="bi bi-diagram-2 me-1"></i>{selectedSubject.program}</span>}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger fw-semibold flex-shrink-0"
                      onClick={() => handleDeleteSubject(selectedSubject)}
                      title="Remove this subject from curriculum"
                    >
                      <i className="bi bi-trash3 me-1"></i>Remove Subject
                    </button>
                  </div>

                  <h5 className="fw-bold mb-3">
                    <i className="bi bi-person-check-fill text-success me-2"></i>Eligible Faculty
                  </h5>

                  {fetchingFaculty ? (
                    <div className="text-center my-4"><div className="spinner-border text-primary"></div></div>
                  ) : eligibleFaculty.length === 0 ? (
                    <div className="alert alert-warning border-0 shadow-sm">
                      <i className="bi bi-exclamation-triangle-fill me-2"></i> No verified faculty members are currently eligible to teach this subject.
                    </div>
                  ) : (
                    <div className="row g-3">
                      {eligibleFaculty.map((faculty, index) => (
                        <div className="col-12" key={index}>
                          <div className="card shadow-sm hover-lift" style={{ backgroundColor: 'var(--bg-neutral-light)', border: '1px solid var(--border-subtle)' }}>
                            <div className="card-body d-flex flex-wrap align-items-center gap-2">
                              <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-2 flex-shrink-0" style={{ width: '45px', height: '45px' }}>
                                {faculty.firstName?.[0] || ''}{faculty.lastName?.[0] || ''}
                              </div>
                              <div className="flex-grow-1 min-w-0">
                                <h6 className="fw-bold mb-0">{faculty.firstName} {faculty.lastName}</h6>
                                <p className="text-muted small mb-0">{faculty.department}</p>
                              </div>
                              <div className="flex-shrink-0">
                                <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-2">
                                  Approved
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: ADD / UPDATE SINGLE SUBJECT */}
      {showAddModal && (
        <div
          className="modal d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-neutral)', color: 'var(--text-main)' }}>
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-journal-plus text-primary me-2"></i>Add or Update Curriculum Subject
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>
              <form onSubmit={handleAddSubjectSubmit}>
                <div className="modal-body p-4">
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted text-uppercase">Department</label>
                    <input
                      type="text"
                      className="form-control"
                      list="deptOptions"
                      placeholder="e.g., Information Technology"
                      value={newSubject.department}
                      onChange={(e) => setNewSubject({ ...newSubject, department: e.target.value })}
                      required
                    />
                    <datalist id="deptOptions">
                      <option value="Information Technology" />
                      <option value="General Education" />
                      <option value="Tourism & Hospitality" />
                    </datalist>
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted text-uppercase">Program Code</label>
                    <input
                      type="text"
                      className="form-control"
                      list="progOptions"
                      placeholder="e.g., BSIT, BSCS, BSHM, GE"
                      value={newSubject.program}
                      onChange={(e) => setNewSubject({ ...newSubject, program: e.target.value })}
                      required
                    />
                    <datalist id="progOptions">
                      <option value="BSIT" />
                      <option value="BSCS" />
                      <option value="BSHM" />
                      <option value="BSTM" />
                      <option value="GE" />
                    </datalist>
                  </div>

                  <div className="row g-3">
                    <div className="col-sm-5">
                      <label className="form-label small fw-bold text-muted text-uppercase">Course Code</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g., IT1808"
                        value={newSubject.courseCode}
                        onChange={(e) => setNewSubject({ ...newSubject, courseCode: e.target.value })}
                        required
                      />
                    </div>
                    <div className="col-sm-7">
                      <label className="form-label small fw-bold text-muted text-uppercase">Subject Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g., Integrative Programming"
                        value={newSubject.subjectName}
                        onChange={(e) => setNewSubject({ ...newSubject, subjectName: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-top">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary fw-bold px-4" disabled={savingSubject}>
                    {savingSubject ? 'Saving...' : 'Save Subject'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: BULK IMPORT CURRICULUM (.XLSX / .CSV) */}
      {showImportModal && (
        <div
          className="modal d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg" style={{ backgroundColor: 'var(--surface-neutral)', color: 'var(--text-main)' }}>
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-file-earmark-arrow-up text-primary me-2"></i>Import Curriculum Subjects (.XLSX / .CSV)
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowImportModal(false)}></button>
              </div>
              <form onSubmit={handleImportSubmit}>
                <div className="modal-body p-4">
                  <div
                    className="p-3 rounded-3 mb-4"
                    style={{ backgroundColor: 'var(--bg-neutral-light)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                      <span className="fw-bold small text-uppercase text-muted">
                        <i className="bi bi-table me-1 text-primary"></i>Supported Spreadsheet Format
                      </span>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success py-1 px-2"
                          onClick={() => handleExportCurriculum('xlsx', true)}
                          disabled={exportingFormat !== null}
                        >
                          <i className="bi bi-download me-1"></i>Template (.xlsx)
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-1 px-2"
                          onClick={() => handleExportCurriculum('csv', true)}
                          disabled={exportingFormat !== null}
                        >
                          <i className="bi bi-download me-1"></i>Template (.csv)
                        </button>
                      </div>
                    </div>

                    <p className="small text-muted mb-2">
                      Upload an Excel (<code>.xlsx</code>) or CSV (<code>.csv</code>) file with the 4 columns below. If your file only has <strong>Course Code</strong> and <strong>Subject Name</strong> columns, the fallback Department &amp; Program below will be applied automatically.
                    </p>

                    <div className="table-responsive">
                      <table className="table table-sm table-bordered mb-0 small">
                        <thead className="table-light">
                          <tr>
                            <th>Department</th>
                            <th>Program</th>
                            <th>Course Code</th>
                            <th>Subject Name</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Information Technology</td>
                            <td>BSIT</td>
                            <td>IT1808</td>
                            <td>Integrative Programming</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small text-uppercase text-muted">
                      Select Curriculum File (.xlsx or .csv)
                    </label>
                    <input
                      ref={importInputRef}
                      type="file"
                      className="form-control"
                      accept=".xlsx,.csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>

                  <div className="row g-3">
                    <div className="col-sm-6">
                      <label className="form-label small fw-bold text-muted text-uppercase">
                        Fallback Department <span className="fw-normal">(if column omitted)</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={defaultDepartment}
                        onChange={(e) => setDefaultDepartment(e.target.value)}
                      />
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label small fw-bold text-muted text-uppercase">
                        Fallback Program <span className="fw-normal">(if column omitted)</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={defaultProgram}
                        onChange={(e) => setDefaultProgram(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-top">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowImportModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary fw-bold px-4" disabled={importing || !importFile}>
                    {importing ? (
                      <><span className="spinner-border spinner-border-sm me-2"></span>Importing...</>
                    ) : (
                      <><i className="bi bi-check2-circle me-1"></i>Import Subjects</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectManager;
