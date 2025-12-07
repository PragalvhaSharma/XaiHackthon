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

    console.log("[INTERVIEW] Sending message:", content);
    console.log("[INTERVIEW] Current score:", scoreRef.current);

    setIsLoading(true);

    try {
      const rawResearch = candidate.rawResearch ? JSON.parse(candidate.rawResearch) : {};

      const messagesToSend = content === "START_INTERVIEW"
        ? [{ role: "user", content }]
        : currentMessages;

      console.log("[INTERVIEW] Calling /api/chat with:", {
        messageCount: messagesToSend.length,
        messages: messagesToSend,
        currentScore: scoreRef.current,
        candidateName: candidate.name
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesToSend,
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

      if (!response.ok) {
        console.error("[INTERVIEW] Response not OK:", response.status, response.statusText);
        throw new Error("Chat failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      let assistantContent = "";
      let extractedScore: number | null = null;
      const decoder = new TextDecoder();

      console.log("[INTERVIEW] Starting to read stream...");

      // Add empty assistant message to stream into
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";

      // AI SDK v5 uses data stream format with "0:" prefix for text
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[INTERVIEW] Stream complete");
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Split by newlines to process each line
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          // Check if it's data stream format or plain text
          if (line.startsWith("0:")) {
            // AI SDK v5 format: "0:text" for text chunks
            try {
              const jsonStr = line.slice(2);
              const text = JSON.parse(jsonStr);
              assistantContent += text;
            } catch (e) {
              console.error("[INTERVIEW] Failed to parse text chunk:", e);
            }
          } else if (line.startsWith("9:")) {
            // Tool call chunk
            console.log("[INTERVIEW] Tool call:", line);
          } else if (line.startsWith("a:")) {
            // Tool result
            try {
              const jsonStr = line.slice(2);
              const toolResults = JSON.parse(jsonStr);
              console.log("[INTERVIEW] Tool results:", toolResults);

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
            } catch (e) {
              console.error("[INTERVIEW] Failed to parse tool result:", e);
            }
          } else {
            // Plain text line - just append it
            assistantContent += line + "\n";
          }

          // Update UI after each line
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent.trim() };
            return updated;
          });
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        console.log("[INTERVIEW] Remaining buffer:", buffer);
        if (buffer.startsWith("0:")) {
          try {
            const jsonStr = buffer.slice(2);
            const text = JSON.parse(jsonStr);
            assistantContent += text;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: assistantContent };
              return updated;
            });
          } catch {}
        }
      }

      // Parse [SCORE: newScore, adjustment, reason] format
      if (extractedScore === null) {
        const scoreMatch = assistantContent.match(/\[SCORE:\s*(\d+),\s*([-+]?\d+),\s*([^\]]+)\]/);
        if (scoreMatch) {
          extractedScore = parseInt(scoreMatch[1], 10);
          const adjustment = parseInt(scoreMatch[2], 10);
          const reason = scoreMatch[3].trim();

          console.log("[INTERVIEW] Parsed score from message:", {
            newScore: extractedScore,
            adjustment,
            reason
          });

          setLastAdjustment(adjustment);
          setCurrentScore(extractedScore);
          scoreRef.current = extractedScore;
          setTimeout(() => setLastAdjustment(null), 2000);
        }
      }

      // Clean the score tag from display
      const cleanedContent = assistantContent.replace(/\[SCORE:[^\]]+\]\s*$/, "").trim();
      if (cleanedContent !== assistantContent) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: cleanedContent };
          return updated;
        });
        assistantContent = cleanedContent;
      }

      // Check for auto-end conditions (but not on START_INTERVIEW)
      if (extractedScore !== null && content !== "START_INTERVIEW") {
        console.log("[INTERVIEW] Checking auto-end conditions:", {
          score: extractedScore,
          isComplete,
          willEnd: extractedScore >= 70 || extractedScore < 10
        });

        if (extractedScore >= 70 && !isComplete) {
          console.log("[INTERVIEW] Auto-ending: Passed with score", extractedScore);
          await completeInterview([...currentMessages, { role: "user", content }, { role: "assistant", content: assistantContent }], extractedScore, "passed");
        } else if (extractedScore < 10 && !isComplete) {
          console.log("[INTERVIEW] Auto-ending: Failed with score", extractedScore);
          await completeInterview([...currentMessages, { role: "user", content }, { role: "assistant", content: assistantContent }], extractedScore, "failed");
        }
      }

    } catch (err) {
      console.error("[INTERVIEW] Chat error:", err);
      console.error("[INTERVIEW] Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Start interview
  const startInterview = async () => {
    console.log("[INTERVIEW] Starting interview...");
    console.log("[INTERVIEW] Candidate:", candidate?.name);

    if (!candidate || isStarted) {
      console.log("[INTERVIEW] Cannot start:", { hasCandidate: !!candidate, isStarted });
      return;
    }

    setIsStarted(true);
    setCurrentScore(30);
    scoreRef.current = 30;

    console.log("[INTERVIEW] Updating candidate status to in_progress...");
    // Update status to in_progress
    await fetch(`/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        interviewStatus: "in_progress",
        interviewStartedAt: new Date().toISOString()
      }),
    });

    console.log("[INTERVIEW] Sending START_INTERVIEW message...");
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

    console.log("[INTERVIEW] Submitting user message:", input);

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    // Pass the NEW messages array that includes the user message
    sendMessage(input, newMessages);
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
                      {msg.content.replace(/\[SCORE:[^\]]+\]\s*$/, "").trim() || (isLoading && i === messages.length - 1 ? "..." : "")}
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
