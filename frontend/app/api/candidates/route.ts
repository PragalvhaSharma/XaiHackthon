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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, x, jobId, email, github, linkedin } = body;

    if (!name || !x) {
      return NextResponse.json({ error: "Name and X handle are required" }, { status: 400 });
    }

    const id = `candidate-${Date.now()}`;
    const newCandidate = {
      id,
      name,
      x: x.replace("@", ""),
      jobId: jobId || null,
      email: email || null,
      github: github || null,
      linkedin: linkedin || null,
      stage: "research",
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

