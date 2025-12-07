"use client";

import { useChat, type Message } from "@ai-sdk/react";
import { FormEvent, useEffect, useMemo, useState, useRef, useCallback } from "react";
import type { CandidateInput, ResearchResult, ResearchStep } from "@/lib/types";

type AppState = "jobs" | "apply" | "research" | "chat";
type ApplyStep = 1 | 2 | 3;

interface Job {
  id: string;
  title: string;
  team: string;
  location: string;
  type: string;
}

const JOBS: Job[] = [
  { id: "swe-ai", title: "Software Engineer, AI Infrastructure", team: "Engineering", location: "San Francisco", type: "Full-time" },
  { id: "swe-platform", title: "Software Engineer, Platform", team: "Engineering", location: "Remote", type: "Full-time" },
  { id: "ml-research", title: "Machine Learning Researcher", team: "Research", location: "San Francisco", type: "Full-time" },
  { id: "pm-ai", title: "Product Manager, AI Products", team: "Product", location: "San Francisco", type: "Full-time" },
  { id: "gtm-enterprise", title: "Enterprise Account Executive", team: "Sales", location: "New York", type: "Full-time" },
];

interface FormData {
  name: string;
  email: string;
  linkedin: string;
  x: string;
  github: string;
  resumeName: string;
}

const emptyForm: FormData = {
  name: "",
  email: "",
  linkedin: "",
  x: "",
  github: "",
  resumeName: "",
};

interface ResearchStepProgress {
  status: "pending" | "searching" | "done" | "error";
  message: string;
  data?: string;
}

interface ResearchProgress {
  x: ResearchStepProgress;
  github: ResearchStepProgress;
  linkedin: ResearchStepProgress;
  synthesis: ResearchStepProgress;
}

interface LiveMessage {
  id: number;
  text: string;
  timestamp: Date;
}

const initialProgress: ResearchProgress = {
  x: { status: "pending", message: "Waiting..." },
  github: { status: "pending", message: "Waiting..." },
  linkedin: { status: "pending", message: "Waiting..." },
  synthesis: { status: "pending", message: "Waiting..." },
};

// DEV MODE - Set to true to skip apply flow and test chat directly
const DEV_MODE = true;
const DEV_DATA = {
  name: "Pranav Karthik",
  email: "",
  linkedin: "", // Will be discovered
  x: "pranavkarthik__", // Required - provided by discovery agent
  github: "", // Will be discovered
  resumeName: "",
};

