import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const dbPath = path.join(process.cwd(), "..", "data", "recruiter.db");
const sqlite = new Database(dbPath);

sqlite.pragma("journal_mode = WAL");

function ensureColumn(table: string, column: string, type: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table});`).all();
  const exists = columns.some((c: any) => c.name === column);
  if (!exists) {
    sqlite.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`).run();
  }
}

// Keep schema backward-compatible when adding new fields.
ensureColumn("candidates", "x_avatar_url", "TEXT");
ensureColumn("candidates", "x_avatar", "TEXT");

export const db = drizzle(sqlite, { schema });

export * from "./schema";

