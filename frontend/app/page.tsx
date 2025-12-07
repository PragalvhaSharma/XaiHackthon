"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResearchProgressStep } from "@/lib/db/schema";

interface Job {
  id: string;
  title: string;
  team: string;
  location: string;
  type: string;
}

type PipelineStage = "discovery" | "research" | "ranking" | "outreach" | "screening" | "review";

interface Candidate {
  id: string;
  jobId: string | null;
  name: string;
  email: string | null;
  x: string;
  github: string | null;
  linkedin: string | null;
  stage: string;
  score: number | null;
  researchStatus: string | null;
  researchProgress: string | null;
  researchNotes: string | null;
  rawResearch: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LiveActivity {
  id: number;
  candidateId: string;
  candidateName: string;
  message: string;
  timestamp: Date;
  icon: string;
}

const PIPELINE_STAGES: { key: PipelineStage; label: string; icon: string; description: string }[] = [
  { key: "discovery", label: "Find People", icon: "🔍", description: "Search hashtags & keywords" },
  { key: "research", label: "Deep Research", icon: "🔬", description: "Social profiles & links" },
  { key: "ranking", label: "Rank & Grade", icon: "📊", description: "Comprehensive rubric" },
  { key: "outreach", label: "Send DM", icon: "✉️", description: "Personalized outreach" },
  { key: "screening", label: "Phone Screen", icon: "📞", description: "AI interview" },
  { key: "review", label: "Recruiter Review", icon: "✓", description: "Approve or deny" },
];

export default function RecruiterDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [activeStage, setActiveStage] = useState<PipelineStage>("research");
  const [isLoading, setIsLoading] = useState(true);
  const [liveActivity, setLiveActivity] = useState<LiveActivity[]>([]);
  const [newCandidateX, setNewCandidateX] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const activityRef = useRef<HTMLDivElement>(null);
  const activityIdRef = useRef(0);
  const lastProgressRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight;
    }
  }, [liveActivity]);

  // Fetch jobs
  useEffect(() => {
    fetch("/api/jobs")
      .then(res => res.json())
      .then(data => {
        setJobs(data);
        if (data.length > 0) setSelectedJob(data[0]);
      })
      .catch(console.error);
  }, []);

  // Fetch candidates & poll for updates
  useEffect(() => {
    if (!selectedJob) return;
    
    const fetchCandidates = () => {
      fetch(`/api/candidates?jobId=${selectedJob.id}`)
        .then(res => res.json())
        .then((data: Candidate[]) => {
          setCandidates(prev => {
            // Check for new progress and add to activity feed
            data.forEach(candidate => {
              if (candidate.researchProgress) {
                const progress: ResearchProgressStep[] = JSON.parse(candidate.researchProgress);
                const lastSeen = lastProgressRef.current.get(candidate.id) || 0;
                
                progress.slice(lastSeen).forEach(step => {
                  let icon = "◆";
                  if (step.type === "x") icon = "𝕏";
                  if (step.type === "github") icon = "◉";
                  if (step.type === "linkedin") icon = "in";
                  if (step.type === "synthesis") icon = "✦";
                  if (step.type === "start") icon = "🚀";
                  
                  setLiveActivity(prev => [...prev.slice(-100), {
                    id: activityIdRef.current++,
                    candidateId: candidate.id,
                    candidateName: candidate.name,
                    message: step.message,
                    timestamp: new Date(step.timestamp),
                    icon,
                  }]);
                });
                
                lastProgressRef.current.set(candidate.id, progress.length);
              }
            });
            
            return data;
          });
          setIsLoading(false);
          
          // Update selected candidate if it changed
          if (selectedCandidate) {
            const updated = data.find(c => c.id === selectedCandidate.id);
            if (updated) setSelectedCandidate(updated);
          }
        })
        .catch(console.error);
    };
    
    fetchCandidates();
    const interval = setInterval(fetchCandidates, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [selectedJob, selectedCandidate?.id]);

  // Auto-start research for candidates in research stage
  useEffect(() => {
    candidates
      .filter(c => c.stage === "research" && c.researchStatus === "pending" && !c.researchNotes)
      .forEach(candidate => {
        fetch("/api/research/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId: candidate.id }),
        }).catch(console.error);
      });
  }, [candidates]);

  const addCandidate = async () => {
    if (!newCandidateX.trim() || !newCandidateName.trim() || !selectedJob) return;
    
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCandidateName,
          x: newCandidateX.replace("@", ""),
          jobId: selectedJob.id,
        }),
      });
      
      if (!res.ok) throw new Error("Failed to add candidate");
      
      const newCandidate = await res.json();
      setCandidates(prev => [...prev, newCandidate]);
      setNewCandidateX("");
      setNewCandidateName("");
      setShowAddForm(false);
      setSelectedCandidate(newCandidate);
    } catch (err) {
      console.error("Failed to add candidate:", err);
    }
  };

  const getCandidatesForStage = (stage: PipelineStage) => 
    candidates.filter(c => c.stage === stage);

  const hasActiveResearch = candidates.some(c => c.researchStatus === "running");
  const stageCandidates = getCandidatesForStage(activeStage);

  // Parse research progress for selected candidate
  const researchProgress: ResearchProgressStep[] = selectedCandidate?.researchProgress 
    ? JSON.parse(selectedCandidate.researchProgress) 
    : [];

  if (!selectedJob) {
    return <div className="dashboard"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">xAI <span>Recruiter</span></div>
          <div className="status-indicator">
            <span className={`status-dot ${hasActiveResearch ? 'active' : ''}`} />
            <span className="status-text">{hasActiveResearch ? 'Processing' : 'Idle'}</span>
          </div>
        </div>
        
        <div className="sidebar-section">
          <div className="sidebar-label">Jobs</div>
          <div className="job-list-sidebar">
            {jobs.map(job => (
              <button
                key={job.id}
                className={`job-btn ${selectedJob.id === job.id ? 'active' : ''}`}
                onClick={() => setSelectedJob(job)}
              >
                <span className="job-btn-title">{job.title}</span>
                <span className="job-btn-meta">{job.team}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="main-header">
          <div className="header-left">
            <h1>{selectedJob.title}</h1>
            <span className="header-meta">{selectedJob.team} · {selectedJob.location}</span>
          </div>
          <div className="header-right">
            <span className="candidate-count">{candidates.length} candidates</span>
          </div>
        </header>

        <nav className="pipeline-nav">
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = getCandidatesForStage(stage.key).length;
            const isActive = activeStage === stage.key;
            const isWorking = stage.key === "research";
            return (
              <button
                key={stage.key}
                className={`pipeline-stage-btn ${isActive ? 'active' : ''} ${!isWorking ? 'mocked' : ''}`}
                onClick={() => setActiveStage(stage.key)}
              >
                <div className="stage-header">
                  <span className="stage-icon">{stage.icon}</span>
                  <span className="stage-label">{stage.label}</span>
                  {count > 0 && <span className="stage-count">{count}</span>}
                </div>
                {!isWorking && <span className="mock-badge">mock</span>}
                {idx < PIPELINE_STAGES.length - 1 && <div className="stage-arrow">→</div>}
              </button>
            );
          })}
        </nav>

        <div className="content-area">
          <div className="candidates-panel">
            <div className="panel-header">
              <h2>{PIPELINE_STAGES.find(s => s.key === activeStage)?.label}</h2>
              <p className="panel-description">{PIPELINE_STAGES.find(s => s.key === activeStage)?.description}</p>
              {activeStage === "research" && (
                <button className="add-btn" onClick={() => setShowAddForm(true)}>+ Add Candidate</button>
              )}
            </div>

            {showAddForm && activeStage === "research" && (
              <div className="add-form">
                <input type="text" placeholder="Full name" value={newCandidateName} onChange={e => setNewCandidateName(e.target.value)} className="add-input" />
                <input type="text" placeholder="@handle" value={newCandidateX} onChange={e => setNewCandidateX(e.target.value)} className="add-input" />
                <div className="add-actions">
                  <button className="btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button className="btn-primary" onClick={addCandidate}>Add</button>
                </div>
              </div>
            )}

            <div className="candidates-list">
              {isLoading ? (
                <div className="empty-state"><p>Loading...</p></div>
              ) : stageCandidates.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">{PIPELINE_STAGES.find(s => s.key === activeStage)?.icon}</span>
                  <p>No candidates in this stage</p>
                </div>
              ) : (
                stageCandidates.map(candidate => {
                  const isResearching = candidate.researchStatus === "running";
                  return (
                    <div 
                      key={candidate.id} 
                      className={`candidate-card ${selectedCandidate?.id === candidate.id ? 'selected' : ''} ${isResearching ? 'researching' : ''}`}
                      onClick={() => setSelectedCandidate(candidate)}
                    >
                      <div className="candidate-avatar">{candidate.name.split(' ').map(n => n[0]).join('')}</div>
                      <div className="candidate-info">
                        <div className="candidate-name">{candidate.name}</div>
                        <div className="candidate-handle">@{candidate.x}</div>
                      </div>
                      {isResearching && <span className="candidate-spinner" />}
                      {candidate.score && (
                        <div className="candidate-score">
                          <span className="score-num">{candidate.score}</span>
                          <span className="score-label">score</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="detail-panel">
            {selectedCandidate ? (
              <>
                <div className="detail-header">
                  <div className="detail-avatar">{selectedCandidate.name.split(' ').map(n => n[0]).join('')}</div>
                  <div className="detail-info">
                    <h3>{selectedCandidate.name}</h3>
                    <a href={`https://x.com/${selectedCandidate.x}`} target="_blank" rel="noopener noreferrer" className="detail-handle">@{selectedCandidate.x}</a>
                    <div className="detail-stage">
                      {PIPELINE_STAGES.find(s => s.key === selectedCandidate.stage)?.icon} {PIPELINE_STAGES.find(s => s.key === selectedCandidate.stage)?.label}
                    </div>
                  </div>
                  {selectedCandidate.score && (
                    <div className="detail-score">
                      <span className="score-value">{selectedCandidate.score}</span>
                      <span className="score-label">score</span>
                    </div>
                  )}
                </div>

                <div className="detail-body">
                  {/* Research Progress Cards */}
                  {(selectedCandidate.researchStatus === "running" || researchProgress.length > 0) && activeStage === "research" && (
                    <div className="research-cards">
                      <div className="cards-header">
                        <h4>Deep Research</h4>
                        {selectedCandidate.researchStatus === "running" && <span className="live-badge">LIVE</span>}
                      </div>
                      <div className="cards-list">
                        {researchProgress.length === 0 && (
                          <div className="research-card pending">
                            <div className="card-icon">⏳</div>
                            <div className="card-content">
                              <div className="card-title">Initializing</div>
                              <div className="card-detail">Starting research agent...</div>
                            </div>
                          </div>
                        )}
                        {researchProgress.map((step, i) => {
                          const isLatest = i === researchProgress.length - 1;
                          const isDone = step.status === "done";
                          const isError = step.status === "error";
                          
                          let icon = "◆";
                          if (step.type === "x") icon = "𝕏";
                          if (step.type === "github") icon = "◉";
                          if (step.type === "linkedin") icon = "in";
                          if (step.type === "synthesis") icon = "✦";
                          if (step.type === "start") icon = "🚀";
                          
                          return (
                            <div key={step.id} className={`research-card ${isLatest ? 'latest' : ''} ${isDone ? 'done' : ''} ${isError ? 'error' : ''}`}>
                              <div className="card-icon">{icon}</div>
                              <div className="card-content">
                                <div className="card-title">{step.message}</div>
                              </div>
                              {isLatest && selectedCandidate.researchStatus === "running" && !isDone && <div className="card-spinner" />}
                              {isDone && <div className="card-check">✓</div>}
                              {isError && <div className="card-error">✗</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Research Results */}
                  {selectedCandidate.researchNotes && (
                    <div className="research-results">
                      <div className="results-header">
                        <h4>Research Summary</h4>
                        <div className="source-links">
                          <a href={`https://x.com/${selectedCandidate.x}`} target="_blank" rel="noopener noreferrer">𝕏</a>
                          {selectedCandidate.github && <a href={`https://github.com/${selectedCandidate.github}`} target="_blank" rel="noopener noreferrer">◉</a>}
                          {selectedCandidate.linkedin && <a href={selectedCandidate.linkedin} target="_blank" rel="noopener noreferrer">in</a>}
                        </div>
                      </div>
                      <div className="research-content">{selectedCandidate.researchNotes}</div>
                    </div>
                  )}

                  {/* Pending state */}
                  {!selectedCandidate.researchNotes && selectedCandidate.researchStatus !== "running" && researchProgress.length === 0 && activeStage === "research" && (
                    <div className="research-pending">
                      <h4>Queued for Research</h4>
                      <p>Will begin automatically</p>
                    </div>
                  )}

                  {/* Mock stages */}
                  {activeStage !== "research" && (
                    <div className="mock-section">
                      <div className="mock-icon">{PIPELINE_STAGES.find(s => s.key === activeStage)?.icon}</div>
                      <h4>{PIPELINE_STAGES.find(s => s.key === activeStage)?.label}</h4>
                      <p className="mock-description">
                        {activeStage === "discovery" && "AI agent searches hashtags and keywords to find candidates from X posts"}
                        {activeStage === "ranking" && "Candidates are scored against a comprehensive rubric based on research data"}
                        {activeStage === "outreach" && "Personalized DM content generated based on deep research findings"}
                        {activeStage === "screening" && "AI conducts phone screen asking about background, projects, and research"}
                        {activeStage === "review" && "Recruiter reviews candidates and provides feedback to improve ranking"}
                      </p>
                      <div className="mock-badge-large">Coming Soon</div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <span>👈</span>
                <p>Select a candidate</p>
              </div>
            )}
          </div>

          <div className="activity-panel">
            <div className="panel-header">
              <h2>Live Activity</h2>
              {hasActiveResearch && <span className="live-badge">LIVE</span>}
            </div>
            <div className="activity-feed" ref={activityRef}>
              {liveActivity.length === 0 ? (
                <div className="activity-empty"><p>Waiting for activity...</p></div>
              ) : (
                liveActivity.map(activity => (
                  <div key={activity.id} className="activity-item">
                    <span className="activity-icon">{activity.icon}</span>
                    <div className="activity-content">
                      <span className="activity-name">{activity.candidateName}</span>
                      <span className="activity-message">{activity.message}</span>
                    </div>
                    <span className="activity-time">{activity.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
