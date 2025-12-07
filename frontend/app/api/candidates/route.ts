import { db, candidates, jobs } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  
  try {
    const result = jobId 
      ? db.select().from(candidates).where(eq(candidates.jobId, jobId)).all()
      : db.select().from(candidates).all();
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch candidates:", error);
    return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
  }
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("Failed to fetch avatar:", error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      name, x, jobId, email, github, linkedin,
      // Hunt fields
      bio, followers, foundVia, evaluationReason, location, xAvatarUrl
    } = body;

    if (!name || !x) {
      return NextResponse.json({ error: "Name and X handle are required" }, { status: 400 });
    }

    const handle = x.replace("@", "").toLowerCase();

    // Check for duplicates (same X handle for the same job)
    if (jobId) {
      const existing = db.select().from(candidates)
        .where(eq(candidates.jobId, jobId))
        .all()
        .find(c => c.x.toLowerCase() === handle);
      
      if (existing) {
        return NextResponse.json({ error: "Candidate already exists for this job" }, { status: 409 });
      }
    }

    // Fetch avatar if URL provided
    let xAvatar: string | null = null;
    if (xAvatarUrl) {
      xAvatar = await fetchImageAsBase64(xAvatarUrl);
    }

    const id = `hunt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newCandidate = {
      id,
      name,
      x: handle,
      jobId: jobId || null,
      email: email || null,
      github: github || null,
      linkedin: linkedin || null,
      bio: bio || null,
      followers: followers || null,
      foundVia: foundVia || null,
      evaluationReason: evaluationReason || null,
      location: location || null,
      xAvatarUrl: xAvatarUrl || null,
      xAvatar,
      stage: "discovery",
      researchStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.insert(candidates).values(newCandidate).run();
    
    return NextResponse.json(newCandidate, { status: 201 });
  } catch (error) {
    console.error("Failed to create candidate:", error);
    return NextResponse.json({ error: "Failed to create candidate" }, { status: 500 });
  }
}

