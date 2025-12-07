import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

/**
 * Get RL policy stats and calibration metrics for a job.
 * This shows how the AI is learning from recruiter feedback.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Fetch policy stats from Python backend
    const response = await fetch(`${BACKEND_URL}/api/policy/${jobId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      // No policy data yet is fine - return empty state
      if (response.status === 404) {
        return NextResponse.json({
          has_data: false,
          policy_stats: null,
          calibration_metrics: null,
        });
      }
      throw new Error("Failed to fetch policy stats");
    }

    const data = await response.json();

    return NextResponse.json({
      has_data: !!data.policy_stats,
      policy_stats: data.policy_stats,
      calibration_metrics: data.calibration_metrics,
    });
  } catch (error) {
    console.error("Policy fetch error:", error);
    // Return empty state on error (backend might not be running)
    return NextResponse.json({
      has_data: false,
      policy_stats: null,
      calibration_metrics: null,
    });
  }
}
