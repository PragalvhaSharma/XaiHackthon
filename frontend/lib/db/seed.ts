import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { jobs, candidates } from "./schema";
import path from "path";

const dbPath = path.join(__dirname, "..", "..", "..", "data", "recruiter.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

const JOBS_DATA = [
  { 
    id: "swe-ai", 
    title: "Software Engineer, AI Infrastructure", 
    team: "Engineering", 
    location: "San Francisco", 
    type: "Full-time",
    description: "We're looking for a Software Engineer to join our AI Infrastructure team. You'll build and scale the systems that power our AI models, including distributed training pipelines, GPU cluster management, and model serving infrastructure. Ideal candidates have experience with Python, CUDA, PyTorch, Kubernetes, and large-scale distributed systems. Experience with ML training at scale is a plus."
  },
  { 
    id: "swe-platform", 
    title: "Software Engineer, Platform", 
    team: "Engineering", 
    location: "Remote", 
    type: "Full-time",
    description: "Join our Platform team to build the foundational services that power our products. You'll work on APIs, developer tools, authentication systems, and internal tooling. We're looking for engineers with strong fundamentals in system design, experience with TypeScript/Go, and a passion for developer experience."
  },
  { 
    id: "ml-research", 
    title: "Machine Learning Researcher", 
    team: "Research", 
    location: "San Francisco", 
    type: "Full-time",
    description: "We're seeking ML Researchers to push the boundaries of AI capabilities. You'll work on novel architectures, training techniques, and evaluation methods. Ideal candidates have a PhD or equivalent research experience, publications at top venues (NeurIPS, ICML, ICLR), and hands-on experience training large language models."
  },
  { 
    id: "pm-ai", 
    title: "Product Manager, AI Products", 
    team: "Product", 
    location: "San Francisco", 
    type: "Full-time",
    description: "Lead product strategy for our AI products. You'll work closely with engineering and research to define roadmaps, prioritize features, and ship products that delight users. Looking for PMs with technical background, experience with AI/ML products, and strong product sense."
  },
  { 
    id: "gtm-enterprise", 
    title: "Enterprise Account Executive", 
    team: "Sales", 
    location: "New York", 
    type: "Full-time",
    description: "Drive enterprise sales for our AI platform. You'll manage complex sales cycles with Fortune 500 companies, build relationships with C-level executives, and close large deals. Looking for AEs with 5+ years of enterprise SaaS sales experience and a track record of exceeding quota."
  },
];

// No seed candidates - use Find People to discover candidates
const CANDIDATES_DATA: Array<{
  id: string;
  jobId: string;
  name: string;
  x: string;
  stage: string;
  researchStatus: string;
  score?: number;
  researchNotes?: string;
}> = [];

async function seed() {
  console.log("🌱 Seeding database...");

  // Get existing candidates with research to preserve
  const existingResearched = db.select().from(candidates).all()
    .filter(c => c.researchNotes || c.researchStatus === "done" || c.researchStatus === "running");
  
  console.log(`📦 Preserving ${existingResearched.length} researched candidates`);

  db.delete(candidates).run();
  db.delete(jobs).run();

  for (const job of JOBS_DATA) {
    db.insert(jobs).values({ ...job, createdAt: new Date() }).run();
  }
  console.log(`✓ Inserted ${JOBS_DATA.length} jobs`);

  // Insert seed candidates, but skip if we have preserved research for them
  const preservedIds = new Set(existingResearched.map(c => c.id));
  const preservedHandles = new Set(existingResearched.map(c => c.x));
  
  for (const candidate of CANDIDATES_DATA) {
    // Check if we should use preserved data instead
    const preserved = existingResearched.find(e => e.x === candidate.x);
    if (preserved) {
      db.insert(candidates).values(preserved).run();
      console.log(`  ↪ Restored ${preserved.name} with existing research`);
    } else {
      db.insert(candidates).values({
        ...candidate,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).run();
    }
  }
  console.log(`✓ Inserted ${CANDIDATES_DATA.length} candidates`);

  console.log("✅ Database seeded!");
  sqlite.close();
}

seed().catch(console.error);
