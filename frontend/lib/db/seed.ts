import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { jobs, candidates } from "./schema";
import path from "path";

const dbPath = path.join(__dirname, "..", "..", "..", "data", "recruiter.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

const JOBS_DATA = [
  { id: "swe-ai", title: "Software Engineer, AI Infrastructure", team: "Engineering", location: "San Francisco", type: "Full-time" },
  { id: "swe-platform", title: "Software Engineer, Platform", team: "Engineering", location: "Remote", type: "Full-time" },
  { id: "ml-research", title: "Machine Learning Researcher", team: "Research", location: "San Francisco", type: "Full-time" },
  { id: "pm-ai", title: "Product Manager, AI Products", team: "Product", location: "San Francisco", type: "Full-time" },
  { id: "gtm-enterprise", title: "Enterprise Account Executive", team: "Sales", location: "New York", type: "Full-time" },
];

const CANDIDATES_DATA = [
  // Dev data - Pranav in research stage
  { id: "dev-1", jobId: "swe-ai", name: "Pranav Karthik", x: "pranavkarthik__", stage: "research", researchStatus: "pending" },
  // Mock candidates in various stages
  { id: "mock-1", jobId: "swe-ai", name: "Sarah Chen", x: "sarahcodes", stage: "review", score: 87, researchStatus: "done" },
  { id: "mock-2", jobId: "swe-ai", name: "Marcus Johnson", x: "marcusdev", stage: "screening", score: 72, researchStatus: "done" },
  { id: "mock-3", jobId: "swe-ai", name: "Elena Rodriguez", x: "elenaml", stage: "outreach", score: 91, researchStatus: "done" },
  { id: "mock-4", jobId: "swe-ai", name: "James Park", x: "jamespark_ai", stage: "ranking", score: 68, researchStatus: "done" },
  { id: "mock-5", jobId: "swe-ai", name: "Aisha Patel", x: "aisha_builds", stage: "research", researchStatus: "pending" },
  { id: "mock-6", jobId: "swe-ai", name: "David Kim", x: "davidkimml", stage: "discovery", researchStatus: "pending" },
];

async function seed() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  db.delete(candidates).run();
  db.delete(jobs).run();

  // Insert jobs
  for (const job of JOBS_DATA) {
    db.insert(jobs).values({ ...job, createdAt: new Date() }).run();
  }
  console.log(`✓ Inserted ${JOBS_DATA.length} jobs`);

  // Insert candidates
  for (const candidate of CANDIDATES_DATA) {
    db.insert(candidates).values({
      ...candidate,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();
  }
  console.log(`✓ Inserted ${CANDIDATES_DATA.length} candidates`);

  console.log("✅ Database seeded!");
  sqlite.close();
}

seed().catch(console.error);

