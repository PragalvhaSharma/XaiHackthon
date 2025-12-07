import { db, candidates, jobs } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { candidateId, jobId } = body;

    if (!candidateId || !jobId) {
      return NextResponse.json(
        { error: "candidateId and jobId are required" },
        { status: 400 }
      );
    }

    // Fetch candidate from DB
    const candidateResult = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .get();

    if (!candidateResult) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    // Fetch job from DB
    const jobResult = db.select().from(jobs).where(eq(jobs.id, jobId)).get();

    if (!jobResult) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Build candidate description from available data
    const candidateDescription = buildCandidateDescription(candidateResult);

    // Call backend ranking endpoint
    const response = await fetch(`${BACKEND_URL}/rank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_description: candidateDescription,
        job_requirements: jobResult.description || jobResult.title,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Backend ranking failed");
    }

    const result = await response.json();

    // Update candidate score in DB
    db.update(candidates)
      .set({
        score: result.score,
        stage: "outreach", // Move to next stage after ranking
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateId))
      .run();

    // Fetch updated candidate
    const updatedCandidate = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .get();

    return NextResponse.json({
      success: true,
      score: result.score,
      candidate: updatedCandidate,
    });
  } catch (error) {
    console.error("Ranking failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ranking failed" },
      { status: 500 }
    );
  }
}

function buildCandidateDescription(candidate: {
  name: string;
  x: string;
  bio?: string | null;
  location?: string | null;
  followers?: number | null;
  researchNotes?: string | null;
  evaluationReason?: string | null;
  github?: string | null;
  linkedin?: string | null;
}): string {
  const parts: string[] = [];

  parts.push(`Name: ${candidate.name}`);
  parts.push(`X/Twitter: @${candidate.x}`);

  if (candidate.location) {
    parts.push(`Location: ${candidate.location}`);
  }

  if (candidate.bio) {
    parts.push(`Bio: ${candidate.bio}`);
  }

  if (candidate.followers) {
    parts.push(`Followers: ${candidate.followers.toLocaleString()}`);
  }

  if (candidate.github) {
    parts.push(`GitHub: ${candidate.github}`);
  }

  if (candidate.linkedin) {
    parts.push(`LinkedIn: ${candidate.linkedin}`);
  }

  if (candidate.evaluationReason) {
    parts.push(`Initial Assessment: ${candidate.evaluationReason}`);
  }

  // Include deep research notes if available (most valuable data)
  if (candidate.researchNotes) {
    parts.push(`\nDeep Research:\n${candidate.researchNotes}`);
  }

  return parts.join("\n");
}
