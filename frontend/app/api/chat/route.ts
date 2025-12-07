import { createXai } from "@ai-sdk/xai";
import { streamText, type CoreMessage, tool } from "ai";
import { buildSystemPrompt } from "@/lib/prompts";
import { CandidateInput, ResearchData } from "@/lib/types";
import { z } from "zod";

export const maxDuration = 60;

const xai = createXai({
  apiKey: process.env.XAI_API_KEY,
});

type ChatBody = {
  messages: CoreMessage[];
  researchNotes?: string;
  rawResearch?: ResearchData | null;
  candidate?: CandidateInput;
  currentScore?: number;
};

export async function POST(req: Request) {
  const { messages, researchNotes, rawResearch, candidate, currentScore = 30 }: ChatBody = await req.json();

  const system = buildSystemPrompt(
    researchNotes ?? "",
    rawResearch ?? {},
    candidate ?? { name: "Anonymous", email: "" },
    currentScore
  );

  const result = streamText({
    model: xai("grok-3-fast"),
    system,
    messages,
    temperature: 0.7,
    tools: {
      updateScore: tool({
        description: "Update the candidate's interview score. MUST be called after every response to reflect how well the candidate is doing. Score starts at 30, need 70+ to pass, below 10 is auto-fail.",
        parameters: z.object({
          newScore: z.number().min(0).max(100).describe("The updated score (0-100)"),
          adjustment: z.number().describe("How much the score changed from the previous score (can be negative)"),
          reason: z.string().describe("Brief reason for the score change, e.g. 'great technical depth' or 'vague answer'"),
        }),
        execute: async ({ newScore, adjustment, reason }) => {
          // Tool execution - the score is passed back to the client
          return { newScore, adjustment, reason };
        },
      }),
    },
    toolChoice: "required", // Force the model to always call the tool
  });

  return result.toDataStreamResponse();
}
