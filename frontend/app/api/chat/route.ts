import { createXai } from "@ai-sdk/xai";
import { streamText, type CoreMessage, tool } from "ai";
import { buildSystemPrompt } from "@/lib/prompts";
import { CandidateInput, ResearchData } from "@/lib/types";
import { z } from "zod";

export const maxDuration = 60;

const xai = createXai({
  apiKey: process.env.XAI_API_KEY,
});

console.log("[CHAT API] XAI_API_KEY loaded:", !!process.env.XAI_API_KEY, "Length:", process.env.XAI_API_KEY?.length);

type ChatBody = {
  messages: CoreMessage[];
  researchNotes?: string;
  rawResearch?: ResearchData | null;
  candidate?: CandidateInput;
  currentScore?: number;
};

export async function POST(req: Request) {
  const { messages, researchNotes, rawResearch, candidate, currentScore = 30 }: ChatBody = await req.json();

  console.log("[CHAT API] Received request:", {
    messageCount: messages.length,
    lastMessage: messages[messages.length - 1],
    currentScore,
    candidateName: candidate?.name
  });

  const system = buildSystemPrompt(
    researchNotes ?? "",
    rawResearch ?? {},
    candidate ?? { name: "Anonymous", email: "" },
    currentScore
  );

  console.log("[CHAT API] System prompt built, length:", system.length);

  // Check if this is a START_INTERVIEW message and transform it
  const isStartInterview = messages.length === 1 && messages[0].content === "START_INTERVIEW";

  // Transform START_INTERVIEW into a prompt the model understands better
  const processedMessages = isStartInterview
    ? [{ role: "user" as const, content: "Start the interview. Introduce yourself and ask your first technical question based on my background." }]
    : messages;

  const toolChoice = isStartInterview ? "auto" : "required";

  console.log("[CHAT API] Calling xAI with toolChoice:", toolChoice);
  console.log("[CHAT API] Processed messages:", processedMessages);

  // Define tools
  const tools = {
    updateScore: tool({
      description: "Update the candidate's interview score after EVERY response. Score starts at 30, need 70+ to pass, below 10 is auto-fail.",
      parameters: z.object({
        newScore: z.number().min(0).max(100).describe("The updated score (0-100)"),
        adjustment: z.number().describe("How much the score changed (can be negative)"),
        reason: z.string().describe("Brief reason for the score change"),
      }),
    }),
    endInterview: tool({
      description: "End the interview when candidate is uncooperative or clearly unqualified.",
      parameters: z.object({
        reason: z.string().describe("Why ending the interview"),
        finalMessage: z.string().describe("Final message to candidate"),
      }),
    }),
  };

  try {
    console.log("[CHAT API] Creating stream with tools");

    // Create stream with tools
    const result = streamText({
      model: xai("grok-4-1-fast-non-reasoning"),
      system,
      messages: processedMessages,
      temperature: 0.7,
      tools,
      toolChoice: isStartInterview ? "auto" : "required",
      maxSteps: 3, // Allow multiple tool calls
    });

    console.log("[CHAT API] Stream created, returning data stream response");
    // Use toDataStreamResponse() to get the "0:" format with tool calls
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[CHAT API] Error creating stream:", error);
    return new Response(JSON.stringify({
      error: "Failed to create stream",
      details: String(error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
