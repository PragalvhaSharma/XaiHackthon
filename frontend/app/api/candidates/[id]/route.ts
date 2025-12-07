import { db, candidates } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = db.select().from(candidates).where(eq(candidates.id, params.id)).get();
    
    if (!result) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch candidate:", error);
    return NextResponse.json({ error: "Failed to fetch candidate" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { stage, score, researchNotes, rawResearch, github, linkedin } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (stage !== undefined) updates.stage = stage;
    if (score !== undefined) updates.score = score;
    if (researchNotes !== undefined) updates.researchNotes = researchNotes;
    if (rawResearch !== undefined) updates.rawResearch = JSON.stringify(rawResearch);
    if (github !== undefined) updates.github = github;
    if (linkedin !== undefined) updates.linkedin = linkedin;

    db.update(candidates).set(updates).where(eq(candidates.id, params.id)).run();
    
    const updated = db.select().from(candidates).where(eq(candidates.id, params.id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update candidate:", error);
    return NextResponse.json({ error: "Failed to update candidate" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    db.delete(candidates).where(eq(candidates.id, params.id)).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete candidate:", error);
    return NextResponse.json({ error: "Failed to delete candidate" }, { status: 500 });
  }
}

