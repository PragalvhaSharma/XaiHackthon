"use client";

import { useEffect, useRef, useState } from "react";
import type { ResearchProgressStep } from "@/lib/db/schema";

function ResearchSummaryCards({ notes }: { notes: string }) {
  const sections = [
    { key: "background", label: "Background", icon: "👤", pattern: /\*\*Background[.\s]*\*\*\.?\s*([\s\S]*?)(?=\*\*(?:Technical Skills|Skills|Notable Work|Interests|Interview)|$)/i },
    { key: "skills", label: "Technical Skills", icon: "⚡", pattern: /\*\*(?:Technical Skills|Skills)[.\s]*\*\*\.?\s*([\s\S]*?)(?=\*\*(?:Notable Work|Interests|Interview)|$)/i },
    { key: "work", label: "Notable Work", icon: "🏆", pattern: /\*\*(?:Notable Work|Projects)[.\s]*\*\*\.?\s*([\s\S]*?)(?=\*\*(?:Interests|Interview)|$)/i },
    { key: "interests", label: "Interests", icon: "💡", pattern: /\*\*Interests[.\s]*\*\*\.?\s*([\s\S]*?)(?=\*\*Interview|$)/i },
    { key: "interview", label: "Interview Angles", icon: "🎯", pattern: /\*\*Interview (?:Angles|Questions)[.\s]*\*\*\.?\s*([\s\S]*?)$/i },
  ];

  const parsed = sections.map(section => {
    const match = notes.match(section.pattern);
    return {
      ...section,
      content: match?.[1]?.trim() || null,
    };
  }).filter(s => s.content);

  if (parsed.length === 0) {
    return <div className="summary-card"><div className="summary-content">{notes}</div></div>;
  }

  return (
    <div className="summary-cards">
      {parsed.map(section => (
        <div key={section.key} className="summary-card">
          <div className="summary-header">
            <span className="summary-icon">{section.icon}</span>
            <span className="summary-label">{section.label}</span>
          </div>
          <div className="summary-content">{section.content}</div>
        </div>
      ))}
    </div>
  );
}

