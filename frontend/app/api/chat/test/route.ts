import { createXai } from "@ai-sdk/xai";
import { streamText } from "ai";

const xai = createXai({
  apiKey: process.env.XAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    console.log("[TEST API] Messages:", messages);
    console.log("[TEST API] API Key exists:", !!process.env.XAI_API_KEY);

    const result = streamText({
      model: xai("grok-4-1-fast-non-reasoning"),
      messages,
      temperature: 0.7,
    });

    console.log("[TEST API] Stream created");
    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[TEST API] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}