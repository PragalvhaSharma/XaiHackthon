// @ts-nocheck
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { z } from "zod";
import { CandidateInput, ResearchResult, ResearchStep } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";

export const maxDuration = 120;

// Cache config
const CACHE_ENABLED = process.env.NODE_ENV === "development";
const CACHE_DIR = path.join(process.cwd(), ".research-cache");

async function getCacheKey(candidate: CandidateInput): Promise<string> {
  const key = `${candidate.email}-${candidate.x || ""}-${candidate.github || ""}`;
  return key.replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function getCachedResearch(candidate: CandidateInput): Promise<ResearchResult | null> {
  if (!CACHE_ENABLED) return null;
  try {
    const cacheKey = await getCacheKey(candidate);
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    const data = await fs.readFile(cachePath, "utf-8");
    console.log("[Research] Using cached data for", candidate.email);
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function setCachedResearch(candidate: CandidateInput, result: ResearchResult): Promise<void> {
  if (!CACHE_ENABLED) return;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cacheKey = await getCacheKey(candidate);
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
    console.log("[Research] Cached results to", cachePath);
  } catch (err) {
    console.error("[Research] Failed to cache:", err);
  }
}

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")), // Allow empty string
  linkedin: z.string().url().optional().or(z.literal("")),
  x: z.string().min(1), // Required - provided by discovery agent
  github: z.string().optional().or(z.literal("")),
  role: z.string().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  resumeName: z.string().optional(),
});
// X handle is required - provided by the discovery agent that finds profiles

