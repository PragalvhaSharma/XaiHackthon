import { db, jobs } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = db.select().from(jobs).all();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