interface Job {
  id: string;
  title: string;
  description?: string;
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
  xAvatar: string | null;
  xAvatarUrl: string | null;
  github: string | null;
  linkedin: string | null;
  location: string | null;
  // Discovery/Hunt fields (persisted in DB)
  bio: string | null;
  followers: number | null;
  foundVia: string | null;
  evaluationReason: string | null;
  // Pipeline fields
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
  const [jobInfoModal, setJobInfoModal] = useState<Job | null>(null);
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: "",
    team: "",
    location: "",
    type: "Full-time",
    description: "",
  });
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobFormError, setJobFormError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [activeStage, setActiveStage] = useState<PipelineStage>("discovery");
  const [isLoading, setIsLoading] = useState(true);
  const [liveActivity, setLiveActivity] = useState<LiveActivity[]>([]);
  const [newCandidateX, setNewCandidateX] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isHunting, setIsHunting] = useState(false);
  const [xAuthUser, setXAuthUser] = useState<{ name: string; username: string } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const activityRef = useRef<HTMLDivElement>(null);
  const activityIdRef = useRef(0);

  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight;
    }
  }, [liveActivity]);

  // Check X auth status
  useEffect(() => {
    fetch("http://localhost:8080/auth/status", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setXAuthUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setIsCheckingAuth(false));
  }, []);

  // Fetch jobs
  useEffect(() => {
    fetch("/api/jobs")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load jobs");
        return res.json();
      })
      .then(data => {
        setJobs(data);
        if (data.length > 0) setSelectedJob(data[0]);
        setJobsError(null);
      })
      .catch(err => {
        console.error(err);
        setJobsError("Failed to load jobs");
      });
  }, []);

  // Fetch candidates once when job changes
  useEffect(() => {
    if (!selectedJob) return;
    setIsLoading(true);
    
    fetch(`/api/candidates?jobId=${selectedJob.id}`)
      .then(res => res.json())
      .then((data: Candidate[]) => {
        setCandidates(data);
        setIsLoading(false);
      })
      .catch(console.error);
  }, [selectedJob]);

  // Track in-flight research (client-side only)
  const [liveResearchProgress, setLiveResearchProgress] = useState<Map<string, ResearchProgressStep[]>>(new Map());
  const researchingRef = useRef<Set<string>>(new Set());

  // Start research for a candidate
  const startResearch = async (candidate: Candidate) => {
    if (researchingRef.current.has(candidate.id)) return;
    researchingRef.current.add(candidate.id);
    setLiveResearchProgress(prev => new Map(prev).set(candidate.id, []));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.name,
          x: candidate.x,
          github: candidate.github || "",
          linkedin: candidate.linkedin || "",
          email: candidate.email || "",
        }),
      });

      if (!res.ok || !res.body) throw new Error("Research failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type && data.type !== "complete" && data.type !== "error") {
              const msg = data.message || "";
              
              // Filter out noisy tool call messages
              const isNoise = msg.includes("🔍") || 
                              msg.match(/tool.*:\s*\{/) ||
                              msg.match(/x_search.*:\s*\{/) ||
                              msg.match(/web_search.*:\s*\{/) ||
                              msg.includes("{}...");
              
              if (isNoise) continue;
              
              const step: ResearchProgressStep = {
                type: data.type,
                status: data.status || "searching",
                message: msg,
                id: Date.now(),
                timestamp: Date.now(),
              };
              setLiveResearchProgress(prev => {
                const updated = new Map(prev);
                const existing = updated.get(candidate.id) || [];
                updated.set(candidate.id, [...existing, step]);
                return updated;
              });
              
              // Add to live activity
              let icon = "◆";
              if (data.type === "avatar") icon = "🖼️";
              if (data.type === "x") icon = "𝕏";
              if (data.type === "github") icon = "◉";
              if (data.type === "linkedin") icon = "in";
              if (data.type === "synthesis") icon = "✦";
              if (data.type === "start") icon = "🚀";
              
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: candidate.id,
                candidateName: candidate.name,
                message: msg,
                timestamp: new Date(),
                icon,
              }]);
            }
            
            // Handle completion - save to DB
            if (data.type === "complete" && data.result) {
              await fetch(`/api/candidates/${candidate.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  researchStatus: "done",
                  researchNotes: data.result.researchNotes,
                  rawResearch: JSON.stringify(data.result.rawResearch),
                  github: data.result.candidate?.github || candidate.github,
                  linkedin: data.result.candidate?.linkedin || candidate.linkedin,
                  xAvatar: data.result.avatar?.dataUrl ?? candidate.xAvatar ?? null,
                  xAvatarUrl: data.result.avatar?.sourceUrl ?? candidate.xAvatarUrl ?? null,
                  stage: "ranking",
                }),
              });
              // Refresh candidates
              const refreshRes = await fetch(`/api/candidates?jobId=${selectedJob?.id}`);
              const refreshed = await refreshRes.json();
              setCandidates(refreshed);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Research failed:", err);
    } finally {
      researchingRef.current.delete(candidate.id);
      setLiveResearchProgress(prev => {
        const updated = new Map(prev);
        updated.delete(candidate.id);
        return updated;
      });
    }
  };

  // Auto-start research for candidates in research stage with pending status
  useEffect(() => {
    candidates
      .filter(c => c.stage === "research" && c.researchStatus === "pending" && !c.researchNotes)
      .forEach(candidate => startResearch(candidate));
  }, [candidates]);

  const resetJobForm = () => {
    setJobForm({
      title: "",
      team: "",
      location: "",
      type: "Full-time",
      description: "",
    });
    setJobFormError(null);
  };

  const createJob = async () => {
    if (!jobForm.title.trim() || !jobForm.team.trim() || !jobForm.location.trim() || !jobForm.type.trim() || !jobForm.description.trim()) {
      setJobFormError("Please fill in all job fields");
      return;
    }

    setIsSavingJob(true);
    setJobFormError(null);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: jobForm.title.trim(),
          team: jobForm.team.trim(),
          location: jobForm.location.trim(),
          type: jobForm.type.trim(),
          description: jobForm.description.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to create job");
      }

      const newJob = await res.json();
      setJobs(prev => [newJob, ...prev]);
      setSelectedJob(newJob);
      setJobsError(null);
      setShowJobForm(false);
      resetJobForm();
    } catch (error) {
      console.error("Create job failed:", error);
      setJobFormError(error instanceof Error ? error.message : "Failed to create job");
    } finally {
      setIsSavingJob(false);
    }
  };

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

  // Hunt for candidates using the backend
  const startHunt = async () => {
    if (!selectedJob || isHunting) return;
    
    setIsHunting(true);
    setActiveStage("discovery"); // Show discovery stage during hunt

    try {
      const res = await fetch("/api/hunt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selectedJob.id }),
      });

      if (!res.ok || !res.body) {
        const error = await res.json();
        setLiveActivity(prev => [...prev.slice(-100), {
          id: activityIdRef.current++,
          candidateId: "",
          candidateName: "Error",
          message: error.error || "Hunt failed",
          timestamp: new Date(),
          icon: "❌",
        }]);
        setIsHunting(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === "start" || data.type === "progress") {
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Hunt",
                message: data.message,
                timestamp: new Date(),
                icon: "🔍",
              }]);
            } else if (data.type === "stats") {
              // Show the funnel stats
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Hunt Stats",
                message: `${data.totalSearched} searched → ${data.totalViable} viable`,
                timestamp: new Date(),
                icon: "📊",
              }]);
            } else if (data.type === "candidate") {
              // Add new candidate to the list
              setCandidates(prev => [...prev, data.candidate]);
              
              // Add to live activity
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: data.candidate.id,
                candidateName: data.candidate.name,
                message: `Found via "${data.candidate.foundVia || "search"}"`,
                timestamp: new Date(),
                icon: "🎯",
              }]);
            } else if (data.type === "skip") {
              // Skip silently or show in activity
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Skipped",
                message: data.message,
                timestamp: new Date(),
                icon: "⏭️",
              }]);
            } else if (data.type === "complete") {
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Hunt Complete",
                message: data.message,
                timestamp: new Date(),
                icon: "🎉",
              }]);
            } else if (data.type === "error") {
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Error",
                message: data.message,
                timestamp: new Date(),
                icon: "❌",
              }]);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Hunt failed:", err);
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: "",
        candidateName: "Error",
        message: `Hunt failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
        icon: "❌",
      }]);
    } finally {
      setIsHunting(false);
    }
  };

  // Get candidates currently at a specific stage (for listing)
  const getCandidatesForStage = (stage: PipelineStage) => 
    candidates.filter(c => c.stage === stage);

  // Get cumulative count - candidates at this stage OR any later stage (for funnel counts)
  const STAGE_ORDER: PipelineStage[] = ["discovery", "research", "ranking", "outreach", "screening", "review"];
  const getCumulativeCount = (stage: PipelineStage) => {
    const stageIndex = STAGE_ORDER.indexOf(stage);
    return candidates.filter(c => {
      const candidateStageIndex = STAGE_ORDER.indexOf(c.stage as PipelineStage);
      return candidateStageIndex >= stageIndex;
    }).length;
  };

  const hasActiveResearch = liveResearchProgress.size > 0 || isHunting;
  const stageCandidates = getCandidatesForStage(activeStage);

  // Get live progress for selected candidate (from streaming) or from DB
  const researchProgress: ResearchProgressStep[] = selectedCandidate 
    ? (liveResearchProgress.get(selectedCandidate.id) || 
       (selectedCandidate.researchProgress ? JSON.parse(selectedCandidate.researchProgress) : []))
    : [];
  
  const isCurrentlyResearching = selectedCandidate ? researchingRef.current.has(selectedCandidate.id) : false;

  const jobModals = (
    <>
      {jobInfoModal && (
        <div className="modal-backdrop" onClick={() => setJobInfoModal(null)}>
          <div className="modal-card job-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{jobInfoModal.title}</div>
                <div className="modal-subtitle">{jobInfoModal.team} · {jobInfoModal.location} · {jobInfoModal.type}</div>
              </div>
              <button className="modal-close" onClick={() => setJobInfoModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {jobInfoModal.description ? (
                <p className="job-description">{jobInfoModal.description}</p>
              ) : (
                <p className="text-muted">No description available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showJobForm && (
        <div className="modal-backdrop" onClick={() => { if (!isSavingJob) { setShowJobForm(false); resetJobForm(); } }}>
          <div className="modal-card job-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">New Job</div>
                <div className="modal-subtitle">Add a role to start hunting</div>
              </div>
              <button 
                className="modal-close" 
                onClick={() => { if (!isSavingJob) { setShowJobForm(false); resetJobForm(); } }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-input-grid">
                <label className="modal-field">
                  <span>Title</span>
                  <input 
                    className="modal-input"
                    type="text"
                    placeholder="e.g., Software Engineer, AI Infrastructure"
                    value={jobForm.title}
                    onChange={e => setJobForm(prev => ({ ...prev, title: e.target.value }))}
                  />
                </label>
                <label className="modal-field">
                  <span>Team</span>
                  <input 
                    className="modal-input"
                    type="text"
                    placeholder="Engineering, Product, Research"
                    value={jobForm.team}
                    onChange={e => setJobForm(prev => ({ ...prev, team: e.target.value }))}
                  />
                </label>
                <label className="modal-field">
                  <span>Location</span>
                  <input 
                    className="modal-input"
                    type="text"
                    placeholder="San Francisco, Remote"
                    value={jobForm.location}
                    onChange={e => setJobForm(prev => ({ ...prev, location: e.target.value }))}
                  />
                </label>
                <label className="modal-field">
                  <span>Type</span>
                  <select
                    className="modal-input"
                    value={jobForm.type}
                    onChange={e => setJobForm(prev => ({ ...prev, type: e.target.value }))}
                  >
                    <option>Full-time</option>
                    <option>Contract</option>
                    <option>Part-time</option>
                    <option>Internship</option>
                  </select>
                </label>
              </div>
              <label className="modal-field">
                <span>Description</span>
                <textarea
                  className="modal-textarea"
                  rows={5}
                  placeholder="What should the hunt focus on?"
                  value={jobForm.description}
                  onChange={e => setJobForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </label>
              {jobFormError && <div className="modal-error">{jobFormError}</div>}
            </div>
            <div className="modal-footer">
              <button 
                className="btn-ghost" 
                onClick={() => { if (!isSavingJob) { setShowJobForm(false); resetJobForm(); } }}
                disabled={isSavingJob}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={createJob} 
                disabled={isSavingJob}
              >
                {isSavingJob ? "Creating..." : "Create Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!selectedJob) {
    return (
      <>
        {jobModals}
        <div className="dashboard">
          <div className="loading">
            <div className="loading-stack">
              <div>{jobsError || "Add a job to get started"}</div>
              <button 
                className="btn-primary"
                onClick={() => { resetJobForm(); setShowJobForm(true); }}
                type="button"
              >
                New Job
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {jobModals}
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
          <div className="sidebar-label-row">
            <div className="sidebar-label">Jobs</div>
            <button 
              className="job-new-btn" 
              onClick={() => { resetJobForm(); setShowJobForm(true); }}
              type="button"
            >
              ＋ New
            </button>
          </div>
          {jobsError && <div className="sidebar-error">{jobsError}</div>}
          <div className="job-list-sidebar">
            {jobs.length === 0 && !jobsError ? (
              <div className="job-empty-hint">
                <p>No jobs yet.</p>
                <button 
                  className="btn-primary" 
                  type="button" 
                  onClick={() => { resetJobForm(); setShowJobForm(true); }}
                >
                  Create one
                </button>
              </div>
            ) : jobs.map(job => (
              <div key={job.id} className="job-list-item">
                <button
                  className={`job-btn ${selectedJob.id === job.id ? 'active' : ''}`}
                  onClick={() => setSelectedJob(job)}
                >
                  <span className="job-btn-title">{job.title}</span>
                  <span className="job-btn-meta">{job.team}</span>
                </button>
                <button 
                  className="job-info-btn" 
                  onClick={e => { e.stopPropagation(); setJobInfoModal(job); }}
                  aria-label="View job details"
                  title="View job details"
                  type="button"
                >
                  i
                </button>
              </div>
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
            {isCheckingAuth ? (
              <span className="auth-loading">...</span>
            ) : xAuthUser ? (
              <div className="auth-user">
                <span className="auth-user-name">@{xAuthUser.username}</span>
                <span className="auth-badge connected">𝕏 Connected</span>
              </div>
            ) : (
              <a href="http://localhost:8080/authorize" className="auth-btn">
                <span>𝕏</span> Connect X
              </a>
            )}
          </div>
        </header>

        <nav className="pipeline-nav">
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = getCumulativeCount(stage.key);
            const currentCount = getCandidatesForStage(stage.key).length;
            const isActive = activeStage === stage.key;
            const isWorking = stage.key === "research" || stage.key === "discovery";
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
              <div className="panel-title-row">
                <h2>{PIPELINE_STAGES.find(s => s.key === activeStage)?.label}</h2>
                {stageCandidates.length > 0 && (
                  <span className="panel-count">{stageCandidates.length} here</span>
                )}
              </div>
              <p className="panel-description">{PIPELINE_STAGES.find(s => s.key === activeStage)?.description}</p>
            </div>

            {/* Discovery Actions */}
            {activeStage === "discovery" && !showAddForm && (
              <div className="discovery-actions">
                <button 
                  className="discovery-btn primary" 
                  onClick={startHunt}
                  disabled={isHunting || !selectedJob?.description || !xAuthUser}
                >
                  {isHunting ? (
                    <>
                      <span className="hunt-spinner" />
                      <span>Hunting on X...</span>
                    </>
                  ) : (
                    <>
                      <span className="discovery-btn-icon">🎯</span>
                      <span className="discovery-btn-text">
                        <strong>Find People on X</strong>
                        <small>AI searches for candidates matching job</small>
                      </span>
                    </>
                  )}
                </button>
                <button 
                  className="discovery-btn secondary" 
                  onClick={() => setShowAddForm(true)}
                >
                  <span className="discovery-btn-icon">✏️</span>
                  <span className="discovery-btn-text">
                    <strong>Add Manually</strong>
                    <small>Enter X handle directly</small>
                  </span>
                </button>
                {!xAuthUser && (
                  <div className="auth-hint-inline">
                    Connect X in the header to use Find People
                  </div>
                )}
              </div>
            )}

            {/* Manual Add Form */}
            {showAddForm && activeStage === "discovery" && (
              <div className="add-form">
                <div className="add-form-header">
                  <h4>Add Candidate Manually</h4>
                  <button className="close-btn" onClick={() => setShowAddForm(false)}>×</button>
                </div>
                <input 
                  type="text" 
                  placeholder="Full name (e.g., John Smith)" 
                  value={newCandidateName} 
                  onChange={e => setNewCandidateName(e.target.value)} 
                  className="add-input" 
                />
                <input 
                  type="text" 
                  placeholder="X handle (e.g., @johnsmith)" 
                  value={newCandidateX} 
                  onChange={e => setNewCandidateX(e.target.value)} 
                  className="add-input" 
                />
                <div className="add-actions">
                  <button className="btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button className="btn-primary" onClick={addCandidate} disabled={!newCandidateName.trim() || !newCandidateX.trim()}>
                    Add to Pipeline
                  </button>
                </div>
              </div>
            )}


            <div className="candidates-list">
              {isLoading ? (
                <div className="empty-state"><p>Loading...</p></div>
              ) : stageCandidates.length === 0 && !isHunting ? (
                <div className="empty-state">
                  <span className="empty-icon">{PIPELINE_STAGES.find(s => s.key === activeStage)?.icon}</span>
                  <p>{activeStage === "discovery" ? "Use the buttons above to find candidates" : "No candidates in this stage"}</p>
                </div>
              ) : stageCandidates.length === 0 && isHunting ? (
                <div className="empty-state hunting">
                  <span className="hunt-spinner-large" />
                  <p>Searching X for candidates...</p>
                </div>
              ) : (
                stageCandidates.map(candidate => {
                  const isResearching = researchingRef.current.has(candidate.id);
                  const avatarSrc = candidate.xAvatar || candidate.xAvatarUrl;
                  return (
                    <div 
                      key={candidate.id} 
                      className={`candidate-card ${selectedCandidate?.id === candidate.id ? 'selected' : ''} ${isResearching ? 'researching' : ''}`}
                      onClick={() => setSelectedCandidate(candidate)}
                    >
                      <div className="candidate-avatar">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt={`${candidate.name} avatar`} />
                        ) : (
                          candidate.name.split(' ').map(n => n[0]).join('')
                        )}
                      </div>
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
                  <div className="detail-avatar">
                    {selectedCandidate.xAvatar || selectedCandidate.xAvatarUrl ? (
                      <img src={selectedCandidate.xAvatar || selectedCandidate.xAvatarUrl || undefined} alt={`${selectedCandidate.name} avatar`} />
                    ) : (
                      selectedCandidate.name.split(' ').map(n => n[0]).join('')
                    )}
                  </div>
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
                  {(isCurrentlyResearching || researchProgress.length > 0) && activeStage === "research" && (
                    <div className="research-cards">
                      <div className="cards-header">
                        <h4>Deep Research</h4>
                        {isCurrentlyResearching && <span className="live-badge">LIVE</span>}
                      </div>
                      <div className="cards-list">
                        {researchProgress.length === 0 && isCurrentlyResearching && (
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
                          if (step.type === "avatar") icon = "🖼️";
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
                              {isLatest && isCurrentlyResearching && !isDone && <div className="card-spinner" />}
                              {isDone && <div className="card-check">✓</div>}
                              {isError && <div className="card-error">✗</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Research Results as Cards */}
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
                      <ResearchSummaryCards notes={selectedCandidate.researchNotes} />
                    </div>
                  )}

                  {/* Pending state */}
                  {!selectedCandidate.researchNotes && !isCurrentlyResearching && researchProgress.length === 0 && activeStage === "research" && (
                    <div className="research-pending">
                      <h4>Queued for Research</h4>
                      <p>Will begin automatically</p>
                    </div>
                  )}

                  {/* Discovery Detail View */}
                  {activeStage === "discovery" && (
                    <div className="discovery-detail">
                      {/* Bio */}
                      {selectedCandidate.bio && (
                        <div className="discovery-section">
                          <h4>Bio</h4>
                          <p className="discovery-bio">{selectedCandidate.bio}</p>
                        </div>
                      )}
                      
                      {/* Evaluation from AI */}
                      {selectedCandidate.evaluationReason && (
                        <div className="discovery-section">
                          <h4>AI Assessment</h4>
                          <div className="evaluation-card">
                            <div className="evaluation-reason">{selectedCandidate.evaluationReason}</div>
                            <div className="evaluation-meta">
                              {selectedCandidate.foundVia && (
                                <span className="evaluation-tag">Found via "{selectedCandidate.foundVia}"</span>
                              )}
                              {selectedCandidate.location && (
                                <span className="evaluation-tag secondary">📍 {selectedCandidate.location}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Stats */}
                      {selectedCandidate.followers && (
                        <div className="discovery-section">
                          <h4>Stats</h4>
                          <div className="discovery-stats">
                            <div className="stat-item">
                              <span className="stat-value">{selectedCandidate.followers.toLocaleString()}</span>
                              <span className="stat-label">Followers</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="discovery-actions-detail">
                        <a 
                          href={`https://x.com/${selectedCandidate.x}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn-outline"
                        >
                          𝕏 View Profile
                        </a>
                        <button 
                          className="btn-primary"
                          onClick={async () => {
                            await fetch(`/api/candidates/${selectedCandidate.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ stage: "research" }),
                            });
                            setCandidates(prev => prev.map(c => 
                              c.id === selectedCandidate.id ? { ...c, stage: "research" } : c
                            ));
                            setActiveStage("research");
                          }}
                        >
                          🔬 Start Deep Research
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mock stages */}
                  {activeStage !== "research" && activeStage !== "discovery" && (
                    <div className="mock-section">
                      <div className="mock-icon">{PIPELINE_STAGES.find(s => s.key === activeStage)?.icon}</div>
                      <h4>{PIPELINE_STAGES.find(s => s.key === activeStage)?.label}</h4>
                      <p className="mock-description">
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
              {(hasActiveResearch || isHunting) && <span className="live-badge">LIVE</span>}
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
    </>
  );
}