function extractEmailDomain(email: string): string {
  const domain = email.split("@")[1];
  if (!domain) return "";
  const common = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "protonmail.com"];
  return common.includes(domain.toLowerCase()) ? "" : domain;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    const candidate: CandidateInput = {
      ...parsed,
      linkedin: parsed.linkedin || undefined,
    };

    // Check cache first
    const cached = await getCachedResearch(candidate);
    if (cached) {
      const encoder = new TextEncoder();
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      
      // Send quick progress updates for cached data
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "start", message: "Loading cached research..." })}\n\n`));
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "x", status: "done", message: "✓ Loaded from cache" })}\n\n`));
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "github", status: "done", message: "✓ Loaded from cache" })}\n\n`));
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "linkedin", status: "done", message: "✓ Loaded from cache" })}\n\n`));
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "synthesis", status: "done", message: "✓ Research loaded from cache" })}\n\n`));
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "complete", result: cached })}\n\n`));
      await writer.close();
      
      return new Response(stream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const emailDomain = extractEmailDomain(candidate.email);
    const identityContext = [
      candidate.name,
      emailDomain ? `works at ${emailDomain.replace(".com", "").replace(".io", "")}` : null,
      candidate.jobTitle ? `applying for ${candidate.jobTitle}` : null,
    ].filter(Boolean).join(", ");

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendStep = async (step: ResearchStep) => {
      console.log("[Research]", step.type, "status" in step ? step.status : "", step.message || "");
      await writer.write(encoder.encode(`data: ${JSON.stringify(step)}\n\n`));
    };

    (async () => {
      try {
        const researchBlocks: string[] = [];
        const discoveredLinks: string[] = [];
        const rawResearch: { x?: string; github?: string; linkedin?: string; additionalLinks?: string } = {};

        await sendStep({ type: "start", message: `Starting deep research on @${candidate.x}...` });

        // X handle is provided by discovery agent
        // Search for GitHub and LinkedIn using X profile
        await sendStep({ type: "start", message: `🔎 Finding GitHub & LinkedIn for @${candidate.x}...` });
        
        {
          try {
            // Add timeout wrapper
            const profileSearchPromise = generateText({
              model: xai.responses("grok-4-1-fast-non-reasoning"),
              prompt: `Find GitHub and LinkedIn for this person:

Name: ${candidate.name}
X/Twitter: @${candidate.x}

Search their X profile bio and find their other profiles.

Return ONLY in this format:
GITHUB_USERNAME: username
LINKEDIN_URL: url`,
              tools: {
                web_search: xai.tools.webSearch(),
                x_search: xai.tools.xSearch({ allowedXHandles: [candidate.x.replace("@", "")] }),
              },
              maxSteps: 4,
              onStepFinish: async (step) => {
                if (step.toolCalls) {
                  for (const call of step.toolCalls) {
                    const args = call.args ? JSON.stringify(call.args).slice(0, 100) : "{}";
                    const name = call.toolName || "tool";
                    console.log(`[Profile Search] ${name}: ${args}`);
                    await sendStep({ type: "start", message: `🔍 ${name}: ${args.slice(0, 60)}...` });
                  }
                }
                if (step.text) {
                  console.log(`[Profile Search] Text: ${step.text.slice(0, 200)}`);
                }
              },
            });

            // 30 second timeout
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Profile search timeout")), 30000)
            );

            const profileSearch = await Promise.race([profileSearchPromise, timeoutPromise]) as Awaited<typeof profileSearchPromise>;

            console.log("[Profile Search] Result:", profileSearch.text?.slice(0, 300));

            // Parse results - look for the patterns anywhere in the text
            const text = profileSearch.text || "";
            
            const ghMatch = text.match(/GITHUB_USERNAME:\s*([a-zA-Z0-9_-]+)/);
            if (ghMatch && ghMatch[1]) {
              candidate.github = ghMatch[1];
              console.log("[Research] Found GitHub:", candidate.github);
              await sendStep({ type: "github", status: "done", message: `Found GitHub: ${candidate.github}` });
            }

            const liMatch = text.match(/LINKEDIN_URL:\s*(https?:\/\/[^\s\[\]]+)/);
            if (liMatch && liMatch[1]) {
              candidate.linkedin = liMatch[1];
              console.log("[Research] Found LinkedIn:", candidate.linkedin);
              await sendStep({ type: "linkedin", status: "done", message: `Found LinkedIn` });
            }
          } catch (err) {
            console.error("[Research] Profile search error:", err);
            await sendStep({ type: "start", message: `⚠️ Profile discovery failed, continuing...` });
          }
        }

        // Phase 1: X/Twitter research - look at recent tweets
        if (candidate.x) {
          await sendStep({ 
            type: "x", 
            status: "searching", 
            message: `Searching X for @${candidate.x}...` 
          });

          try {
            console.log("[Research] Starting X search with xai.responses for @" + candidate.x);
            
            const xResult = await generateText({
              model: xai.responses("grok-4-1-fast-non-reasoning"),
              prompt: `Research the X/Twitter user @${candidate.x}.

Identity context: ${identityContext}

Tasks:
1. Search for their recent posts and what they tweet about
2. Look at their bio and any links
3. Note websites, portfolios, or projects they link to
4. What do they talk about professionally?

If you find URLs in their bio or posts, list them at the end:
DISCOVERED_LINKS:
- url1
- url2

Provide a summary of their X presence.`,
              tools: {
                x_search: xai.tools.xSearch({
                  allowedXHandles: [candidate.x.replace("@", "")],
                }),
                web_search: xai.tools.webSearch(),
              },
              maxSteps: 5,
              onStepFinish: async (step) => {
                if (step.toolCalls && step.toolCalls.length > 0) {
                  for (const call of step.toolCalls) {
                    const args = call.args ? JSON.stringify(call.args).slice(0, 200) : "{}";
                    console.log(`[X Research] Tool: ${call.toolName}, Args: ${args}`);
                    await sendStep({
                      type: "x",
                      status: "searching",
                      message: `🔍 ${call.toolName}: ${args.slice(0, 100)}...`,
                    });
                  }
                }
                if (step.toolResults && step.toolResults.length > 0) {
                  for (const result of step.toolResults) {
                    console.log(`[X Research] Result:`, JSON.stringify(result.result).slice(0, 800));
                  }
                }
                if (step.text) {
                  console.log(`[X Research] Text:`, step.text.slice(0, 300));
                }
              },
            });

            console.log("[Research] X search completed, text length:", xResult.text?.length);

            const linkMatch = xResult.text.match(/DISCOVERED_LINKS:\n([\s\S]*?)(?:\n\n|$)/);
            if (linkMatch) {
              const links = linkMatch[1].match(/https?:\/\/[^\s\n]+/g) || [];
              discoveredLinks.push(...links);
            }

            const xData = xResult.text.replace(/DISCOVERED_LINKS:[\s\S]*$/, "").trim();
            rawResearch.x = xData;
            researchBlocks.push(`## X Profile (@${candidate.x})\n${xData}`);
            
            await sendStep({ 
              type: "x", 
              status: "done", 
              message: `Found X profile for @${candidate.x}`,
              data: xData.slice(0, 500)
            });
          } catch (err) {
            console.error("[Research] X search error:", err);
            const msg = err instanceof Error ? err.message : "X search failed";
            await sendStep({ type: "x", status: "error", message: msg });
          }
        }

        // Phase 2: GitHub research
        if (candidate.github) {
          await sendStep({ 
            type: "github", 
            status: "searching", 
            message: `Researching GitHub user ${candidate.github}...` 
          });

          try {
            console.log("[Research] Starting GitHub search for " + candidate.github);
            
            const ghResult = await generateText({
              model: xai.responses("grok-4-1-fast-non-reasoning"),
              prompt: `Research the GitHub user "${candidate.github}".

Identity context: ${identityContext}

Tasks:
1. Find their GitHub profile
2. Read their bio and README profile
3. Look at pinned repositories and technologies
4. Check recent contributions
5. If bio has a website link, visit it
6. Assess their technical skills from projects

If you find URLs, list them:
DISCOVERED_LINKS:
- url1

Provide a technical profile.`,
              tools: {
                web_search: xai.tools.webSearch(),
              },
              maxSteps: 6,
              onStepFinish: async (step) => {
                if (step.toolCalls && step.toolCalls.length > 0) {
                  for (const call of step.toolCalls) {
                    const args = call.args ? JSON.stringify(call.args).slice(0, 200) : "{}";
                    console.log(`[GitHub Research] Tool: ${call.toolName}, Args: ${args}`);
                    await sendStep({
                      type: "github",
                      status: "searching",
                      message: `🔍 ${call.toolName}: ${args.slice(0, 100)}...`,
                    });
                  }
                }
                if (step.toolResults && step.toolResults.length > 0) {
                  for (const result of step.toolResults) {
                    console.log(`[GitHub Research] Result:`, JSON.stringify(result.result).slice(0, 800));
                  }
                }
                if (step.text) {
                  console.log(`[GitHub Research] Text:`, step.text.slice(0, 300));
                }
              },
            });

            console.log("[Research] GitHub search completed, text length:", ghResult.text?.length);

            const linkMatch = ghResult.text.match(/DISCOVERED_LINKS:\n([\s\S]*?)(?:\n\n|$)/);
            if (linkMatch) {
              const links = linkMatch[1].match(/https?:\/\/[^\s\n]+/g) || [];
              discoveredLinks.push(...links);
            }

            const ghData = ghResult.text.replace(/DISCOVERED_LINKS:[\s\S]*$/, "").trim();
            rawResearch.github = ghData;
            researchBlocks.push(`## GitHub Profile (${candidate.github})\n${ghData}`);
            
            await sendStep({ 
              type: "github", 
              status: "done", 
              message: `Found GitHub profile for ${candidate.github}`,
              data: ghData.slice(0, 500)
            });
          } catch (err) {
            console.error("[Research] GitHub search error:", err);
            const msg = err instanceof Error ? err.message : "GitHub research failed";
            await sendStep({ type: "github", status: "error", message: msg });
          }
        }

        // Phase 3: LinkedIn research
        if (candidate.linkedin) {
          await sendStep({ 
            type: "linkedin", 
            status: "searching", 
            message: `Researching LinkedIn profile...` 
          });

          try {
            console.log("[Research] Starting LinkedIn search");
            
            const liResult = await generateText({
              model: xai.responses("grok-4-1-fast-non-reasoning"),
              prompt: `Research this LinkedIn profile: ${candidate.linkedin}

Identity context: ${identityContext}

Tasks:
1. Find public info about this LinkedIn profile
2. Search for "${candidate.name}" + company to find context
3. Look for public articles or posts
4. Find other professional mentions

If you find URLs, list them:
DISCOVERED_LINKS:
- url1

Provide a professional summary.`,
              tools: {
                web_search: xai.tools.webSearch(),
              },
              maxSteps: 4,
              onStepFinish: async (step) => {
                if (step.toolCalls && step.toolCalls.length > 0) {
                  for (const call of step.toolCalls) {
                    const args = call.args ? JSON.stringify(call.args).slice(0, 200) : "{}";
                    console.log(`[LinkedIn Research] Tool: ${call.toolName}, Args: ${args}`);
                    await sendStep({
                      type: "linkedin",
                      status: "searching",
                      message: `🔍 ${call.toolName}: ${args.slice(0, 100)}...`,
                    });
                  }
                }
                if (step.toolResults && step.toolResults.length > 0) {
                  for (const result of step.toolResults) {
                    console.log(`[LinkedIn Research] Result:`, JSON.stringify(result.result).slice(0, 800));
                  }
                }
                if (step.text) {
                  console.log(`[LinkedIn Research] Text:`, step.text.slice(0, 300));
                }
              },
            });

            console.log("[Research] LinkedIn search completed, text length:", liResult.text?.length);

            const linkMatch = liResult.text.match(/DISCOVERED_LINKS:\n([\s\S]*?)(?:\n\n|$)/);
            if (linkMatch) {
              const links = linkMatch[1].match(/https?:\/\/[^\s\n]+/g) || [];
              discoveredLinks.push(...links);
            }

            const liData = liResult.text.replace(/DISCOVERED_LINKS:[\s\S]*$/, "").trim();
            rawResearch.linkedin = liData;
            researchBlocks.push(`## LinkedIn\n${liData}`);
            
            await sendStep({ 
              type: "linkedin", 
              status: "done", 
              message: `Completed LinkedIn research`,
              data: liData.slice(0, 500)
            });
          } catch (err) {
            console.error("[Research] LinkedIn search error:", err);
            const msg = err instanceof Error ? err.message : "LinkedIn research failed";
            await sendStep({ type: "linkedin", status: "error", message: msg });
          }
        }

        // Phase 4: Research discovered links
        const uniqueLinks = [...new Set(discoveredLinks)].filter(
          (url) => !url.includes("linkedin.com") && !url.includes("github.com") && !url.includes("x.com") && !url.includes("twitter.com")
        ).slice(0, 3);

        if (uniqueLinks.length > 0) {
          await sendStep({ 
            type: "synthesis", 
            status: "searching", 
            message: `Researching ${uniqueLinks.length} additional links...` 
          });

          try {
            console.log("[Research] Starting additional links research:", uniqueLinks);
            
            const recursiveResult = await generateText({
              model: xai.responses("grok-4-1-fast-non-reasoning"),
              prompt: `Research these links found in the candidate's profiles:

Candidate: ${identityContext}

Links to visit:
${uniqueLinks.map((url, i) => `${i + 1}. ${url}`).join("\n")}

For each:
- What is this website/project?
- What does it tell us about their skills?
- Notable achievements?

Summarize findings.`,
              tools: {
                web_search: xai.tools.webSearch(),
              },
              maxSteps: 5,
              onStepFinish: async (step) => {
                if (step.toolCalls && step.toolCalls.length > 0) {
                  for (const call of step.toolCalls) {
                    const args = call.args ? JSON.stringify(call.args).slice(0, 200) : "{}";
                    console.log(`[Recursive Research] Tool: ${call.toolName}, Args: ${args}`);
                    await sendStep({
                      type: "synthesis",
                      status: "searching",
                      message: `🔍 Following link: ${args.slice(0, 80)}...`,
                    });
                  }
                }
                if (step.toolResults && step.toolResults.length > 0) {
                  for (const result of step.toolResults) {
                    console.log(`[Recursive Research] Result:`, JSON.stringify(result.result).slice(0, 800));
                  }
                }
                if (step.text) {
                  console.log(`[Recursive Research] Text:`, step.text.slice(0, 300));
                }
              },
            });

            console.log("[Research] Additional links completed, text length:", recursiveResult.text?.length);
            
            rawResearch.additionalLinks = recursiveResult.text;
            researchBlocks.push(`## Additional Research\n${recursiveResult.text}`);
          } catch (err) {
            console.error("[Research] Additional links error:", err);
          }
        }

        // Phase 5: Synthesis
        await sendStep({ 
          type: "synthesis", 
          status: "searching", 
          message: "Synthesizing findings..." 
        });

        let synthesisNotes = researchBlocks.join("\n\n");

        if (researchBlocks.length > 0) {
          try {
            console.log("[Research] Starting synthesis");
            
            const synthesis = await generateText({
              model: xai("grok-4-1-fast-non-reasoning"),
              prompt: `Create a candidate brief for an AI recruiter.

Candidate: ${candidate.name}
Email: ${candidate.email}
Applied for: ${candidate.jobTitle || candidate.role || "unknown"}
Company: ${candidate.company || "xAI"}

Research:
${researchBlocks.join("\n\n")}

Create a brief covering:
1. Background - who they are
2. Technical Skills - what they can do
3. Notable Work - best projects
4. Interests - what they're passionate about
5. Interview Angles - questions to probe

Keep it concise, 3-4 paragraphs. Facts only.`,
            });

            console.log("[Research] Synthesis completed");
            synthesisNotes = synthesis.text;
          } catch (err) {
            console.error("[Research] Synthesis error:", err);
          }
        }

        await sendStep({ type: "synthesis", status: "done", message: "Research complete" });

        const result: ResearchResult = {
          candidate,
          researchNotes: synthesisNotes || "No research data gathered.",
          rawResearch,
          sources: {
            linkedin: candidate.linkedin,
            x: candidate.x,
            github: candidate.github,
            warnings: [],
          },
        };

        // Cache the results for next time
        await setCachedResearch(candidate, result);

        console.log("[Research] Complete. Raw research keys:", Object.keys(rawResearch));
        await sendStep({ type: "complete", result });
        await writer.close();
      } catch (err) {
        console.error("[Research] Fatal error:", err);
        const msg = err instanceof Error ? err.message : "Research failed";
        await sendStep({ type: "error", message: msg });
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[Research] Request error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
