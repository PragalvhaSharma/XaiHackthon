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
  // Local state for UI
  research?: ResearchResult;
  researchProgress?: {
    x: { status: string; message: string };
    github: { status: string; message: string };
    linkedin: { status: string; message: string };
    synthesis: { status: string; message: string };
  };
  liveMessages?: { id: number; text: string; timestamp: Date }[];
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
  const [isResearching, setIsResearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newCandidateX, setNewCandidateX] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const liveLogRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  // Fetch jobs on mount
  useEffect(() => {
    fetch("/api/jobs")
      .then(res => res.json())
      .then(data => {
        setJobs(data);
        if (data.length > 0) setSelectedJob(data[0]);
      })
      .catch(console.error);
  }, []);

  // Fetch candidates when job changes
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

  useEffect(() => {
    if (liveLogRef.current) {
      liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight;
    }
  }, [selectedCandidate?.liveMessages]);

  const getCandidatesForStage = (stage: PipelineStage) => 
    candidates.filter(c => c.stage === stage);

  const runResearch = useCallback(async (candidate: Candidate) => {
    if (isResearching || !selectedJob) return;
    setIsResearching(true);
    
    setCandidates(prev => prev.map(c => 
      c.id === candidate.id 
        ? { 
            ...c, 
            liveMessages: [],
            researchProgress: {
              x: { status: "pending", message: "Waiting..." },
              github: { status: "pending", message: "Waiting..." },
              linkedin: { status: "pending", message: "Waiting..." },
              synthesis: { status: "pending", message: "Waiting..." },
            }
          } 
        : c
    ));

    const addLiveMessage = (text: string) => {
      setCandidates(prev => prev.map(c => 
        c.id === candidate.id 
          ? { ...c, liveMessages: [...(c.liveMessages || []), { id: msgIdRef.current++, text, timestamp: new Date() }] }
          : c
      ));
    };

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
              addLiveMessage(step.message);
            } else if ((step.type === "x" || step.type === "github" || step.type === "linkedin" || step.type === "synthesis") && step.message) {
              addLiveMessage(step.message);
              setCandidates(prev => prev.map(c => 
                c.id === candidate.id 
                  ? { 
                      ...c, 
                      researchProgress: {
                        ...c.researchProgress!,
                        [step.type]: { status: step.status, message: step.message }
                      }
                    }
                  : c
              ));
            } else if (step.type === "complete") {
              addLiveMessage("✅ Research complete!");
              
              // Update in database
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
                      research: step.result, 
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
      addLiveMessage(`❌ Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsResearching(false);
    }
  }, [isResearching, selectedJob]);

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

  const moveCandidate = async (candidate: Candidate, direction: "forward" | "back") => {
    const stageOrder: PipelineStage[] = ["discovery", "research", "ranking", "outreach", "screening", "review"];
    const currentIdx = stageOrder.indexOf(candidate.stage as PipelineStage);
    const newIdx = direction === "forward" ? currentIdx + 1 : currentIdx - 1;
    if (newIdx < 0 || newIdx >= stageOrder.length) return;
    
    const newStage = stageOrder[newIdx];
    
    try {
      await fetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      
      setCandidates(prev => prev.map(c => 
        c.id === candidate.id 
          ? { ...c, stage: newStage }
          : c
      ));
      
      if (selectedCandidate?.id === candidate.id) {
        setSelectedCandidate({ ...selectedCandidate, stage: newStage });
      }
    } catch (err) {
      console.error("Failed to move candidate:", err);
    }
  };

  const stageCandidates = getCandidatesForStage(activeStage);

  if (!selectedJob) {
    return (
      <div className="dashboard">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">xAI <span>Recruiter</span></div>
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

        <div className="sidebar-section">
          <div className="sidebar-label">Pipeline Stats</div>
          <div className="stats-grid">
            {PIPELINE_STAGES.map(stage => {
              const count = getCandidatesForStage(stage.key).length;
              return (
                <div key={stage.key} className="stat-item">
                  <span className="stat-icon">{stage.icon}</span>
                  <span className="stat-count">{count}</span>
                </div>
              );
            })}
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
                <button className="add-btn" onClick={() => setShowAddForm(true)}>
                  + Add Candidate
                </button>
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
                  <button className="btn-primary" onClick={addCandidate}>Add & Research</button>
                </div>
              </div>
            )}

            <div className="candidates-list">
              {isLoading ? (
                <div className="empty-state">
                  <span className="empty-icon">⏳</span>
                  <p>Loading candidates...</p>
                </div>
              ) : stageCandidates.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">{PIPELINE_STAGES.find(s => s.key === activeStage)?.icon}</span>
                  <p>No candidates in this stage</p>
                </div>
              ) : (
                stageCandidates.map(candidate => (
                  <div 
                    key={candidate.id} 
                    className={`candidate-card ${selectedCandidate?.id === candidate.id ? 'selected' : ''}`}
                    onClick={() => setSelectedCandidate(candidate)}
                  >
                    <div className="candidate-avatar">
                      {candidate.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="candidate-info">
                      <div className="candidate-name">{candidate.name}</div>
                      <div className="candidate-handle">@{candidate.x}</div>
                    </div>
                    {candidate.score && (
                      <div className="candidate-score">
                        <span className="score-num">{candidate.score}</span>
                        <span className="score-label">score</span>
                      </div>
                    )}
                    {activeStage === "research" && !candidate.researchNotes && (
                      <button 
                        className="research-btn"
                        onClick={(e) => { e.stopPropagation(); runResearch(candidate); }}
                        disabled={isResearching}
                      >
                        {isResearching && selectedCandidate?.id === candidate.id ? "..." : "Research"}
                      </button>
                    )}
                  </div>
                ))
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
                  </div>
                  <div className="detail-actions">
                    <button 
                      className="action-btn" 
                      onClick={() => moveCandidate(selectedCandidate, "back")}
                      disabled={selectedCandidate.stage === "discovery"}
                    >
                      ← Back
                    </button>
                    <button 
                      className="action-btn primary"
                      onClick={() => moveCandidate(selectedCandidate, "forward")}
                      disabled={selectedCandidate.stage === "review"}
                    >
                      Forward →
                    </button>
                  </div>
                </div>

                {activeStage === "research" && (
                  <div className="research-section">
                    {selectedCandidate.liveMessages && selectedCandidate.liveMessages.length > 0 ? (
                      <div className="research-log" ref={liveLogRef}>
                        {selectedCandidate.liveMessages
                          .filter(msg => {
                            const text = msg.text.toLowerCase();
                            if (text.includes("x_search:") || text.includes("web_search:") || text.includes("tool:")) return false;
                            if (text.match(/^\s*:\s*\{\}/)) return false;
                            if (text.includes("{}")) return false;
                            return true;
                          })
                          .map((msg, i, arr) => {
                            const isLatest = i === arr.length - 1;
                            const isDone = msg.text.includes("Found") || msg.text.includes("✅") || msg.text.includes("complete");
                            
                            let icon = "◆";
                            if (msg.text.includes("X") || msg.text.includes("Twitter") || msg.text.includes("@")) icon = "𝕏";
                            if (msg.text.includes("GitHub") || msg.text.includes("github")) icon = "◉";
                            if (msg.text.includes("LinkedIn") || msg.text.includes("linkedin")) icon = "in";
                            if (msg.text.includes("Synthe") || msg.text.includes("complete")) icon = "✦";
                            
                            return (
                              <div key={msg.id} className={`log-entry ${isLatest ? 'latest' : ''} ${isDone ? 'done' : ''}`}>
                                <span className="log-icon">{icon}</span>
                                <span className="log-text">{msg.text.replace(/🔍|🔎|✅|⚠️/g, '').trim()}</span>
                                {isLatest && !isDone && <span className="log-spinner" />}
                              </div>
                            );
                          })}
                      </div>
                    ) : selectedCandidate.researchNotes ? (
                      <div className="research-complete">
                        <div className="research-status">✅ Research Complete</div>
                        <div className="research-notes">
                          {selectedCandidate.researchNotes}
                        </div>
                        <div className="research-sources">
                          <h4>Sources</h4>
                          <div className="source-links">
                            <a href={`https://x.com/${selectedCandidate.x}`} target="_blank" rel="noopener noreferrer">𝕏 @{selectedCandidate.x}</a>
                            {selectedCandidate.github && (
                              <a href={`https://github.com/${selectedCandidate.github}`} target="_blank" rel="noopener noreferrer">◉ {selectedCandidate.github}</a>
                            )}
                            {selectedCandidate.linkedin && (
                              <a href={selectedCandidate.linkedin} target="_blank" rel="noopener noreferrer">in LinkedIn</a>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="research-prompt">
                        <div className="prompt-icon">🔬</div>
                        <h4>Ready to Research</h4>
                        <p>Click "Research" to start deep research on this candidate's public profiles</p>
                        <button 
                          className="btn-primary"
                          onClick={() => runResearch(selectedCandidate)}
                          disabled={isResearching}
                        >
                          Start Deep Research
                        </button>
                      </div>
                    )}
                  </div>
                )}

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
                    {selectedCandidate.score && (
                      <div className="mock-score">
                        <span className="score-value">{selectedCandidate.score}</span>
                        <span className="score-max">/100</span>
                      </div>
                    )}
                    <div className="mock-badge-large">Coming Soon</div>
                  </div>
                )}
              </>
            ) : (
              <div className="no-selection">
                <span className="no-selection-icon">👈</span>
                <p>Select a candidate to view details</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
