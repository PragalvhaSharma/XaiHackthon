import { createXai } from "@ai-sdk/xai";
import { streamText, type CoreMessage } from "ai";
import { buildSystemPrompt } from "@/lib/prompts";
import { CandidateInput, ResearchData } from "@/lib/types";

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
  });

  return result.toTextStreamResponse();
}
