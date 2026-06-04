/**
 * metrics.ts — local SQLite persistence for PWmodernizer pipeline runs.
 *
 * v1.0 ROADMAP "Metrics dashboard" scaffold. Each Stage 1 (plan), Stage 2
 * (evaluate), and verify pass writes a row to a local file-backed SQLite
 * database. The companion CLI `scripts/metrics-report.ts` reads the DB and
 * prints cross-run trends.
 *
 * Design rationale:
 *   - One DB file (default `outputs/.metrics.db`, gitignored) — no daemon,
 *     no schema migration tooling required for v1; the file is regenerated
 *     locally and treated as ephemeral.
 *   - 3 tables (migrations / plans / verifications) instead of one polymorphic
 *     events table — column shape varies by stage; separate tables keep each
 *     stage's schema explicit and queries simple.
 *   - `kb_ids_cited` stored as a JSON-encoded string column (TEXT) instead of
 *     a normalised join table. v1 reports only need "top-N most-cited" — a
 *     single-pass JSON.parse on the report side is simpler than maintaining
 *     a citations table + foreign keys. If we later need SQL aggregation
 *     across KB-IDs at scale, migrating to a `plan_kb_citations` join table
 *     is a one-shot script.
 *   - WAL journal mode + synchronous=NORMAL for fast bulk writes during a
 *     workflow run; persistence guarantees are loose because the DB is a
 *     reporting cache, not a system of record.
 *
 * No `any` types; strict TS; betterSqlite is synchronous (matches the
 * synchronous file I/O pattern in evaluate.ts).
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Verdict = "SHIP IT" | "FIX FIRST" | "START OVER";

export interface MigrationRow {
  input_basename: string;
  source_framework: string;
  subtractive: boolean;
  aggregate_confidence: number;
  selector_quality_score: number;
  web_first_rate: number;
  plan_confidence_aggregate: number;
  smell_removal_rate: number;
  forbidden_absence: number;
  commit_sha: string;
}

export interface PlanRow {
  input_basename: string;
  source_framework: string;
  subtractive: boolean;
  locator_count: number;
  pin_count: number;
  scenario_count: number;
  kb_ids_cited: string[];
  commit_sha: string;
}

export interface VerificationRow {
  input_basename: string;
  verdict: Verdict;
  disagreement_count: number;
  commit_sha: string;
}

export interface QueryRow {
  [column: string]: string | number | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  input_basename TEXT NOT NULL,
  source_framework TEXT NOT NULL,
  subtractive INTEGER NOT NULL,
  aggregate_confidence REAL NOT NULL,
  selector_quality_score REAL NOT NULL,
  web_first_rate REAL NOT NULL,
  plan_confidence_aggregate REAL NOT NULL,
  smell_removal_rate REAL NOT NULL,
  forbidden_absence REAL NOT NULL,
  commit_sha TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  input_basename TEXT NOT NULL,
  source_framework TEXT NOT NULL,
  subtractive INTEGER NOT NULL,
  locator_count INTEGER NOT NULL,
  pin_count INTEGER NOT NULL,
  scenario_count INTEGER NOT NULL,
  kb_ids_cited TEXT NOT NULL,
  commit_sha TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  input_basename TEXT NOT NULL,
  verdict TEXT NOT NULL,
  disagreement_count INTEGER NOT NULL,
  commit_sha TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_migrations_created_at ON migrations(created_at);
CREATE INDEX IF NOT EXISTS idx_migrations_framework ON migrations(source_framework);
CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at);
CREATE INDEX IF NOT EXISTS idx_verifications_verdict ON verifications(verdict);
`;

export class MetricsDB {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(SCHEMA);
  }

  recordMigration(row: MigrationRow): void {
    const stmt = this.db.prepare(
      `INSERT INTO migrations (
        created_at, input_basename, source_framework, subtractive,
        aggregate_confidence, selector_quality_score, web_first_rate,
        plan_confidence_aggregate, smell_removal_rate, forbidden_absence,
        commit_sha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      nowUnix(),
      row.input_basename,
      row.source_framework,
      row.subtractive ? 1 : 0,
      row.aggregate_confidence,
      row.selector_quality_score,
      row.web_first_rate,
      row.plan_confidence_aggregate,
      row.smell_removal_rate,
      row.forbidden_absence,
      row.commit_sha
    );
  }

  recordPlan(row: PlanRow): void {
    const stmt = this.db.prepare(
      `INSERT INTO plans (
        created_at, input_basename, source_framework, subtractive,
        locator_count, pin_count, scenario_count, kb_ids_cited, commit_sha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      nowUnix(),
      row.input_basename,
      row.source_framework,
      row.subtractive ? 1 : 0,
      row.locator_count,
      row.pin_count,
      row.scenario_count,
      JSON.stringify(row.kb_ids_cited),
      row.commit_sha
    );
  }

  recordVerification(row: VerificationRow): void {
    const stmt = this.db.prepare(
      `INSERT INTO verifications (
        created_at, input_basename, verdict, disagreement_count, commit_sha
      ) VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(
      nowUnix(),
      row.input_basename,
      row.verdict,
      row.disagreement_count,
      row.commit_sha
    );
  }

  /**
   * Read-only query. Returns rows as plain objects keyed by column name.
   * Use only for the report CLI — workflow code should use the typed
   * record* methods above.
   */
  query(sql: string): QueryRow[] {
    const stmt = this.db.prepare(sql);
    // better-sqlite3 .all() returns `unknown[]`; cast through unknown to QueryRow[].
    const rows = stmt.all() as unknown as QueryRow[];
    return rows;
  }

  close(): void {
    this.db.close();
  }
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}
