import { db, candidates } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { runResearchBackground } from "../background";

export async function POST(req: NextRequest) {
  try {
    const { candidateId } = await req.json();
    
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId required" }, { status: 400 });
    }

    const candidate = db.select().from(candidates).where(eq(candidates.id, candidateId)).get();
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (candidate.researchStatus === "running") {
      return NextResponse.json({ message: "Research already running", status: "running" });
    }

    // Mark as running
    db.update(candidates)
      .set({ 
        researchStatus: "running", 
        researchProgress: JSON.stringify([]),
        updatedAt: new Date() 
      })
      .where(eq(candidates.id, candidateId))
      .run();

    // Start background research (fire and forget)
    runResearchBackground(candidateId).catch(console.error);

    return NextResponse.json({ message: "Research started", status: "running" });
  } catch (error) {
    console.error("Failed to start research:", error);
    return NextResponse.json({ error: "Failed to start research" }, { status: 500 });
  }
}