export default function CareersPage() {
  const [state, setState] = useState<AppState>(DEV_MODE ? "jobs" : "jobs");
  const [selectedJob, setSelectedJob] = useState<Job | null>(DEV_MODE ? JOBS[0] : null);
  const [applyStep, setApplyStep] = useState<ApplyStep>(1);
  const [form, setForm] = useState<FormData>(DEV_MODE ? DEV_DATA : emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress>(initialProgress);
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const liveLogRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);
  
  // Auto-scroll live log
  useEffect(() => {
    if (liveLogRef.current) {
      liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight;
    }
  }, [liveMessages]);

  // DEV: Auto-trigger research on mount
  const devTriggered = useRef(false);
  useEffect(() => {
    if (DEV_MODE && !devTriggered.current && selectedJob) {
      devTriggered.current = true;
      setTimeout(() => {
        submitApplicationDev();
      }, 500);
    }
  }, [selectedJob]);
  
  async function submitApplicationDev() {
    if (!selectedJob) return;
    const payload: CandidateInput = {
      name: DEV_DATA.name,
      email: DEV_DATA.email,
      linkedin: DEV_DATA.linkedin || undefined,
      x: DEV_DATA.x || undefined,
      github: DEV_DATA.github || undefined,
      role: selectedJob.title,
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: "xAI",
      resumeName: DEV_DATA.resumeName || undefined,
    };

    setState("research");
    setLiveMessages([]);
    setResearchProgress({
      x: { status: "pending", message: "Waiting..." },
      github: { status: "pending", message: "Waiting..." },
      linkedin: { status: "pending", message: "Waiting..." },
      synthesis: { status: "pending", message: "Waiting..." },
    });

    const addLiveMessage = (text: string) => {
      setLiveMessages((prev) => [...prev, { id: msgIdRef.current++, text, timestamp: new Date() }]);
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

            // Add to live log
            if (step.type === "start" && step.message) {
              addLiveMessage(step.message);
            } else if ((step.type === "x" || step.type === "github" || step.type === "linkedin" || step.type === "synthesis") && step.message) {
              addLiveMessage(step.message);
            }

            if (step.type === "x" || step.type === "github" || step.type === "linkedin") {
              setResearchProgress((prev) => ({
                ...prev,
                [step.type]: { status: step.status, message: step.message, data: step.data },
              }));
            } else if (step.type === "synthesis") {
              setResearchProgress((prev) => ({
                ...prev,
                synthesis: { status: step.status, message: step.message },
              }));
            } else if (step.type === "complete") {
              addLiveMessage("✅ Research complete!");
              setResearch(step.result);
              setMessages([]);
              setTimeout(() => setState("chat"), 1000);
            } else if (step.type === "error") {
              throw new Error(step.message);
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("jobs");
    }
  }

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, append } = useChat({
    api: "/api/chat",
    body: {
      researchNotes: research?.researchNotes ?? "",
      rawResearch: research?.rawResearch ?? null,
      candidate: research?.candidate ?? null,
    },
  });

  const totalScore = useMemo(() => {
    // Find the last score from any assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        const match = messages[i].content.match(/\[(\d+)\/100\]/);
        if (match) return Number(match[1]);
      }
    }
    return 0;
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Trigger first message when entering chat
  const hasTriggeredFirst = useRef(false);
  useEffect(() => {
    if (state === "chat" && research && messages.length === 0 && !hasTriggeredFirst.current) {
      hasTriggeredFirst.current = true;
      append({ role: "user", content: "START_INTERVIEW" });
    }
  }, [state, research, messages.length, append]);

  function openApply(job: Job) {
    setSelectedJob(job);
    setApplyStep(1);
    setForm(emptyForm);
    setError(null);
    setState("apply");
  }

  function closeApply() {
    setState("jobs");
    setSelectedJob(null);
    setApplyStep(1);
    setForm(emptyForm);
    setError(null);
  }

  function nextStep() {
    setError(null);
    if (applyStep === 1) {
      if (!form.name.trim() || !form.email.trim()) {
        setError("Name and email are required");
        return;
      }
      setApplyStep(2);
    } else if (applyStep === 2) {
      // Social profiles are optional - we'll discover them if not provided
      setApplyStep(3);
    }
  }

  function prevStep() {
    setError(null);
    if (applyStep > 1) setApplyStep((s) => (s - 1) as ApplyStep);
  }

  const runResearch = useCallback(async () => {
    if (!selectedJob) return;

    const payload: CandidateInput = {
      name: form.name,
      email: form.email,
      linkedin: form.linkedin || undefined,
      x: form.x || undefined,
      github: form.github || undefined,
      role: selectedJob.title,
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: "xAI",
      resumeName: form.resumeName || undefined,
    };

    setState("research");
    setLiveMessages([]);
    setResearchProgress({
      x: { status: "pending", message: "Waiting..." },
      github: { status: "pending", message: "Waiting..." },
      linkedin: { status: "pending", message: "Waiting..." },
      synthesis: { status: "pending", message: "Waiting..." },
    });

    const addLiveMessage = (text: string) => {
      setLiveMessages((prev) => [...prev, { id: msgIdRef.current++, text, timestamp: new Date() }]);
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

            // Add to live log
            if (step.type === "start" && step.message) {
              addLiveMessage(step.message);
            } else if ((step.type === "x" || step.type === "github" || step.type === "linkedin" || step.type === "synthesis") && step.message) {
              addLiveMessage(step.message);
            }

            if (step.type === "x" || step.type === "github" || step.type === "linkedin") {
              setResearchProgress((prev) => ({
                ...prev,
                [step.type]: { status: step.status, message: step.message, data: step.data },
              }));
            } else if (step.type === "synthesis") {
              setResearchProgress((prev) => ({
                ...prev,
                synthesis: { status: step.status, message: step.message },
              }));
            } else if (step.type === "complete") {
              addLiveMessage("✅ Research complete!");
              setResearch(step.result);
              setMessages([]);
              setTimeout(() => setState("chat"), 1000);
            } else if (step.type === "error") {
              throw new Error(step.message);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("apply");
    }
  }, [form, selectedJob, setMessages]);

  async function submitApplication() {
    setError(null);
    await runResearch();
  }

  function onChatSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    handleSubmit(e);
  }

  if (state === "research") {
    // Filter out noisy tool call messages, only show meaningful actions
    const meaningfulMessages = liveMessages.filter((msg) => {
      const text = msg.text.toLowerCase();
      // Skip raw tool call messages
      if (text.includes("x_search:") || text.includes("web_search:") || text.includes("tool:")) return false;
      if (text.match(/^\s*:\s*\{\}/)) return false;
      if (text.includes("{}")) return false;
      return true;
    });

    return (
      <div className="research-screen">
        <div className="research-content">
          <div className="research-header">
            <div className="research-spinner" />
            <h2 className="research-title">Deep Research in Progress</h2>
            <p className="research-subtitle">
              AI agent is recursively searching your public profiles
            </p>
          </div>

          <div className="research-actions" ref={liveLogRef}>
            {meaningfulMessages.length === 0 && (
              <div className="action-card pending">
                <div className="action-icon">⏳</div>
                <div className="action-content">
                  <div className="action-title">Initializing</div>
                  <div className="action-detail">Starting research agent...</div>
                </div>
              </div>
            )}
            {meaningfulMessages.map((msg, i) => {
              const isLatest = i === meaningfulMessages.length - 1;
              const isDone = msg.text.includes("Found") || msg.text.includes("✅") || msg.text.includes("complete") || msg.text.includes("Completed");
              const isSearching = msg.text.includes("Searching") || msg.text.includes("Researching") || msg.text.includes("Finding");
              
              let icon = "◆";
              if (msg.text.includes("X") || msg.text.includes("Twitter") || msg.text.includes("@")) icon = "𝕏";
              if (msg.text.includes("GitHub") || msg.text.includes("github")) icon = "◉";
              if (msg.text.includes("LinkedIn") || msg.text.includes("linkedin")) icon = "in";
              if (msg.text.includes("Synthe") || msg.text.includes("complete")) icon = "✦";
              if (msg.text.includes("Following") || msg.text.includes("additional")) icon = "🔗";
              if (msg.text.includes("Starting deep")) icon = "🚀";
              
              return (
                <div 
                  key={msg.id} 
                  className={`action-card ${isLatest ? 'latest' : ''} ${isDone ? 'done' : ''} ${isSearching && isLatest ? 'searching' : ''}`}
                >
                  <div className="action-icon">{icon}</div>
                  <div className="action-content">
                    <div className="action-title">{msg.text.replace(/🔍|🔎|✅|⚠️/g, '').trim()}</div>
                  </div>
                  {isSearching && isLatest && <div className="action-spinner" />}
                  {isDone && <div className="action-check">✓</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (state === "chat") {
    return (
      <div className="chat-screen">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-title">{selectedJob?.title}</div>
            <div className="chat-header-subtitle">xAI Recruiter Interview</div>
          </div>
          <div className="chat-score">
            <div>
              <span className="score-label">Score</span>
              <div className="score-value">{totalScore}</div>
            </div>
            <div className="score-bar">
              <div className="score-fill" style={{ width: `${totalScore}%` }} />
            </div>
          </div>
        </header>

        <div className="chat-body">
          {messages
            .filter((m: Message) => m.content !== "START_INTERVIEW")
            .map((m: Message) => {
              // Strip the score tag from display
              const displayContent = m.content.replace(/\s*\[\d+\/100\]\s*$/, "");
              return (
                <div key={m.id} className={`chat-message ${m.role}`}>
                  <div className="chat-message-sender">
                    {m.role === "user" ? "You" : "Recruiter"}
                  </div>
                  <div className="chat-message-content">{displayContent}</div>
                </div>
              );
          })}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-container">
          <form className="chat-input-wrapper" onSubmit={onChatSubmit}>
            <input
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              placeholder="Type your response..."
              disabled={isLoading}
            />
            <button className="chat-send" type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? "..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-logo">
          xAI <span>Careers</span>
        </div>
      </nav>

      <main className="container">
        <section className="hero">
          <p className="hero-eyebrow">Open Roles</p>
          <h1>Build the future of AI</h1>
          <p className="hero-subtitle">
            We're looking for exceptional people to help us understand the universe.
            Apply below and convince our AI recruiter you're the right fit.
          </p>
        </section>

        <section className="jobs-section">
          <div className="section-header">
            <span className="section-label">All Positions</span>
            <span className="job-count">{JOBS.length} open roles</span>
          </div>

          <div className="job-list">
            {JOBS.map((job) => (
              <div key={job.id} className="job-item" onClick={() => openApply(job)}>
                <div className="job-content">
                  <div className="job-title">{job.title}</div>
                  <div className="job-meta">
                    <span>{job.team}</span>
                    <span>·</span>
                    <span>{job.location}</span>
                    <span>·</span>
                    <span>{job.type}</span>
                  </div>
                </div>
                <div className="job-arrow">→</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {state === "apply" && selectedJob && (
        <div className="modal-overlay" onClick={closeApply}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <h3>{selectedJob.title}</h3>
                <span>{selectedJob.team} · {selectedJob.location}</span>
              </div>
              <button className="modal-close" onClick={closeApply}>×</button>
            </div>

            <div className="modal-body">
              <div className="steps">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`step-dot ${applyStep === s ? "active" : ""} ${applyStep > s ? "completed" : ""}`}
                  />
                ))}
              </div>

              {applyStep === 1 && (
                <>
                  <div className="form-group">
                    <label className="form-label">Full name</label>
                    <input
                      className="form-input"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Ada Lovelace"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      className="form-input"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="ada@example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Resume <span className="optional">(optional)</span>
                    </label>
                    <label className="file-input">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setForm((f) => ({ ...f, resumeName: file?.name ?? "" }));
                        }}
                      />
                      <div className="file-input-text">
                        {form.resumeName ? (
                          <strong>{form.resumeName}</strong>
                        ) : (
                          <>
                            <strong>Click to upload</strong> or drag and drop
                          </>
                        )}
                      </div>
                    </label>
                  </div>
                </>
              )}

              {applyStep === 2 && (
                <>
                  <p className="form-hint" style={{ marginBottom: 20 }}>
                    Add your profiles or we'll find them automatically
                  </p>
                  <div className="form-group">
                    <label className="form-label">
                      LinkedIn URL <span className="optional">(optional)</span>
                    </label>
                    <input
                      className="form-input"
                      value={form.linkedin}
                      onChange={(e) => setForm((f) => ({ ...f, linkedin: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">
                        X handle <span className="optional">(optional)</span>
                      </label>
                      <input
                        className="form-input"
                        value={form.x}
                        onChange={(e) => setForm((f) => ({ ...f, x: e.target.value }))}
                        placeholder="@handle"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        GitHub <span className="optional">(optional)</span>
                      </label>
                      <input
                        className="form-input"
                        value={form.github}
                        onChange={(e) => setForm((f) => ({ ...f, github: e.target.value }))}
                        placeholder="username"
                      />
                    </div>
                  </div>
                </>
              )}

              {applyStep === 3 && (
                <div className="review-list">
                  <div className="review-item">
                    <span className="review-label">Position</span>
                    <span className="review-value">{selectedJob.title}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Name</span>
                    <span className="review-value">{form.name}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Email</span>
                    <span className="review-value">{form.email}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Resume</span>
                    <span className="review-value">{form.resumeName || "Not provided"}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Profiles</span>
                    <span className="review-value">
                      {[form.linkedin, form.x, form.github].filter(Boolean).join(", ") || "None"}
                    </span>
                  </div>
                </div>
              )}

              {error && <p className="form-error">{error}</p>}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={applyStep === 1 ? closeApply : prevStep}>
                {applyStep === 1 ? "Cancel" : "Back"}
              </button>
              {applyStep < 3 ? (
                <button className="btn btn-primary" onClick={nextStep}>
                  Continue
                </button>
              ) : (
                <button className="btn btn-primary" onClick={submitApplication}>
                  Submit Application
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
