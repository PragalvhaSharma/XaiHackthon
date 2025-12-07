import { db, candidates } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Star to label mapping for reference
const RATING_LABELS: Record<number, string> = {
  1: "Strong No",
  2: "No", 
  3: "Maybe",
  4: "Yes",
  5: "Strong Yes"
};

export async function POST(req: NextRequest) {
  try {
    const { candidateId, rating, feedback } = await req.json();

    if (!candidateId || !rating) {
      return NextResponse.json(
        { error: "candidateId and rating are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Get the candidate to get jobId and current AI score
    const candidate = db.select().from(candidates).where(eq(candidates.id, candidateId)).get();
    
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Update candidate with review
    db.update(candidates).set({
      recruiterRating: rating,
      recruiterFeedback: feedback || null,
      recruiterReviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(candidates.id, candidateId)).run();

    // Call the Python RL feedback system
    // The backend runs on port 8080
    try {
      const rlResponse = await fetch("http://localhost:8080/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          job_id: candidate.jobId || "default",
          ai_score: Math.round(candidate.score || 50), // Use research score as AI score
          recruiter_stars: rating,
        }),
      });

      if (rlResponse.ok) {
        const rlResult = await rlResponse.json();
        console.log("RL feedback processed:", rlResult);
      } else {
        console.warn("RL feedback API returned non-OK status:", rlResponse.status);
      }
    } catch (rlError) {
      // Don't fail the whole request if RL backend is not running
      console.warn("Could not reach RL feedback backend:", rlError);
    }

    // Get updated candidate
    const updated = db.select().from(candidates).where(eq(candidates.id, candidateId)).get();

    return NextResponse.json({
      success: true,
      candidate: updated,
      ratingLabel: RATING_LABELS[rating],
    });
  } catch (error) {
    console.error("Failed to submit review:", error);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
