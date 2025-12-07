"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandidateInput, ResearchResult, ResearchStep } from "@/lib/types";

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
  researchNotes: string | null;
  rawResearch: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LiveActivity {
  id: number;
  candidateId: string;
  candidateName: string;
  type: "start" | "progress" | "complete" | "error";
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
  const [activeResearch, setActiveResearch] = useState<Set<string>>(new Set());
  const [newCandidateX, setNewCandidateX] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const activityRef = useRef<HTMLDivElement>(null);
  const activityIdRef = useRef(0);
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight;
    }
  }, [liveActivity]);

  useEffect(() => {
    fetch("/api/jobs")
      .then(res => res.json())
      .then(data => {
        setJobs(data);
        if (data.length > 0) setSelectedJob(data[0]);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedJob) return;
    setIsLoading(true);
    fetch(`/api/candidates?jobId=${selectedJob.id}`)
      .then(res => res.json())
      .then(data => {
        setCandidates(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  }, [selectedJob]);

  const addActivity = useCallback((
    candidateId: string,
    candidateName: string,
    type: LiveActivity["type"],
    message: string,
    icon: string = "◆"
  ) => {
    setLiveActivity(prev => [...prev.slice(-100), {
      id: activityIdRef.current++,
      candidateId,
      candidateName,
      type,
      message,
      timestamp: new Date(),
      icon,
    }]);
  }, []);

  const runResearch = useCallback(async (candidate: Candidate) => {
    if (activeResearch.has(candidate.id) || !selectedJob) return;
    
    setActiveResearch(prev => new Set(prev).add(candidate.id));
    addActivity(candidate.id, candidate.name, "start", `Starting deep research...`, "🚀");

    const payload: CandidateInput = {
      name: candidate.name,
      email: candidate.email || "",
      x: candidate.x,
      github: candidate.github || undefined,
      linkedin: candidate.linkedin || undefined,
      role: selectedJob.title,
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: "xAI",
    };

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error ?? "Research failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            const step: ResearchStep = JSON.parse(json);

            if (step.type === "start" && step.message) {
              let icon = "🔍";
              if (step.message.includes("GitHub")) icon = "◉";
              if (step.message.includes("LinkedIn")) icon = "in";
              addActivity(candidate.id, candidate.name, "progress", step.message.replace(/🔍|🔎|✅|⚠️/g, '').trim(), icon);
            } else if ((step.type === "x" || step.type === "github" || step.type === "linkedin" || step.type === "synthesis")) {
              if (step.message) {
                let icon = "◆";
                if (step.type === "x") icon = "𝕏";
                if (step.type === "github") icon = "◉";
                if (step.type === "linkedin") icon = "in";
                if (step.type === "synthesis") icon = "✦";
                
                const cleanMsg = step.message.replace(/🔍|🔎|✅|⚠️/g, '').trim();
                if (!cleanMsg.includes("{}") && cleanMsg.length > 5) {
                  addActivity(candidate.id, candidate.name, "progress", cleanMsg, icon);
                }
              }
            } else if (step.type === "complete") {
              addActivity(candidate.id, candidate.name, "complete", "Research complete! Moving to ranking.", "✅");
              
              await fetch(`/api/candidates/${candidate.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  stage: "ranking",
                  researchNotes: step.result.researchNotes,
                  rawResearch: step.result.rawResearch,
                  github: step.result.sources.github,
                  linkedin: step.result.sources.linkedin,
                }),
              });

              setCandidates(prev => prev.map(c => 
                c.id === candidate.id 
                  ? { 
                      ...c, 
                      stage: "ranking",
                      researchNotes: step.result.researchNotes,
                      github: step.result.sources.github || null,
                      linkedin: step.result.sources.linkedin || null,
                    }
                  : c
              ));
            } else if (step.type === "error") {
              throw new Error(step.message);
            }
          } catch {}
        }
      }
    } catch (err) {
      addActivity(candidate.id, candidate.name, "error", `Error: ${err instanceof Error ? err.message : "Unknown error"}`, "❌");
    } finally {
      setActiveResearch(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  }, [activeResearch, selectedJob, addActivity]);

  useEffect(() => {
    if (!selectedJob) return;
    
    const unresearchedCandidates = candidates.filter(c => 
      c.stage === "research" && 
      !c.researchNotes && 
      !activeResearch.has(c.id) &&
      !processedRef.current.has(c.id)
    );
    
    if (unresearchedCandidates.length > 0 && activeResearch.size === 0) {
      const next = unresearchedCandidates[0];
      processedRef.current.add(next.id);
      runResearch(next);
    }
  }, [candidates, selectedJob, activeResearch, runResearch]);

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
      addActivity(newCandidate.id, newCandidate.name, "start", "Added to pipeline", "➕");
      setNewCandidateX("");
      setNewCandidateName("");
      setShowAddForm(false);
    } catch (err) {
      console.error("Failed to add candidate:", err);
    }
  };

  const getCandidatesForStage = (stage: PipelineStage) => 
    candidates.filter(c => c.stage === stage);

  const stageCandidates = getCandidatesForStage(activeStage);

  if (!selectedJob) {
    return <div className="dashboard"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">xAI <span>Recruiter</span></div>
          <div className="status-indicator">
            <span className={`status-dot ${activeResearch.size > 0 ? 'active' : ''}`} />
            <span className="status-text">{activeResearch.size > 0 ? 'Processing' : 'Idle'}</span>
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
                <input
                  type="text"
                  placeholder="Full name"
                  value={newCandidateName}
                  onChange={e => setNewCandidateName(e.target.value)}
                  className="add-input"
                />
                <input
                  type="text"
                  placeholder="X handle (e.g. @username)"
                  value={newCandidateX}
                  onChange={e => setNewCandidateX(e.target.value)}
                  className="add-input"
                />
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
                  const isActive = activeResearch.has(candidate.id);
                  return (
                    <div 
                      key={candidate.id} 
                      className={`candidate-card ${selectedCandidate?.id === candidate.id ? 'selected' : ''} ${isActive ? 'researching' : ''}`}
                      onClick={() => setSelectedCandidate(candidate)}
                    >
                      <div className="candidate-avatar">
                        {candidate.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="candidate-info">
                        <div className="candidate-name">{candidate.name}</div>
                        <div className="candidate-handle">@{candidate.x}</div>
                      </div>
                      {isActive && <span className="candidate-spinner" />}
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
                  <div className="detail-avatar">
                    {selectedCandidate.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="detail-info">
                    <h3>{selectedCandidate.name}</h3>
                    <a href={`https://x.com/${selectedCandidate.x}`} target="_blank" rel="noopener noreferrer" className="detail-handle">
                      @{selectedCandidate.x}
                    </a>
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
                  {selectedCandidate.researchNotes ? (
                    <div className="research-results">
                      <div className="results-header">
                        <h4>Research Summary</h4>
                        <div className="source-links">
                          <a href={`https://x.com/${selectedCandidate.x}`} target="_blank" rel="noopener noreferrer">𝕏</a>
                          {selectedCandidate.github && (
                            <a href={`https://github.com/${selectedCandidate.github}`} target="_blank" rel="noopener noreferrer">◉</a>
                          )}
                          {selectedCandidate.linkedin && (
                            <a href={selectedCandidate.linkedin} target="_blank" rel="noopener noreferrer">in</a>
                          )}
                        </div>
                      </div>
                      <div className="research-content">{selectedCandidate.researchNotes}</div>
                    </div>
                  ) : activeResearch.has(selectedCandidate.id) ? (
                    <div className="research-in-progress">
                      <div className="progress-spinner" />
                      <h4>Research in Progress</h4>
                      <p>AI is analyzing public profiles...</p>
                    </div>
                  ) : activeStage !== "research" ? (
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
                  ) : (
                    <div className="research-pending">
                      <h4>Queued for Research</h4>
                      <p>Will begin automatically</p>
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
              {activeResearch.size > 0 && <span className="live-badge">LIVE</span>}
            </div>
            <div className="activity-feed" ref={activityRef}>
              {liveActivity.length === 0 ? (
                <div className="activity-empty">
                  <p>Waiting for activity...</p>
                </div>
              ) : (
                liveActivity.map(activity => (
                  <div key={activity.id} className={`activity-item ${activity.type}`}>
                    <span className="activity-icon">{activity.icon}</span>
                    <div className="activity-content">
                      <span className="activity-name">{activity.candidateName}</span>
                      <span className="activity-message">{activity.message}</span>
                    </div>
                    <span className="activity-time">
                      {activity.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
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
