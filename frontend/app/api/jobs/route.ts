import { db, jobs } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const slugify = (value: string) => {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);

  return base || `job-${Date.now()}`;
};

export async function GET() {
  try {
    const result = db.select().from(jobs).all();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, team, location, type } = body;

    if (!title || !team || !location || !type || !description) {
      return NextResponse.json(
        { error: "Title, team, location, type, and description are required" },
        { status: 400 }
      );
    }

    const baseId = slugify(title);
    const existing = db.select().from(jobs).where(eq(jobs.id, baseId)).get();
    const id = existing ? `${baseId}-${Date.now().toString(36)}` : baseId;

    const newJob = {
      id,
      title: title.trim(),
      description: description.trim(),
      team: team.trim(),
      location: location.trim(),
      type: type.trim(),
      createdAt: new Date(),
    };

    db.insert(jobs).values(newJob).run();

    return NextResponse.json(newJob, { status: 201 });
  } catch (error) {
    console.error("Failed to create job:", error);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

