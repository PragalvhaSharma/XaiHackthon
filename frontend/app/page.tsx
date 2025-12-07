"use client";

import { useEffect, useRef, useState } from "react";
import type { ResearchProgressStep } from "@/lib/db/schema";

// GitHub icon component
const GitHubIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    className={className}
    fill="currentColor"
  >
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

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
  // Interview fields
  interviewStatus: string | null;
  interviewScore: number | null;
  interviewTranscript: string | null;
  interviewFeedback: string | null;
  interviewStartedAt: string | null;
  interviewCompletedAt: string | null;
  // DM fields
  dmContent: string | null;
  dmSentAt: string | null;
  // Recruiter review fields
  recruiterRating: number | null;
  recruiterFeedback: string | null;
  recruiterReviewedAt: string | null;
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
  const [jobUrlInput, setJobUrlInput] = useState("");
  const [isParsingUrl, setIsParsingUrl] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [activeStage, setActiveStage] = useState<PipelineStage>("discovery");
  const [isLoading, setIsLoading] = useState(true);
  const [liveActivity, setLiveActivity] = useState<LiveActivity[]>([]);
  const [huntLog, setHuntLog] = useState<string[]>([]);
  const huntLogRef = useRef<HTMLDivElement>(null);
  const [newCandidateX, setNewCandidateX] = useState("");
  const [newCandidateName, setNewCandidateName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isHunting, setIsHunting] = useState(false);
  const [xAuthUser, setXAuthUser] = useState<{ name: string; username: string } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const activityRef = useRef<HTMLDivElement>(null);
  const activityIdRef = useRef(0);
  const [expandedResearchSteps, setExpandedResearchSteps] = useState<Map<string, Set<number>>>(new Map());
  const liveResearchProgressRef = useRef<Map<string, ResearchProgressStep[]>>(new Map());
  const [generatingDM, setGeneratingDM] = useState<Set<string>>(new Set());
  const [sendingDM, setSendingDM] = useState<Set<string>>(new Set());
  
  // RL Rescore state - for demonstrating self-improving AI
  const [rescoring, setRescoring] = useState<Set<string>>(new Set());
  const [rescoreResults, setRescoreResults] = useState<Map<string, { oldScore: number; newScore: number; calibrationApplied: boolean }>>(new Map());

  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight;
    }
  }, [liveActivity]);

  useEffect(() => {
    if (huntLogRef.current) {
      huntLogRef.current.scrollTop = huntLogRef.current.scrollHeight;
    }
  }, [huntLog]);

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
  const rankingRef = useRef<Set<string>>(new Set());
  const [rankingCandidates, setRankingCandidates] = useState<Set<string>>(new Set());

  // Start ranking for a candidate
  const startRanking = async (candidate: Candidate) => {
    if (rankingRef.current.has(candidate.id) || candidate.score) return;
    rankingRef.current.add(candidate.id);
    setRankingCandidates(prev => new Set(prev).add(candidate.id));

    // Add activity
    setLiveActivity(prev => [...prev.slice(-100), {
      id: activityIdRef.current++,
      candidateId: candidate.id,
      candidateName: candidate.name,
      message: "Starting AI ranking...",
      timestamp: new Date(),
      icon: "📊",
    }]);

    try {
      const res = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jobId: candidate.jobId,
        }),
      });

      if (!res.ok) {
        throw new Error("Ranking failed");
      }

      const result = await res.json();

      // Update local state
      setCandidates(prev => prev.map(c => 
        c.id === candidate.id 
          ? { ...c, score: result.score, stage: "outreach" }
          : c
      ));

      // Add success activity
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: candidate.id,
        candidateName: candidate.name,
        message: `Scored ${result.score}/100 → moved to Outreach`,
        timestamp: new Date(),
        icon: "✅",
      }]);

    } catch (err) {
      console.error("Ranking failed:", err);
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: candidate.id,
        candidateName: candidate.name,
        message: "Ranking failed",
        timestamp: new Date(),
        icon: "❌",
      }]);
    } finally {
      rankingRef.current.delete(candidate.id);
      setRankingCandidates(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  // Rescore candidate with RL calibration (self-improving AI demo)
  const rescoreCandidate = async (candidate: Candidate) => {
    if (!selectedJob || rescoring.has(candidate.id)) return;
    
    const oldScore = candidate.score || 0;
    setRescoring(prev => new Set(prev).add(candidate.id));
    
    setLiveActivity(prev => [...prev.slice(-100), {
      id: activityIdRef.current++,
      candidateId: candidate.id,
      candidateName: candidate.name,
      message: "🔄 Rescoring with recruiter feedback...",
      timestamp: new Date(),
      icon: "🧠",
    }]);

    try {
      const res = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jobId: selectedJob.id,
        }),
      });

      const result = await res.json();
      
      if (result.success) {
        // Store before/after for display
        setRescoreResults(prev => new Map(prev).set(candidate.id, {
          oldScore,
          newScore: result.score,
          calibrationApplied: result.calibration_applied || false,
        }));
        
        // Update candidate in state
        setCandidates(prev => prev.map(c => 
          c.id === candidate.id ? { ...c, score: result.score } : c
        ));
        if (selectedCandidate?.id === candidate.id) {
          setSelectedCandidate({ ...selectedCandidate, score: result.score });
        }
        
        const scoreDiff = result.score - oldScore;
        const diffText = scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`;
        
        setLiveActivity(prev => [...prev.slice(-100), {
          id: activityIdRef.current++,
          candidateId: candidate.id,
          candidateName: candidate.name,
          message: `✨ Rescored: ${oldScore} → ${result.score} (${diffText}) ${result.calibration_applied ? '• Calibration applied' : ''}`,
          timestamp: new Date(),
          icon: "🎯",
        }]);
      }
    } catch (err) {
      console.error("Rescore failed:", err);
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: candidate.id,
        candidateName: candidate.name,
        message: "Rescore failed",
        timestamp: new Date(),
        icon: "❌",
      }]);
    } finally {
      setRescoring(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  // Start research for a candidate
  const startResearch = async (candidate: Candidate) => {
    if (researchingRef.current.has(candidate.id)) return;
    researchingRef.current.add(candidate.id);
    setLiveResearchProgress(prev => new Map(prev).set(candidate.id, []));
    setExpandedResearchSteps(prev => {
      const next = new Map(prev);
      next.set(candidate.id, new Set());
      return next;
    });
    liveResearchProgressRef.current = new Map(liveResearchProgressRef.current).set(candidate.id, []);

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
              const isNoise = !msg || msg.trim() === "" || msg.includes("{}...");
              
              if (isNoise) continue;
              
              const step: ResearchProgressStep = {
                candidateId: candidate.id,
                type: data.type,
                status: data.status || "searching",
                message: msg,
                data: data.data,
                id: Date.now(),
                timestamp: Date.now(),
              };
              setLiveResearchProgress(prev => {
                const updated = new Map(prev);
                const existing = updated.get(candidate.id) || [];
                const nextSteps = [...existing, step];
                updated.set(candidate.id, nextSteps);
                liveResearchProgressRef.current = updated;
                return updated;
              });
              
              // Add to live activity
              let icon = "◆";
              if (data.type === "avatar") icon = "🖼️";
              if (data.type === "x") icon = "𝕏";
              if (data.type === "github") icon = "⌘";
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
              const progressSteps = liveResearchProgressRef.current.get(candidate.id) || [];
              await fetch(`/api/candidates/${candidate.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  researchStatus: "done",
                  researchNotes: data.result.researchNotes,
                  rawResearch: data.result.rawResearch,
                  researchProgress: JSON.stringify(progressSteps),
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
        liveResearchProgressRef.current = updated;
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

  // Auto-start ranking for candidates in ranking stage without a score
  useEffect(() => {
    candidates
      .filter(c => c.stage === "ranking" && !c.score && c.researchNotes)
      .forEach(candidate => startRanking(candidate));
  }, [candidates]);

  // Generate personalized DM for a candidate
  const generateDM = async (candidate: Candidate) => {
    if (generatingDM.has(candidate.id) || !selectedJob) return;
    
    setGeneratingDM(prev => new Set(prev).add(candidate.id));

    // Add activity
    setLiveActivity(prev => [...prev.slice(-100), {
      id: activityIdRef.current++,
      candidateId: candidate.id,
      candidateName: candidate.name,
      message: "Generating personalized DM...",
      timestamp: new Date(),
      icon: "✉️",
    }]);

    try {
      // Build candidate data for the API
      const candidateData = {
        user: {
          id: candidate.id,
          username: candidate.x,
          name: candidate.name,
          description: candidate.bio || "",
          public_metrics: {
            followers_count: candidate.followers || 0,
          },
        },
        tweets: [],
        evaluation: {
          reason: candidate.evaluationReason || candidate.researchNotes || "Matches job requirements",
        },
        found_via_keyword: candidate.foundVia || "",
      };

      const res = await fetch("http://localhost:8080/send-dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          candidate_data: candidateData,
          job_description: selectedJob.description || selectedJob.title,
          company_name: selectedJob.team || "Our Company",
          recruiter_name: xAuthUser?.name || "Recruiter",
          test_link: `${window.location.origin}/interview/${candidate.id}`,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate DM");
      }

      const result = await res.json();

      if (result.success && result.message) {
        // Save DM content to candidate
        await fetch(`/api/candidates/${candidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dmContent: result.message,
          }),
        });

        // Update local state
        setCandidates(prev => prev.map(c => 
          c.id === candidate.id 
            ? { ...c, dmContent: result.message }
            : c
        ));

        if (selectedCandidate?.id === candidate.id) {
          setSelectedCandidate({ ...selectedCandidate, dmContent: result.message });
        }

        // Check if it was also sent
        if (result.sent) {
          await fetch(`/api/candidates/${candidate.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dmSentAt: new Date().toISOString(),
            }),
          });

          setCandidates(prev => prev.map(c => 
            c.id === candidate.id 
              ? { ...c, dmSentAt: new Date().toISOString() }
              : c
          ));

          if (selectedCandidate?.id === candidate.id) {
            setSelectedCandidate({ ...selectedCandidate, dmContent: result.message, dmSentAt: new Date().toISOString() });
          }

          setLiveActivity(prev => [...prev.slice(-100), {
            id: activityIdRef.current++,
            candidateId: candidate.id,
            candidateName: candidate.name,
            message: "DM generated and sent!",
            timestamp: new Date(),
            icon: "✅",
          }]);
        } else {
          setLiveActivity(prev => [...prev.slice(-100), {
            id: activityIdRef.current++,
            candidateId: candidate.id,
            candidateName: candidate.name,
            message: "DM generated (ready to send)",
            timestamp: new Date(),
            icon: "📝",
          }]);
        }
      } else {
        throw new Error(result.error || "Failed to generate DM");
      }
    } catch (err) {
      console.error("DM generation failed:", err);
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: candidate.id,
        candidateName: candidate.name,
        message: `DM generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
        icon: "❌",
      }]);
    } finally {
      setGeneratingDM(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  // Send DM to a candidate (if not already sent during generation)
  const sendDM = async (candidate: Candidate) => {
    if (sendingDM.has(candidate.id) || !candidate.dmContent) return;
    
    setSendingDM(prev => new Set(prev).add(candidate.id));

    setLiveActivity(prev => [...prev.slice(-100), {
      id: activityIdRef.current++,
      candidateId: candidate.id,
      candidateName: candidate.name,
      message: "Sending DM...",
      timestamp: new Date(),
      icon: "📤",
    }]);

    try {
      // Build candidate data for the API
      const candidateData = {
        user: {
          id: candidate.id,
          username: candidate.x,
          name: candidate.name,
          description: candidate.bio || "",
        },
      };

      const res = await fetch("http://localhost:8080/send-dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          candidate_data: candidateData,
          job_description: selectedJob?.description || selectedJob?.title || "",
          company_name: selectedJob?.team || "Our Company",
          recruiter_name: xAuthUser?.name || "Recruiter",
          test_link: `${window.location.origin}/interview/${candidate.id}`,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to send DM");
      }

      const result = await res.json();

      if (result.sent) {
        // Update DB
        await fetch(`/api/candidates/${candidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dmSentAt: new Date().toISOString(),
          }),
        });

        // Update local state
        setCandidates(prev => prev.map(c => 
          c.id === candidate.id 
            ? { ...c, dmSentAt: new Date().toISOString() }
            : c
        ));

        if (selectedCandidate?.id === candidate.id) {
          setSelectedCandidate({ ...selectedCandidate, dmSentAt: new Date().toISOString() });
        }

        setLiveActivity(prev => [...prev.slice(-100), {
          id: activityIdRef.current++,
          candidateId: candidate.id,
          candidateName: candidate.name,
          message: "DM sent successfully!",
          timestamp: new Date(),
          icon: "✅",
        }]);
      } else {
        throw new Error(result.send_error || "DM not sent");
      }
    } catch (err) {
      console.error("DM send failed:", err);
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: candidate.id,
        candidateName: candidate.name,
        message: `DM send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
        icon: "❌",
      }]);
    } finally {
      setSendingDM(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  };

  const resetJobForm = () => {
    setJobForm({
      title: "",
      team: "",
      location: "",
      type: "Full-time",
      description: "",
    });
    setJobFormError(null);
    setJobUrlInput("");
  };

  const parseJobUrl = async () => {
    if (!jobUrlInput.trim()) {
      setJobFormError("Please enter a job URL");
      return;
    }

    setIsParsingUrl(true);
    setJobFormError(null);

    try {
      const res = await fetch("/api/jobs/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrlInput.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to parse job URL");
      }

      const parsed = await res.json();
      
      // Pre-fill the form with parsed data
      setJobForm({
        title: parsed.title || "",
        team: parsed.team || "",
        location: parsed.location || "",
        type: parsed.type || "Full-time",
        description: parsed.description || "",
      });
    } catch (error) {
      console.error("Parse URL error:", error);
      setJobFormError(error instanceof Error ? error.message : "Failed to parse job URL");
    } finally {
      setIsParsingUrl(false);
    }
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

  // Hunt for candidates using the backend with streaming
  const startHunt = async () => {
    if (!selectedJob || isHunting) return;
    
    if (!selectedJob.description) {
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: "",
        candidateName: "Error",
        message: "Job description is required for hunting",
        timestamp: new Date(),
        icon: "❌",
      }]);
      return;
    }
    
    setIsHunting(true);
    setActiveStage("discovery");
    setHuntLog([`Starting hunt for ${selectedJob.title}`]);

    try {
      // Call streaming endpoint directly with credentials
      const res = await fetch("http://localhost:8080/hunt/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_desc: selectedJob.description }),
        credentials: "include",
      });

      if (!res.ok || !res.body) {
        const error = await res.json().catch(() => ({ error: "Hunt failed" }));
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
      let addedCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === "start" || data.type === "progress") {
              setHuntLog(prev => [...prev.slice(-200), data.message]);
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Hunt",
                message: data.message,
                timestamp: new Date(),
                icon: "🔍",
              }]);
            } else if (data.type === "keywords") {
              setHuntLog(prev => [...prev.slice(-200), data.message]);
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Keywords",
                message: data.keywords.join(", "),
                timestamp: new Date(),
                icon: "🏷️",
              }]);
            } else if (data.type === "search_progress") {
              setHuntLog(prev => [...prev.slice(-200), data.message]);
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Search",
                message: data.message,
                timestamp: new Date(),
                icon: "🔎",
              }]);
            } else if (data.type === "tweets_progress" || data.type === "eval_progress") {
              setHuntLog(prev => [...prev.slice(-200), data.message]);
            } else if (data.type === "candidate") {
              // Save candidate to DB via Next.js API
              const candidateData = data.candidate;
              const username = data.username;
              
              try {
                const saveRes = await fetch("/api/candidates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    jobId: selectedJob.id,
                    name: candidateData.user?.name || username,
                    x: username,
                    bio: candidateData.user?.description || null,
                    followers: candidateData.user?.public_metrics?.followers_count || null,
                    foundVia: candidateData.found_via_keyword || null,
                    evaluationReason: candidateData.evaluation?.reason || null,
                    location: candidateData.user?.location || null,
                    xAvatarUrl: candidateData.user?.profile_image_url?.replace("_normal", "_400x400") || null,
                  }),
                });

                if (saveRes.ok) {
                  const saved = await saveRes.json();
                  addedCount++;
                  setCandidates(prev => [...prev, saved]);
                  setHuntLog(prev => [...prev.slice(-200), `✓ Added @${username}`]);
                  setLiveActivity(prev => [...prev.slice(-100), {
                    id: activityIdRef.current++,
                    candidateId: saved.id,
                    candidateName: saved.name,
                    message: `Found via "${candidateData.found_via_keyword || "search"}"`,
                    timestamp: new Date(),
                    icon: "🎯",
                  }]);
                } else if (saveRes.status === 409) {
                  setHuntLog(prev => [...prev.slice(-200), `⏭️ @${username} already exists`]);
                }
              } catch (err) {
                console.error(`Failed to save candidate ${username}:`, err);
              }
            } else if (data.type === "complete") {
              setHuntLog(prev => [...prev.slice(-200), data.message]);
              setLiveActivity(prev => [...prev.slice(-100), {
                id: activityIdRef.current++,
                candidateId: "",
                candidateName: "Hunt Complete",
                message: `${data.total_searched} searched → ${data.total_viable} viable → ${addedCount} added`,
                timestamp: new Date(),
                icon: "🎉",
              }]);
            } else if (data.type === "error") {
              setHuntLog(prev => [...prev.slice(-200), `Error: ${data.message}`]);
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
    } catch (error) {
      console.error("Hunt error:", error);
      setLiveActivity(prev => [...prev.slice(-100), {
        id: activityIdRef.current++,
        candidateId: "",
        candidateName: "Error",
        message: error instanceof Error ? error.message : "Hunt failed",
        timestamp: new Date(),
        icon: "❌",
      }]);
    } finally {
      setIsHunting(false);
    }
  };

  // Get candidates at this stage OR any later stage (cumulative funnel view)
  const getCandidatesForStage = (stage: PipelineStage) => {
    const stageIndex = STAGE_ORDER.indexOf(stage);
    return candidates.filter(c => {
      const candidateStageIndex = STAGE_ORDER.indexOf(c.stage as PipelineStage);
      return candidateStageIndex >= stageIndex;
    });
  };

  // Get cumulative count - candidates at this stage OR any later stage (for funnel counts)
  const STAGE_ORDER: PipelineStage[] = ["discovery", "research", "ranking", "outreach", "screening", "review"];
  const getCumulativeCount = (stage: PipelineStage) => {
    const stageIndex = STAGE_ORDER.indexOf(stage);
    return candidates.filter(c => {
      const candidateStageIndex = STAGE_ORDER.indexOf(c.stage as PipelineStage);
      return candidateStageIndex >= stageIndex;
    }).length;
  };

  const hasActiveResearch = liveResearchProgress.size > 0 || isHunting || rankingCandidates.size > 0;
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
        <div className="modal-backdrop" onClick={() => { if (!isSavingJob && !isParsingUrl) { setShowJobForm(false); resetJobForm(); } }}>
          <div className="modal-card job-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">New Job</div>
                <div className="modal-subtitle">Add a role to start hunting</div>
              </div>
              <button 
                className="modal-close" 
                onClick={() => { if (!isSavingJob && !isParsingUrl) { setShowJobForm(false); resetJobForm(); } }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {/* Import from URL Section */}
              <div className="url-import-section">
                <label className="modal-field">
                  <span>Import from URL</span>
                  <div className="url-import-row">
                    <input 
                      className="modal-input"
                      type="url"
                      placeholder="Paste job posting URL (e.g., greenhouse.io, lever.co)"
                      value={jobUrlInput}
                      onChange={e => setJobUrlInput(e.target.value)}
                      disabled={isParsingUrl}
                    />
                    <button 
                      className="btn-primary url-import-btn"
                      onClick={parseJobUrl}
                      disabled={isParsingUrl || !jobUrlInput.trim()}
                      type="button"
                    >
                      {isParsingUrl ? "Parsing..." : "Import"}
                    </button>
                  </div>
                </label>
                <div className="url-import-divider">
                  <span>or fill manually</span>
                </div>
              </div>

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
                <button 
                  className="logout-btn"
                  onClick={async () => {
                    await fetch("http://localhost:8080/auth/logout", { 
                      method: "POST", 
                      credentials: "include" 
                    });
                    setXAuthUser(null);
                  }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <a href="http://localhost:8080/authorize" className="auth-btn">
                <span>Login with 𝕏</span>
              </a>
            )}
          </div>
        </header>

        <nav className="pipeline-nav">
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = getCumulativeCount(stage.key);
            const isActive = activeStage === stage.key;
            return (
              <button
                key={stage.key}
                className={`pipeline-stage-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveStage(stage.key)}
              >
                <div className="stage-header">
                  <span className="stage-icon">{stage.icon}</span>
                  <span className="stage-label">{stage.label}</span>
                  {count > 0 && <span className="stage-count">{count}</span>}
                </div>
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
                    Login with X in the header to use Find People
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
                  const isRanking = rankingCandidates.has(candidate.id);
                  const avatarSrc = candidate.xAvatar || candidate.xAvatarUrl;
                  return (
                    <div 
                      key={candidate.id} 
                      className={`candidate-card ${selectedCandidate?.id === candidate.id ? 'selected' : ''} ${isResearching ? 'researching' : ''} ${isRanking ? 'ranking' : ''}`}
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
                      {isRanking && <span className="candidate-spinner" />}
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
            {isHunting && activeStage === "discovery" && stageCandidates.length === 0 && (
              <div className="hunt-log-card" ref={huntLogRef}>
                <div className="hunt-log-header">
                  <div>
                    <h3>Hunt Log</h3>
                    <p>Streaming steps from backend</p>
                  </div>
                  <span className="live-badge">LIVE</span>
                </div>
                <div className="hunt-log-scroll">
                  {huntLog.length === 0 ? (
                    <div className="activity-empty"><p>Awaiting hunt output...</p></div>
                  ) : (
                    huntLog.map((line, idx) => (
                      <div key={`${line}-${idx}`} className="hunt-log-line">
                        <span className="hunt-log-dot">•</span>
                        <span className="hunt-log-text">{line}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
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
                  {/* ==================== DISCOVERY STAGE ==================== */}
                  {activeStage === "discovery" && (
                    <div className="stage-content discovery-detail">
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

                      {/* Actions - only show if candidate is at this stage */}
                      {selectedCandidate.stage === "discovery" && (
                        <div className="stage-actions">
                          <button 
                            className="btn-next-stage to-research"
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
                            <span className="btn-icon">🔬</span>
                            <span>Start Deep Research</span>
                            <span className="btn-arrow">→</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ==================== RESEARCH STAGE ==================== */}
                  {activeStage === "research" && (
                    <div className="stage-content research-stage">
                      {/* Research Progress Cards (live) */}
                      {(isCurrentlyResearching || researchProgress.length > 0) && (
                        <div className={`research-cards ${isCurrentlyResearching ? 'active' : ''}`}>
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
                            {(() => {
                              // Filter steps for this candidate
                              const filtered = researchProgress
                                .filter(step => selectedCandidate && (!step.candidateId || step.candidateId === selectedCandidate.id));
                              
                              // Dedupe: only keep the latest step per type, preserving order of first appearance
                              const typeLastIndex = new Map<string, number>();
                              filtered.forEach((step, idx) => typeLastIndex.set(step.type, idx));
                              
                              return filtered.filter((step, idx) => typeLastIndex.get(step.type) === idx);
                            })().map((step, i, arr) => {
                              const expandedSet = selectedCandidate ? (expandedResearchSteps.get(selectedCandidate.id) || new Set<number>()) : new Set<number>();
                              const isLatest = i === arr.length - 1;
                              const isDone = step.status === "done";
                              const isError = step.status === "error";
                              const hasDetail = !!step.data;
                              const isExpanded = hasDetail && expandedSet.has(step.id);
                              
                              let icon: React.ReactNode = "◆";
                              if (step.type === "avatar") icon = "🖼️";
                              if (step.type === "x") icon = "𝕏";
                              if (step.type === "github") icon = <GitHubIcon size={14} />;
                              if (step.type === "linkedin") icon = "in";
                              if (step.type === "synthesis") icon = "✦";
                              if (step.type === "start") icon = "🚀";
                              
                              return (
                                <div 
                                  key={step.id} 
                                  className={`research-card ${isLatest ? 'latest' : ''} ${isDone ? 'done' : ''} ${isError ? 'error' : ''} ${hasDetail ? 'expandable' : ''}`}
                                  onClick={() => {
                                    if (!hasDetail || !selectedCandidate) return;
                                    setExpandedResearchSteps(prev => {
                                      const next = new Map(prev);
                                      const set = new Set(next.get(selectedCandidate.id) || []);
                                      if (set.has(step.id)) {
                                        set.delete(step.id);
                                      } else {
                                        set.add(step.id);
                                      }
                                      next.set(selectedCandidate.id, set);
                                      return next;
                                    });
                                  }}
                                >
                                  <div className="card-row">
                                    <div className="card-icon">{icon}</div>
                                    <div className="card-content">
                                      <div className="card-title">
                                        {step.message}
                                        {hasDetail && !isExpanded && (
                                          <span className="card-toggle"> ▸ Show output</span>
                                        )}
                                      </div>
                                    </div>
                                    {isLatest && isCurrentlyResearching && !isDone && <div className="card-spinner" />}
                                    {isDone && <div className="card-check">✓</div>}
                                    {isError && <div className="card-error">✗</div>}
                                  </div>
                                  {hasDetail && isExpanded && (
                                    <div className="card-detail open">
                                      {step.data}
                                      <span className="card-toggle">▾ Hide output</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Pending state */}
                      {!selectedCandidate.researchNotes && !isCurrentlyResearching && researchProgress.length === 0 && (
                        <div className="research-pending">
                          <h4>Queued for Research</h4>
                          <p>Will begin automatically</p>
                        </div>
                      )}

                      {/* Research Results */}
                      {selectedCandidate.researchNotes && (
                        <div className="research-results">
                          <div className="results-header">
                            <h4>Research Summary</h4>
                            <div className="source-links">
                              <a href={`https://x.com/${selectedCandidate.x}`} target="_blank" rel="noopener noreferrer">𝕏</a>
                              {selectedCandidate.github && <a href={`https://github.com/${selectedCandidate.github}`} target="_blank" rel="noopener noreferrer"><GitHubIcon size={14} /></a>}
                              {selectedCandidate.linkedin && <a href={selectedCandidate.linkedin} target="_blank" rel="noopener noreferrer">in</a>}
                            </div>
                          </div>
                          <ResearchSummaryCards notes={selectedCandidate.researchNotes} />
                        </div>
                      )}

                      {/* Raw Research Data */}
                      {selectedCandidate.rawResearch && (() => {
                        try {
                          let raw = JSON.parse(selectedCandidate.rawResearch) as { x?: string; github?: string; linkedin?: string; additionalLinks?: string } | string;
                          // Handle double-encoded JSON from older data
                          if (typeof raw === 'string') {
                            raw = JSON.parse(raw);
                          }
                          const hasAnyData = typeof raw === 'object' && (raw.x || raw.github || raw.linkedin || raw.additionalLinks);
                          if (!hasAnyData) return null;
                          const data = raw as { x?: string; github?: string; linkedin?: string; additionalLinks?: string };
                          return (
                            <div className="raw-research-section">
                              <div className="raw-research-header">
                                <h4>Raw Research Data</h4>
                              </div>
                              <div className="raw-research-blocks">
                                {data.x && (
                                  <details className="raw-block">
                                    <summary>
                                      <span className="raw-icon">𝕏</span>
                                      <span>X/Twitter Profile</span>
                                    </summary>
                                    <pre className="raw-content">{data.x}</pre>
                                  </details>
                                )}
                                {data.github && (
                                  <details className="raw-block">
                                    <summary>
                                      <span className="raw-icon"><GitHubIcon size={14} /></span>
                                      <span>GitHub Profile</span>
                                    </summary>
                                    <pre className="raw-content">{data.github}</pre>
                                  </details>
                                )}
                                {data.linkedin && (
                                  <details className="raw-block">
                                    <summary>
                                      <span className="raw-icon">in</span>
                                      <span>LinkedIn Profile</span>
                                    </summary>
                                    <pre className="raw-content">{data.linkedin}</pre>
                                  </details>
                                )}
                                {data.additionalLinks && (
                                  <details className="raw-block">
                                    <summary>
                                      <span className="raw-icon">🔗</span>
                                      <span>Additional Research</span>
                                    </summary>
                                    <pre className="raw-content">{data.additionalLinks}</pre>
                                  </details>
                                )}
                              </div>
                            </div>
                          );
                        } catch (e) {
                          console.error("Failed to parse rawResearch:", e);
                          return null;
                        }
                      })()}

                      {/* Actions - only show if candidate is at this stage */}
                      {selectedCandidate.stage === "research" && selectedCandidate.researchNotes && (
                        <div className="stage-actions">
                          <button 
                            className="btn-next-stage to-ranking"
                            onClick={async () => {
                              await fetch(`/api/candidates/${selectedCandidate.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ stage: "ranking" }),
                              });
                              setCandidates(prev => prev.map(c => 
                                c.id === selectedCandidate.id ? { ...c, stage: "ranking" } : c
                              ));
                              setActiveStage("ranking");
                            }}
                          >
                            <span className="btn-icon">📊</span>
                            <span>Move to Ranking</span>
                            <span className="btn-arrow">→</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ==================== RANKING STAGE ==================== */}
                  {activeStage === "ranking" && (
                    <div className="stage-content ranking-stage">
                      {/* Score Display / Ranking Action */}
                      <div className="ranking-section">
                        {rankingCandidates.has(selectedCandidate.id) ? (
                          <div className="ranking-in-progress">
                            <div className="ranking-spinner-container">
                              <span className="ranking-spinner" />
                            </div>
                            <h4>AI Ranking in Progress</h4>
                            <p>Grok is evaluating this candidate against the job requirements...</p>
                          </div>
                        ) : selectedCandidate.score ? (
                          <div className="ranking-complete">
                            <div className="score-display">
                              <div className={`score-circle ${selectedCandidate.score >= 75 ? 'excellent' : selectedCandidate.score >= 60 ? 'good' : selectedCandidate.score >= 40 ? 'moderate' : 'poor'}`}>
                                <span className="score-number">{selectedCandidate.score}</span>
                                <span className="score-max">/100</span>
                              </div>
                              <div className="score-label">
                                {selectedCandidate.score >= 90 ? "Exceptional Fit" :
                                 selectedCandidate.score >= 75 ? "Strong Fit" :
                                 selectedCandidate.score >= 60 ? "Good Fit" :
                                 selectedCandidate.score >= 40 ? "Moderate Fit" : "Needs Review"}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="ranking-pending">
                            <div className="ranking-icon">📊</div>
                            <h4>Ready for Ranking</h4>
                            <p>This candidate has completed research and is ready to be scored.</p>
                            <button 
                              className="btn-primary"
                              onClick={() => startRanking(selectedCandidate)}
                              disabled={!selectedCandidate.researchNotes}
                            >
                              🤖 Start AI Ranking
                            </button>
                            {!selectedCandidate.researchNotes && (
                              <p className="ranking-hint">Complete research first to enable ranking</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions - only show if candidate is at this stage */}
                      {selectedCandidate.stage === "ranking" && selectedCandidate.score && (
                        <div className="stage-actions">
                          <button 
                            className="btn-next-stage to-outreach"
                            onClick={async () => {
                              await fetch(`/api/candidates/${selectedCandidate.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ stage: "outreach" }),
                              });
                              setCandidates(prev => prev.map(c => 
                                c.id === selectedCandidate.id ? { ...c, stage: "outreach" } : c
                              ));
                              setActiveStage("outreach");
                            }}
                          >
                            <span className="btn-icon">✉️</span>
                            <span>Move to Outreach</span>
                            <span className="btn-arrow">→</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ==================== OUTREACH STAGE ==================== */}
                  {activeStage === "outreach" && (
                    <div className="stage-content outreach-stage">
                      {/* Score Badge */}
                      {selectedCandidate.score && (
                        <div className="score-badge-row">
                          <div className={`score-badge ${selectedCandidate.score >= 75 ? 'excellent' : selectedCandidate.score >= 60 ? 'good' : 'moderate'}`}>
                            Score: {selectedCandidate.score}/100
                          </div>
                        </div>
                      )}

                      {/* Outreach Section */}
                      <div className="outreach-section">
                        {/* Already sent */}
                        {selectedCandidate.dmSentAt ? (
                          <div className="dm-sent-section">
                            <div className="dm-sent-header">
                              <span className="dm-sent-icon">✅</span>
                              <div>
                                <h4>DM Sent</h4>
                                <p className="dm-sent-time">
                                  Sent {new Date(selectedCandidate.dmSentAt).toLocaleDateString()} at {new Date(selectedCandidate.dmSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            {selectedCandidate.dmContent && (
                              <div className="dm-preview sent">
                                <label>Message Sent</label>
                                <div className="dm-content">{selectedCandidate.dmContent}</div>
                              </div>
                            )}
                          </div>
                        ) : selectedCandidate.dmContent ? (
                          /* DM generated but not sent */
                          <div className="dm-ready-section">
                            <div className="dm-ready-header">
                              <span className="dm-ready-icon">📝</span>
                              <div>
                                <h4>DM Ready to Send</h4>
                                <p>Review and send the personalized message</p>
                              </div>
                            </div>
                            <div className="dm-preview">
                              <label>Generated Message</label>
                              <div className="dm-content">{selectedCandidate.dmContent}</div>
                            </div>
                            <div className="dm-actions">
                              <button 
                                className="btn-ghost"
                                onClick={() => generateDM(selectedCandidate)}
                                disabled={generatingDM.has(selectedCandidate.id)}
                              >
                                {generatingDM.has(selectedCandidate.id) ? "Regenerating..." : "🔄 Regenerate"}
                              </button>
                              <button 
                                className="btn-primary dm-send-btn"
                                onClick={() => sendDM(selectedCandidate)}
                                disabled={sendingDM.has(selectedCandidate.id) || !xAuthUser}
                              >
                                {sendingDM.has(selectedCandidate.id) ? (
                                  <>
                                    <span className="btn-spinner" />
                                    Sending...
                                  </>
                                ) : (
                                  <>
                                    <span>📤</span>
                                    Send DM on X
                                  </>
                                )}
                              </button>
                            </div>
                            {!xAuthUser && (
                              <p className="dm-auth-hint">Login with X to send DMs</p>
                            )}
                          </div>
                        ) : generatingDM.has(selectedCandidate.id) ? (
                          /* Currently generating */
                          <div className="dm-generating-section">
                            <div className="dm-generating-spinner" />
                            <h4>Generating Personalized DM</h4>
                            <p>AI is crafting a message based on research...</p>
                          </div>
                        ) : (
                          /* No DM yet - show generate button */
                          <div className="dm-empty-section">
                            <div className="dm-empty-icon">✉️</div>
                            <h4>Personalized Outreach</h4>
                            <p>Generate an AI-powered DM based on candidate research</p>
                            <button 
                              className="btn-primary generate-dm-btn"
                              onClick={() => generateDM(selectedCandidate)}
                              disabled={!xAuthUser}
                            >
                              <span>🤖</span>
                              Generate Personalized DM
                            </button>
                            {!xAuthUser && (
                              <p className="dm-auth-hint">Login with X in the header to use this feature</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions - only show if candidate is at this stage */}
                      {selectedCandidate.stage === "outreach" && (
                        <div className="stage-actions">
                          <button 
                            className="btn-next-stage to-screening"
                            onClick={async () => {
                              await fetch(`/api/candidates/${selectedCandidate.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ stage: "screening" }),
                              });
                              setCandidates(prev => prev.map(c => 
                                c.id === selectedCandidate.id ? { ...c, stage: "screening" } : c
                              ));
                              setActiveStage("screening");
                            }}
                          >
                            <span className="btn-icon">📞</span>
                            <span>Move to Screening</span>
                            <span className="btn-arrow">→</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ==================== SCREENING STAGE ==================== */}
                  {activeStage === "screening" && (
                    <div className="stage-content screening-stage">
                      {/* Score Badges */}
                      <div className="score-badge-row">
                        {selectedCandidate.score && (
                          <div className={`score-badge ${selectedCandidate.score >= 75 ? 'excellent' : selectedCandidate.score >= 60 ? 'good' : 'moderate'}`}>
                            Research: {selectedCandidate.score}/100
                          </div>
                        )}
                        {selectedCandidate.interviewScore && (
                          <div className={`score-badge ${selectedCandidate.interviewScore >= 70 ? 'excellent' : selectedCandidate.interviewScore >= 50 ? 'good' : 'moderate'}`}>
                            Interview: {selectedCandidate.interviewScore}/100
                          </div>
                        )}
                      </div>

                      {/* Interview Status Section */}
                      <div className="screening-section">
                        <div className="mock-icon">📞</div>
                        <h4>AI Phone Screen</h4>
                        
                        {/* Interview Link */}
                        <div className="interview-link-section">
                          <label>Interview Link</label>
                          <div className="interview-link-row">
                            <input 
                              type="text" 
                              readOnly 
                              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/interview/${selectedCandidate.id}`}
                            />
                            <button 
                              className="copy-btn"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/interview/${selectedCandidate.id}`);
                              }}
                            >
                              📋
                            </button>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="interview-status">
                          {selectedCandidate.interviewStatus === "completed" ? (
                            <div className="status-complete">
                              <span className="status-icon">✅</span>
                              <span>Interview Completed</span>
                              <span className="status-score">{selectedCandidate.interviewScore}/100</span>
                            </div>
                          ) : selectedCandidate.interviewStatus === "in_progress" ? (
                            <div className="status-in-progress">
                              <span className="status-icon">⏳</span>
                              <span>Interview In Progress</span>
                            </div>
                          ) : (
                            <div className="status-pending">
                              <span className="status-icon">📩</span>
                              <span>Awaiting Interview</span>
                            </div>
                          )}
                        </div>

                        {/* Feedback if completed */}
                        {selectedCandidate.interviewStatus === "completed" && selectedCandidate.interviewFeedback && (
                          <div className="interview-feedback">
                            <h5>AI Feedback</h5>
                            <p>{selectedCandidate.interviewFeedback}</p>
                          </div>
                        )}

                        {/* Transcript if completed */}
                        {selectedCandidate.interviewStatus === "completed" && selectedCandidate.interviewTranscript && (
                          <details className="interview-transcript">
                            <summary>View Transcript</summary>
                            <div className="transcript-content">
                              {(() => {
                                try {
                                  const messages = JSON.parse(selectedCandidate.interviewTranscript);
                                  return messages.map((msg: { role: string; content: string }, i: number) => (
                                    <div key={i} className={`transcript-msg ${msg.role}`}>
                                      <strong>{msg.role === "assistant" ? "AI" : selectedCandidate.name}:</strong>
                                      <span>{msg.content.replace(/\s*\[\d+\/100\]\s*$/, "")}</span>
                                    </div>
                                  ));
                                } catch {
                                  return <p>Could not load transcript</p>;
                                }
                              })()}
                            </div>
                          </details>
                        )}
                      </div>

                      {/* Actions - only show if candidate is at this stage and interview completed */}
                      {selectedCandidate.stage === "screening" && selectedCandidate.interviewStatus === "completed" && (
                        <div className="stage-actions">
                          <button 
                            className="btn-next-stage to-review"
                            onClick={async () => {
                              await fetch(`/api/candidates/${selectedCandidate.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ stage: "review" }),
                              });
                              setCandidates(prev => prev.map(c => 
                                c.id === selectedCandidate.id ? { ...c, stage: "review" } : c
                              ));
                              setActiveStage("review");
                            }}
                          >
                            <span className="btn-icon">✓</span>
                            <span>Move to Review</span>
                            <span className="btn-arrow">→</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ==================== REVIEW STAGE ==================== */}
                  {activeStage === "review" && (
                    <div className="stage-content review-stage">
                      {/* Score Badges */}
                      <div className="score-badge-row">
                        {selectedCandidate.score && (
                          <div className={`score-badge ${selectedCandidate.score >= 75 ? 'excellent' : selectedCandidate.score >= 60 ? 'good' : 'moderate'}`}>
                            Research: {selectedCandidate.score}/100
                          </div>
                        )}
                        {selectedCandidate.interviewScore && (
                          <div className={`score-badge ${selectedCandidate.interviewScore >= 70 ? 'excellent' : selectedCandidate.interviewScore >= 50 ? 'good' : 'moderate'}`}>
                            Interview: {selectedCandidate.interviewScore}/100
                          </div>
                        )}
                      </div>

                      {/* Review Form or Already Reviewed */}
                      {selectedCandidate.recruiterRating ? (
                        <div className="review-completed">
                          <div className="review-completed-header">
                            <span className="review-icon">✓</span>
                            <h4>Review Submitted</h4>
                          </div>
                          <div className="review-result">
                            <div className="rating-display">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <span 
                                  key={star} 
                                  className={`star ${star <= selectedCandidate.recruiterRating! ? 'filled' : ''}`}
                                >
                                  ★
                                </span>
                              ))}
                              <span className="rating-label">
                                {selectedCandidate.recruiterRating === 5 ? "Strong Yes" :
                                 selectedCandidate.recruiterRating === 4 ? "Yes" :
                                 selectedCandidate.recruiterRating === 3 ? "Maybe" :
                                 selectedCandidate.recruiterRating === 2 ? "No" : "Strong No"}
                              </span>
                            </div>
                            {selectedCandidate.recruiterFeedback && (
                              <div className="feedback-display">
                                <label>Feedback</label>
                                <p>{selectedCandidate.recruiterFeedback}</p>
                              </div>
                            )}
                          </div>
                          
                          {/* RL Rescore Section - Self-Improving AI Demo */}
                          <div className="rescore-section">
                            <div className="rescore-header">
                              <span className="rescore-icon">🧠</span>
                              <div>
                                <h5>AI Self-Improvement</h5>
                                <p className="rescore-subtitle">See how your feedback adjusts AI scoring</p>
                              </div>
                            </div>
                            
                            {rescoreResults.has(selectedCandidate.id) ? (
                              <div className="rescore-result">
                                <div className="score-comparison">
                                  <div className="score-before">
                                    <span className="score-label">Before</span>
                                    <span className="score-value">{rescoreResults.get(selectedCandidate.id)!.oldScore}</span>
                                  </div>
                                  <span className="score-arrow">→</span>
                                  <div className="score-after">
                                    <span className="score-label">After</span>
                                    <span className="score-value">{rescoreResults.get(selectedCandidate.id)!.newScore}</span>
                                  </div>
                                  <div className={`score-diff ${(rescoreResults.get(selectedCandidate.id)!.newScore - rescoreResults.get(selectedCandidate.id)!.oldScore) < 0 ? 'negative' : 'positive'}`}>
                                    {(() => {
                                      const diff = rescoreResults.get(selectedCandidate.id)!.newScore - rescoreResults.get(selectedCandidate.id)!.oldScore;
                                      return diff > 0 ? `+${diff}` : diff;
                                    })()}
                                  </div>
                                </div>
                                {rescoreResults.get(selectedCandidate.id)!.calibrationApplied && (
                                  <div className="calibration-badge">
                                    ✓ Calibration from your feedback applied
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button
                                className="rescore-btn"
                                onClick={() => rescoreCandidate(selectedCandidate)}
                                disabled={rescoring.has(selectedCandidate.id)}
                              >
                                {rescoring.has(selectedCandidate.id) ? (
                                  <>
                                    <span className="rescore-spinner" />
                                    Rescoring...
                                  </>
                                ) : (
                                  <>
                                    🔄 Rescore with Feedback
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="review-form">
                          <h4>Rate this candidate</h4>
                          <p className="review-subtitle">Your feedback helps improve AI scoring accuracy</p>
                          
                          <div className="rating-selector">
                            {[
                              { value: 1, label: "Strong No", emoji: "👎" },
                              { value: 2, label: "No", emoji: "😕" },
                              { value: 3, label: "Maybe", emoji: "🤔" },
                              { value: 4, label: "Yes", emoji: "👍" },
                              { value: 5, label: "Strong Yes", emoji: "🔥" },
                            ].map((option) => (
                              <button
                                key={option.value}
                                className={`rating-option ${(selectedCandidate as Candidate & { _pendingRating?: number })._pendingRating === option.value ? 'selected' : ''}`}
                                onClick={() => {
                                  setCandidates(prev => prev.map(c => 
                                    c.id === selectedCandidate.id 
                                      ? { ...c, _pendingRating: option.value } as Candidate & { _pendingRating: number }
                                      : c
                                  ));
                                  setSelectedCandidate({ ...selectedCandidate, _pendingRating: option.value } as Candidate & { _pendingRating: number });
                                }}
                              >
                                <span className="rating-emoji">{option.emoji}</span>
                                <span className="rating-value">{option.value}</span>
                                <span className="rating-text">{option.label}</span>
                              </button>
                            ))}
                          </div>

                          <div className="feedback-input">
                            <label>Feedback (optional)</label>
                            <textarea
                              placeholder="Why did you rate them this way? This helps improve the AI..."
                              value={(selectedCandidate as Candidate & { _pendingFeedback?: string })._pendingFeedback || ""}
                              onChange={(e) => {
                                setCandidates(prev => prev.map(c => 
                                  c.id === selectedCandidate.id 
                                    ? { ...c, _pendingFeedback: e.target.value } as Candidate & { _pendingFeedback: string }
                                    : c
                                ));
                                setSelectedCandidate({ ...selectedCandidate, _pendingFeedback: e.target.value } as Candidate & { _pendingFeedback: string });
                              }}
                            />
                          </div>

                          <button
                            className="submit-review-btn"
                            disabled={!(selectedCandidate as Candidate & { _pendingRating?: number })._pendingRating}
                            onClick={async () => {
                              const pendingRating = (selectedCandidate as Candidate & { _pendingRating?: number })._pendingRating;
                              const pendingFeedback = (selectedCandidate as Candidate & { _pendingFeedback?: string })._pendingFeedback;
                              
                              if (!pendingRating) return;

                              const res = await fetch("/api/review", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  candidateId: selectedCandidate.id,
                                  rating: pendingRating,
                                  feedback: pendingFeedback || null,
                                }),
                              });

                              if (res.ok) {
                                const data = await res.json();
                                // Update local state
                                setCandidates(prev => prev.map(c => 
                                  c.id === selectedCandidate.id 
                                    ? { 
                                        ...c, 
                                        recruiterRating: pendingRating,
                                        recruiterFeedback: pendingFeedback || null,
                                        recruiterReviewedAt: new Date().toISOString(),
                                      }
                                    : c
                                ));
                                setSelectedCandidate({
                                  ...selectedCandidate,
                                  recruiterRating: pendingRating,
                                  recruiterFeedback: pendingFeedback || null,
                                  recruiterReviewedAt: new Date().toISOString(),
                                });
                              }
                            }}
                          >
                            Submit Review
                          </button>
                        </div>
                      )}
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
