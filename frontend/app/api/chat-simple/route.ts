import { createXai } from "@ai-sdk/xai";
import { streamText } from "ai";

const xai = createXai({
  apiKey: process.env.XAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages, candidate, currentScore = 30 } = await req.json();

    console.log("[SIMPLE CHAT] Messages:", messages.length, "Score:", currentScore);

    // Simple system prompt
    const system = `You are an xAI recruiter interviewing ${candidate?.name || "a candidate"}.
Be direct, lowercase, challenging. Current score: ${currentScore}/100.

When starting (message is "START_INTERVIEW"):
Say: "hey [name], i've stalked your profiles. you start at 30, need 70 to pass. drop below 10 and we're done. [ask specific technical question based on their background]"

After each response, add on a new line:
[SCORE: newScore, adjustment, reason]

Example: [SCORE: 45, +15, solid technical answer]`;

    const processedMessages = messages[0]?.content === "START_INTERVIEW"
      ? [{ role: "user", content: "Start the interview" }]
      : messages;

    const result = streamText({
      model: xai("grok-beta"),
      messages: processedMessages,
      system,
      temperature: 0.7,
    });

    // For plain text streaming without the "0:" format
    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[SIMPLE CHAT] Error:", error);
    return new Response("Error", { status: 500 });
  }
}