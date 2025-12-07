import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  team: text("team").notNull(),
  location: text("location").notNull(),
  type: text("type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const candidates = sqliteTable("candidates", {
  id: text("id").primaryKey(),
  jobId: text("job_id").references(() => jobs.id),
  name: text("name").notNull(),
  email: text("email"),
  x: text("x").notNull(),
  github: text("github"),
  linkedin: text("linkedin"),
  stage: text("stage").notNull().default("discovery"),
  score: real("score"),
  researchStatus: text("research_status").default("pending"), // pending, running, done, error
  researchProgress: text("research_progress"), // JSON array of progress steps
  researchNotes: text("research_notes"),
  rawResearch: text("raw_research"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;

export interface ResearchProgressStep {
  id: number;
  type: "x" | "github" | "linkedin" | "synthesis" | "start";
  status: "searching" | "done" | "error";
  message: string;
  timestamp: number;
}
