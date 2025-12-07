// @ts-nocheck
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { db, candidates, type ResearchProgressStep } from "@/lib/db";
import { eq } from "drizzle-orm";

const runningResearch = new Map<string, boolean>();

function addProgress(candidateId: string, step: Omit<ResearchProgressStep, "id" | "timestamp">) {
  const candidate = db.select().from(candidates).where(eq(candidates.id, candidateId)).get();
  if (!candidate) return;
  
  const progress: ResearchProgressStep[] = candidate.researchProgress 
    ? JSON.parse(candidate.researchProgress) 
    : [];
  
  progress.push({
    ...step,
    id: progress.length,
    timestamp: Date.now(),
  });
  
  db.update(candidates)
    .set({ researchProgress: JSON.stringify(progress), updatedAt: new Date() })
    .where(eq(candidates.id, candidateId))
    .run();
}

export async function runResearchBackground(candidateId: string) {
  if (runningResearch.get(candidateId)) {
    console.log(`[Research] Already running for ${candidateId}`);
    return;
  }
  
  runningResearch.set(candidateId, true);
  
  try {
    const candidate = db.select().from(candidates).where(eq(candidates.id, candidateId)).get();
    if (!candidate) throw new Error("Candidate not found");

    console.log(`[Research BG] Starting for ${candidate.name} (@${candidate.x})`);
    addProgress(candidateId, { type: "start", status: "searching", message: `Starting deep research on @${candidate.x}...` });

    const researchBlocks: string[] = [];
    const rawResearch: { x?: string; github?: string; linkedin?: string } = {};
    let discoveredGithub = candidate.github;
    let discoveredLinkedin = candidate.linkedin;

    // Phase 1: Find GitHub & LinkedIn from X
    addProgress(candidateId, { type: "x", status: "searching", message: `Finding GitHub & LinkedIn for @${candidate.x}...` });
    
    try {
      const profileSearch = await generateText({
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
      });

      const text = profileSearch.text || "";
      const ghMatch = text.match(/GITHUB_USERNAME:\s*([a-zA-Z0-9_-]+)/);
      if (ghMatch?.[1]) {
        discoveredGithub = ghMatch[1];
        addProgress(candidateId, { type: "github", status: "done", message: `Found GitHub: ${discoveredGithub}` });
      }
      const liMatch = text.match(/LINKEDIN_URL:\s*(https?:\/\/[^\s\[\]]+)/);
      if (liMatch?.[1]) {
        discoveredLinkedin = liMatch[1];
        addProgress(candidateId, { type: "linkedin", status: "done", message: `Found LinkedIn` });
      }
    } catch (err) {
      console.error("[Research BG] Profile discovery error:", err);
      addProgress(candidateId, { type: "start", status: "error", message: "Profile discovery failed, continuing..." });
    }

    // Phase 2: X Research
    addProgress(candidateId, { type: "x", status: "searching", message: `Researching X profile @${candidate.x}...` });
    
    try {
      const xResult = await generateText({
        model: xai.responses("grok-4-1-fast-non-reasoning"),
        prompt: `Research the X/Twitter user @${candidate.x}.
Name: ${candidate.name}

Tasks:
1. Search for their recent posts and what they tweet about
2. Look at their bio and any links
3. What do they talk about professionally?

Provide a summary of their X presence.`,
        tools: {
          x_search: xai.tools.xSearch({ allowedXHandles: [candidate.x.replace("@", "")] }),
          web_search: xai.tools.webSearch(),
        },
        maxSteps: 5,
      });

      rawResearch.x = xResult.text;
      researchBlocks.push(`## X Profile (@${candidate.x})\n${xResult.text}`);
      addProgress(candidateId, { type: "x", status: "done", message: `Completed X research` });
    } catch (err) {
      console.error("[Research BG] X error:", err);
      addProgress(candidateId, { type: "x", status: "error", message: "X research failed" });
    }

    // Phase 3: GitHub Research
    if (discoveredGithub) {
      addProgress(candidateId, { type: "github", status: "searching", message: `Researching GitHub: ${discoveredGithub}...` });
      
      try {
        const ghResult = await generateText({
          model: xai.responses("grok-4-1-fast-non-reasoning"),
          prompt: `Research the GitHub user "${discoveredGithub}".
Name: ${candidate.name}

Tasks:
1. Find their GitHub profile
2. Look at pinned repositories and technologies
3. Assess their technical skills from projects

Provide a technical profile.`,
          tools: { web_search: xai.tools.webSearch() },
          maxSteps: 5,
        });

        rawResearch.github = ghResult.text;
        researchBlocks.push(`## GitHub (${discoveredGithub})\n${ghResult.text}`);
        addProgress(candidateId, { type: "github", status: "done", message: `Completed GitHub research` });
      } catch (err) {
        console.error("[Research BG] GitHub error:", err);
        addProgress(candidateId, { type: "github", status: "error", message: "GitHub research failed" });
      }
    }

    // Phase 4: LinkedIn Research
    if (discoveredLinkedin) {
      addProgress(candidateId, { type: "linkedin", status: "searching", message: `Researching LinkedIn...` });
      
      try {
        const liResult = await generateText({
          model: xai.responses("grok-4-1-fast-non-reasoning"),
          prompt: `Research this LinkedIn profile: ${discoveredLinkedin}
Name: ${candidate.name}

Find public info and professional mentions.
Provide a professional summary.`,
          tools: { web_search: xai.tools.webSearch() },
          maxSteps: 4,
        });

        rawResearch.linkedin = liResult.text;
        researchBlocks.push(`## LinkedIn\n${liResult.text}`);
        addProgress(candidateId, { type: "linkedin", status: "done", message: `Completed LinkedIn research` });
      } catch (err) {
        console.error("[Research BG] LinkedIn error:", err);
        addProgress(candidateId, { type: "linkedin", status: "error", message: "LinkedIn research failed" });
      }
    }

    // Phase 5: Synthesis
    addProgress(candidateId, { type: "synthesis", status: "searching", message: `Synthesizing research...` });
    
    let synthesisNotes = researchBlocks.join("\n\n");
    
    if (researchBlocks.length > 0) {
      try {
        const synthesis = await generateText({
          model: xai("grok-4-1-fast-non-reasoning"),
          prompt: `Create a candidate brief for an AI recruiter.

Candidate: ${candidate.name}
Research:
${researchBlocks.join("\n\n")}

Create a brief covering:
1. Background - who they are
2. Technical Skills - what they can do
3. Notable Work - best projects
4. Interests - what they're passionate about
5. Interview Angles - questions to probe

Keep it concise, 3-4 paragraphs.`,
        });
        synthesisNotes = synthesis.text;
      } catch (err) {
        console.error("[Research BG] Synthesis error:", err);
      }
    }

    addProgress(candidateId, { type: "synthesis", status: "done", message: `Research complete!` });

    // Update candidate with results
    db.update(candidates)
      .set({
        researchStatus: "done",
        researchNotes: synthesisNotes,
        rawResearch: JSON.stringify(rawResearch),
        github: discoveredGithub,
        linkedin: discoveredLinkedin,
        stage: "ranking",
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateId))
      .run();

    console.log(`[Research BG] Complete for ${candidate.name}`);
  } catch (err) {
    console.error("[Research BG] Fatal error:", err);
    db.update(candidates)
      .set({ researchStatus: "error", updatedAt: new Date() })
      .where(eq(candidates.id, candidateId))
      .run();
  } finally {
    runningResearch.delete(candidateId);
  }
}

