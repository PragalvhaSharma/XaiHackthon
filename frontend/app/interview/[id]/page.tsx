"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// Grok icon SVG component
const GrokIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.30129 1L10.4513 12.6033L2 23H3.91171L11.3068 13.8733L17.3013 23H22.7013L14.1159 10.7915L22.0513 1H20.1396L13.2604 9.52147L7.70129 1H2.30129ZM4.88171 2.43H6.98171L20.1204 21.57H18.0204L4.88171 2.43Z" fill="currentColor"/>
  </svg>
);

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CandidateData {
  id: string;
  name: string;
  email: string | null;
  x: string;
  xAvatar: string | null;
  xAvatarUrl: string | null;
  github: string | null;
  linkedin: string | null;
  researchNotes: string | null;
  rawResearch: string | null;
  interviewStatus: string | null;
  interviewScore: number | null;
  jobTitle?: string;
}

export default function InterviewPage() {
  const params = useParams();
  const candidateId = params.id as string;

  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentScore, setCurrentScore] = useState(30);
  const [isComplete, setIsComplete] = useState(false);
  const [completionStatus, setCompletionStatus] = useState<"passed" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [lastAdjustment, setLastAdjustment] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef(30);

  // Load candidate data
  useEffect(() => {
    async function loadCandidate() {
      try {
        const res = await fetch(`/api/candidates/${candidateId}`);
        if (!res.ok) throw new Error("Candidate not found");
        const data = await res.json();
        setCandidate(data);

        // Check if interview already completed
        if (data.interviewStatus === "completed") {
          setIsComplete(true);
          setCurrentScore(data.interviewScore || 0);
          scoreRef.current = data.interviewScore || 0;
          setCompletionStatus(data.interviewScore >= 70 ? "passed" : "failed");
          if (data.interviewTranscript) {
            try {
              setMessages(JSON.parse(data.interviewTranscript));
              setIsStarted(true);
            } catch {}
          }
        }
      } catch {
        setError("Could not load interview. Invalid link?");
      }
    }
    loadCandidate();
  }, [candidateId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message to API
  const sendMessage = async (content: string, currentMessages: Message[]) => {
    if (!candidate) return;

    setIsLoading(true);

    try {
      const rawResearch = candidate.rawResearch ? JSON.parse(candidate.rawResearch) : {};
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...currentMessages, { role: "user", content }],
          researchNotes: candidate.researchNotes || "",
          rawResearch,
          candidate: {
            name: candidate.name,
            email: candidate.email || "",
            x: candidate.x,
            github: candidate.github,
            linkedin: candidate.linkedin,
            jobTitle: candidate.jobTitle || "AI/ML Engineer",
          },
          currentScore: scoreRef.current,
        }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      let assistantContent = "";
      let extractedScore: number | null = null;
      const decoder = new TextDecoder();

      // Add empty assistant message to stream into
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process lines from the data stream
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          // AI SDK data stream format: "type:data"
          // 0: = text chunk
          // 9: = tool call
          // a: = tool result
          const colonIndex = line.indexOf(":");
          if (colonIndex === -1) continue;
          
          const prefix = line.substring(0, colonIndex);
          const data = line.substring(colonIndex + 1);
          
          if (prefix === "0") {
            // Text chunk - parse the JSON string
            try {
              const text = JSON.parse(data);
              assistantContent += text;
              
              // Update the last message with streamed content
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            } catch {}
          } else if (prefix === "a") {
            // Tool result - this contains the score update
            try {
              const toolResults = JSON.parse(data);
              // toolResults is an array of results
              for (const result of toolResults) {
                if (result.result && typeof result.result.newScore === "number") {
                  extractedScore = result.result.newScore;
                  const adjustment = result.result.adjustment || (extractedScore - scoreRef.current);
                  
                  setLastAdjustment(adjustment);
                  setCurrentScore(extractedScore);
                  scoreRef.current = extractedScore;
                  
                  setTimeout(() => setLastAdjustment(null), 2000);
                }
              }
            } catch {}
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const colonIndex = buffer.indexOf(":");
        if (colonIndex !== -1) {
          const prefix = buffer.substring(0, colonIndex);
          const data = buffer.substring(colonIndex + 1);
          
          if (prefix === "0") {
            try {
              const text = JSON.parse(data);
              assistantContent += text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            } catch {}
          } else if (prefix === "a") {
            try {
              const toolResults = JSON.parse(data);
              for (const result of toolResults) {
                if (result.result && typeof result.result.newScore === "number") {
                  extractedScore = result.result.newScore;
                  const adjustment = result.result.adjustment || (extractedScore - scoreRef.current);
                  setLastAdjustment(adjustment);
                  setCurrentScore(extractedScore);
                  scoreRef.current = extractedScore;
                  setTimeout(() => setLastAdjustment(null), 2000);
                }
              }
            } catch {}
          }
        }
      }

      // Fallback: also check for [SCORE/100] pattern in text (for backwards compatibility)
      if (extractedScore === null) {
        const scoreMatch = assistantContent.match(/\[(\d+)\/100\]/);
        if (scoreMatch) {
          extractedScore = parseInt(scoreMatch[1], 10);
          const adjustment = extractedScore - scoreRef.current;
          setLastAdjustment(adjustment);
          setCurrentScore(extractedScore);
          scoreRef.current = extractedScore;
          setTimeout(() => setLastAdjustment(null), 2000);
        }
      }
      
      // Clean any score text from display (in case model still outputs it)
      const cleanedContent = assistantContent.replace(/\s*\[\d+\/100\]\s*$/, "").trim();
      if (cleanedContent !== assistantContent) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: cleanedContent };
          return updated;
        });
        assistantContent = cleanedContent;
      }

      // Check for auto-end conditions
      if (extractedScore !== null) {
        if (extractedScore >= 70 && !isComplete) {
          await completeInterview([...currentMessages, { role: "user", content }, { role: "assistant", content: assistantContent }], extractedScore, "passed");
        } else if (extractedScore < 10 && !isComplete) {
          await completeInterview([...currentMessages, { role: "user", content }, { role: "assistant", content: assistantContent }], extractedScore, "failed");
        }
      }

    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Start interview
  const startInterview = async () => {
    if (!candidate || isStarted) return;
    setIsStarted(true);
    setCurrentScore(30);
    scoreRef.current = 30;

    // Update status to in_progress
    await fetch(`/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        interviewStatus: "in_progress",
        interviewStartedAt: new Date().toISOString()
      }),
    });

    // Send START_INTERVIEW to get first message
    await sendMessage("START_INTERVIEW", []);
  };

  // Complete interview
  const completeInterview = async (finalMessages: Message[], finalScore: number, status: "passed" | "failed") => {
    setIsComplete(true);
    setCompletionStatus(status);

    const feedback = status === "passed" 
      ? `Candidate passed with score ${finalScore}/100. Strong performance in the AI screening.`
      : `Interview ended with score ${finalScore}/100.`;

    // Auto-move to review stage after phone screen completes
    await fetch(`/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "review", // Auto-advance to recruiter review
        interviewStatus: "completed",
        interviewScore: finalScore,
        interviewTranscript: JSON.stringify(finalMessages),
        interviewFeedback: feedback,
        interviewCompletedAt: new Date().toISOString(),
      }),
    });
  };

  // Handle submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isComplete) return;
    
    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    
    sendMessage(input, messages);
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Get score color based on value
  const getScoreColor = () => {
    if (currentScore >= 70) return "var(--green)";
    if (currentScore >= 40) return "var(--amber)";
    if (currentScore >= 20) return "var(--text)";
    return "var(--red)";
  };

  if (error) {
    return (
      <div className="interview-container">
        <div className="interview-error">
          <GrokIcon size={48} />
          <h2>Interview Not Found</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="interview-container">
        <div className="interview-loading">
          <div className="loading-spinner"></div>
          <p>Loading interview...</p>
        </div>
      </div>
    );
  }

  const candidateAvatar = candidate.xAvatarUrl || candidate.xAvatar;

  return (
    <div className="interview-container">
      {/* Header */}
      <header className="interview-header">
        <div className="interview-brand">
          <div className="brand-logo">xAI <span>Recruiter</span></div>
        </div>
        {isStarted && (
          <div className="interview-score" style={{ borderColor: getScoreColor() }}>
            <span className="score-label">Score</span>
            <span className="score-value" style={{ color: getScoreColor() }}>
              {currentScore}
              <span className="score-max">/100</span>
            </span>
            {lastAdjustment !== null && (
              <span className={`score-adjustment ${lastAdjustment >= 0 ? "positive" : "negative"}`}>
                {lastAdjustment >= 0 ? "+" : ""}{lastAdjustment}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Main chat area */}
      <main className="interview-main">
        {!isStarted && !isComplete ? (
          <div className="interview-start">
            <div className="start-card">
              <div className="start-avatar">
                {candidateAvatar ? (
                  <img src={candidateAvatar} alt={candidate.name} />
                ) : (
                  <span>{candidate.name.charAt(0)}</span>
                )}
              </div>
              <h1>Hey {candidate.name.split(" ")[0]} 👋</h1>
              <p>You've been invited to a quick AI screening interview for a role at xAI.</p>
              <div className="start-rules">
                <div className="rule">
                  <span className="rule-icon">🎯</span>
                  <div>
                    <strong>Score 70+ to advance</strong>
                    <span>You start at 30 points</span>
                  </div>
                </div>
                <div className="rule">
                  <span className="rule-icon">💀</span>
                  <div>
                    <strong>Drop below 10 = game over</strong>
                    <span>Don&apos;t BS your way through</span>
                  </div>
                </div>
                <div className="rule">
                  <span className="rule-icon">⚡</span>
                  <div>
                    <strong>Be specific & technical</strong>
                    <span>We already researched you</span>
                  </div>
                </div>
              </div>
              <button className="start-button" onClick={startInterview}>
                Start Interview
              </button>
            </div>
          </div>
        ) : (
          <div className="interview-chat">
            <div className="messages">
              {messages.filter(m => m.content !== "START_INTERVIEW" && m.content).map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === "assistant" ? (
                      <GrokIcon size={20} />
                    ) : candidateAvatar ? (
                      <img src={candidateAvatar} alt={candidate.name} />
                    ) : (
                      <span>{candidate.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="message-bubble">
                    <div className="message-content">
                      {msg.content.replace(/\s*\[\d+\/100\]\s*$/, "").trim() || (isLoading && i === messages.length - 1 ? "..." : "")}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && messages.length > 0 && !messages[messages.length - 1]?.content && (
                <div className="message assistant">
                  <div className="message-avatar">
                    <GrokIcon size={20} />
                  </div>
                  <div className="message-bubble">
                    <div className="message-content typing">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              {isComplete && (
                <div className="interview-complete-message">
                  <div className={`complete-badge ${completionStatus}`}>
                    {completionStatus === "passed" ? "🎉 Interview Passed!" : "Interview Ended"}
                  </div>
                  <p>
                    {completionStatus === "passed" 
                      ? "Great job! You scored 70+. The recruiter will be in touch soon."
                      : `Final score: ${currentScore}/100. Thanks for your time.`}
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            {!isComplete && (
              <form className="interview-input" onSubmit={handleSubmit}>
                <div className="input-avatar">
                  {candidateAvatar ? (
                    <img src={candidateAvatar} alt={candidate.name} />
                  ) : (
                    <span>{candidate.name.charAt(0)}</span>
                  )}
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your response..."
                  disabled={isLoading}
                  rows={1}
                />
                <button type="submit" disabled={!input.trim() || isLoading}>
                  {isLoading ? (
                    <div className="btn-loading"></div>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" />
                    </svg>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
