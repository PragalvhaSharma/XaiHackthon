import { db, candidates, jobs } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

interface BackendCandidate {
  user: {
    id: string;
    username: string;
    name: string;
    description?: string;
    profile_link?: string;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
    };
  };
  found_via_keyword: string;
  tweets: string[];
  evaluation: {
    is_viable: boolean;
    account_type: string;
    reason: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Job ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get job details including description
    const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!job.description) {
      return new Response(JSON.stringify({ error: "Job description is required for hunting" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Send start event
          send({ type: "start", message: "Starting candidate hunt..." });

          // Call the backend hunt endpoint
          send({ type: "progress", message: "Connecting to X API and generating keywords..." });
          
          const response = await fetch(`${BACKEND_URL}/hunt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_desc: job.description }),
          });

          if (!response.ok) {
            const error = await response.json();
            send({ type: "error", message: error.error || "Hunt failed" });
            controller.close();
            return;
          }

          const result = await response.json();
          
          if (!result.success) {
            send({ type: "error", message: result.error || "Hunt failed" });
            controller.close();
            return;
          }

          send({ 
            type: "stats", 
            message: `Searched ${result.total_searched} profiles → ${result.candidates_count} viable candidates`,
            totalSearched: result.total_searched,
            totalViable: result.candidates_count
          });

          // Get existing candidates for this job to avoid duplicates
          const existingCandidates = db.select().from(candidates).where(eq(candidates.jobId, jobId)).all();
          const existingHandles = new Set(existingCandidates.map(c => c.x.toLowerCase()));

          // Stream each candidate to the frontend and add to DB
          const candidateEntries = Object.entries(result.candidates) as [string, BackendCandidate][];
          let addedCount = 0;

          for (const [username, candidateData] of candidateEntries) {
            // Skip if already exists
            if (existingHandles.has(username.toLowerCase())) {
              send({ 
                type: "skip", 
                message: `@${username} already in pipeline`,
                username 
              });
              continue;
            }

            // Create candidate in database
            const id = `hunt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const newCandidate = {
              id,
              name: candidateData.user.name || username,
              x: username,
              jobId,
              stage: "discovery", // Start in discovery, move to research when selected
              researchStatus: "pending",
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            db.insert(candidates).values(newCandidate).run();
            addedCount++;

            // Send the new candidate to the frontend
            send({
              type: "candidate",
              candidate: {
                ...newCandidate,
                evaluation: candidateData.evaluation,
                foundVia: candidateData.found_via_keyword,
                bio: candidateData.user.description,
                followers: candidateData.user.public_metrics?.followers_count,
              },
            });

            // Small delay to make streaming visible
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Send completion event
          send({ 
            type: "complete", 
            message: `Hunt complete! Searched ${result.total_searched} → ${result.candidates_count} viable → ${addedCount} added`,
            totalSearched: result.total_searched,
            totalViable: result.candidates_count,
            added: addedCount,
            skipped: result.candidates_count - addedCount
          });

        } catch (error) {
          console.error("Hunt error:", error);
          send({ 
            type: "error", 
            message: error instanceof Error ? error.message : "An error occurred during hunt" 
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Hunt endpoint error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to start hunt" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
