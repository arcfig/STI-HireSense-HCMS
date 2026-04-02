import { useState } from 'react';

function CandidateMatcher() {
  const [requirements, setRequirements] = useState('');
  const [matches, setMatches] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const handleMatch = async (e) => {
    e.preventDefault();
    if (!requirements.trim()) return;
    
    setIsSearching(true);
    setError('');
    setMatches([]);

    try {
      const response = await fetch('http://localhost:5000/api/faculty/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirements })
      });

      const data = await response.json();

      if (response.ok) {
        setMatches(data);
      } else {
        setError(data.error || 'Failed to fetch matches.');
      }
    } catch (err) {
      setError('Server error during AI matching.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="fw-bold text-dark mb-1"><i className="bi bi-robot text-primary me-2"></i>AI Candidate Matcher</h2>
        <span className="text-muted">Describe the role or skills you need, and the AI will rank the best faculty fits.</span>
      </div>

      <div className="card shadow-sm border-0 rounded-3 p-4 mb-4 bg-white">
        <form onSubmit={handleMatch}>
          <div className="mb-3">
            <label className="form-label fw-bold text-secondary">Job Description / Requirements</label>
            <textarea 
              className="form-control bg-light border-primary-subtle focus-ring" 
              rows="3" 
              placeholder="e.g., We need a faculty member experienced in Java programming to teach an advanced backend development seminar..."
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              required
            ></textarea>
          </div>
          <button type="submit" className="btn btn-primary fw-bold px-4 shadow-sm" disabled={isSearching}>
            {isSearching ? (
              <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> AI is Analyzing Database...</>
            ) : (
              <><i className="bi bi-magic me-2"></i> Find Best Matches</>
            )}
          </button>
        </form>
        {error && <div className="alert alert-danger mt-3 mb-0 py-2 border-0"><i className="bi bi-exclamation-circle-fill me-2"></i>{error}</div>}
      </div>

      {matches.length > 0 && (
        <div>
          <h5 className="fw-bold text-secondary mb-3">Top AI Recommended Matches</h5>
          <div className="row g-4">
            {matches.map((faculty, index) => (
              <div className="col-12" key={faculty._id}>
                <div className={`card shadow-sm border-0 rounded-3 p-4 ${index === 0 ? 'border-start border-5 border-success bg-success bg-opacity-10' : 'bg-white'}`}>
                  <div className="row align-items-center">
                    
                    {/* Rank & Score */}
                    <div className="col-md-2 text-center border-end">
                      <h1 className={`display-4 fw-bold mb-0 ${index === 0 ? 'text-success' : 'text-primary'}`}>
                        {faculty.matchScore}%
                      </h1>
                      <span className="badge bg-secondary text-uppercase tracking-wide">Match Score</span>
                    </div>

                    {/* Faculty Details */}
                    <div className="col-md-4 ps-4">
                      {/* CHANGED: We now just use faculty.name since it's aggregated */}
                      <h4 className="fw-bold text-dark mb-1">{faculty.name}</h4>
                      <p className="text-muted fw-semibold mb-2">{faculty.department}</p>
                      <div className="d-flex flex-wrap gap-1">
                        {faculty.skills.map((tag, i) => {
                          // Bonus: Show their star rating next to the tag if they have one!
                          const rating = faculty.skillRatings && faculty.skillRatings[tag];
                          return (
                            <span key={i} className="badge bg-light text-dark border border-secondary-subtle">
                              {tag} {rating ? <span className="text-warning ms-1"><i className="bi bi-star-fill"></i> {rating}</span> : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* AI Reasoning */}
                    <div className="col-md-6 border-start ps-4">
                      <p className="fw-bold text-secondary mb-1 small text-uppercase"><i className="bi bi-cpu-fill me-1"></i> AI Analysis</p>
                      <p className="text-dark mb-0 fst-italic">"{faculty.matchReason}"</p>
                    </div>

                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CandidateMatcher;