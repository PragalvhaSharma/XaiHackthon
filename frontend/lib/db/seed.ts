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

// Funnel: discovery (6) → research (1 real) → ranking (2) → outreach (1) → screening (1) → review (1)
const CANDIDATES_DATA = [
  // === SWE AI Infrastructure ===
  // Discovery (found from X posts, not yet researched)
  { id: "disc-1", jobId: "swe-ai", name: "Kevin Wu", x: "kevinwu_dev", stage: "discovery", researchStatus: "pending" },
  { id: "disc-2", jobId: "swe-ai", name: "Nina Patel", x: "ninapatel_ml", stage: "discovery", researchStatus: "pending" },
  { id: "disc-3", jobId: "swe-ai", name: "Omar Hassan", x: "omarh_codes", stage: "discovery", researchStatus: "pending" },
  { id: "disc-4", jobId: "swe-ai", name: "Lisa Chang", x: "lisachang_ai", stage: "discovery", researchStatus: "pending" },
  { id: "disc-5", jobId: "swe-ai", name: "Ryan Murphy", x: "ryanmurph_", stage: "discovery", researchStatus: "pending" },
  { id: "disc-6", jobId: "swe-ai", name: "Jordan Kim", x: "jordanbuilds", stage: "discovery", researchStatus: "pending" },
  
  // Research - ONLY real candidate that should be researched
  { id: "dev-1", jobId: "swe-ai", name: "Pranav Karthik", x: "pranavkarthik__", stage: "research", researchStatus: "pending" },
  
  // Ranking (already researched - mock data with full notes)
  { id: "rank-1", jobId: "swe-ai", name: "James Park", x: "jamespark_ai", stage: "ranking", score: 68, researchStatus: "done", researchNotes: "**Background.** James Park is a software engineer with 4 years of experience at startups. Based in SF, previously at Stripe working on payment infrastructure.\n\n**Technical Skills.** Strong in Go, Python, and distributed systems. Has built real-time data pipelines and worked with Kafka extensively.\n\n**Notable Work.** Open source contributor to several Go projects. Built a popular CLI tool for API testing with 2k GitHub stars.\n\n**Interests.** Passionate about developer tools and infrastructure. Active in the Go community, speaks at local meetups.\n\n**Interview Angles.** Probe on scaling challenges at Stripe. Ask about his transition from payments to AI infrastructure interest." },
  { id: "rank-2", jobId: "swe-ai", name: "Maya Singh", x: "mayasingh_eng", stage: "ranking", score: 74, researchStatus: "done", researchNotes: "**Background.** Maya Singh is a senior engineer at Meta, working on ML infrastructure for 3 years. Stanford CS graduate.\n\n**Technical Skills.** Expert in PyTorch, CUDA optimization, and large-scale training infrastructure. Published papers on efficient model serving.\n\n**Notable Work.** Led the team that reduced model inference latency by 40% for Instagram recommendations.\n\n**Interests.** Deep interest in making ML more accessible. Mentors underrepresented groups in tech.\n\n**Interview Angles.** Discuss her approach to ML system design. Explore her interest in joining a smaller team vs big tech." },
  
  // Outreach (qualified, DM being sent)
  { id: "out-1", jobId: "swe-ai", name: "Elena Rodriguez", x: "elenaml", stage: "outreach", score: 88, researchStatus: "done", researchNotes: "**Background.** Elena Rodriguez is a founding engineer at an AI startup acquired by Google. 6 years experience in ML infrastructure.\n\n**Technical Skills.** Deep expertise in model training pipelines, Ray, and Kubernetes. Built systems handling petabyte-scale data.\n\n**Notable Work.** Architected the ML platform that powered her startup's core product. Multiple patents in distributed training.\n\n**Interests.** Excited about AGI research and building tools that accelerate AI development.\n\n**Interview Angles.** Understand her startup experience and what she's looking for next. Discuss her views on AI safety." },
  
  // Screening (responded, doing phone screen)
  { id: "screen-1", jobId: "swe-ai", name: "Marcus Johnson", x: "marcusdev", stage: "screening", score: 82, researchStatus: "done", researchNotes: "**Background.** Marcus Johnson is a staff engineer at OpenAI, previously at Google Brain. 8 years in ML systems.\n\n**Technical Skills.** World-class in distributed training, has worked on GPT infrastructure. Expert in CUDA, Triton, and custom kernels.\n\n**Notable Work.** Core contributor to scaling GPT-4 training. Published research on efficient attention mechanisms.\n\n**Interests.** Wants to work on foundational AI infrastructure at a company pushing the frontier.\n\n**Interview Angles.** Deep dive on his specific contributions at OpenAI. Understand his timeline and competing offers." },
  
  // Review (passed screen, recruiter deciding)
  { id: "rev-1", jobId: "swe-ai", name: "Sarah Chen", x: "sarahcodes", stage: "review", score: 91, researchStatus: "done", researchNotes: "**Background.** Sarah Chen is a principal engineer at Anthropic, previously at DeepMind. 10 years in AI infrastructure.\n\n**Technical Skills.** Led teams building training infrastructure for Claude. Expert in everything from low-level CUDA to high-level orchestration.\n\n**Notable Work.** Architected Anthropic's model training platform from scratch. Helped scale from 10 to 100+ engineers.\n\n**Interests.** Deeply passionate about AI safety and wants to work on systems that make AI development more reliable.\n\n**Interview Angles.** Understand her motivation for leaving Anthropic. Discuss comp expectations and start date." },
];

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
