#!/usr/bin/env node
/**
 * metrics-export.ts — dump the SQLite metrics DB to a single JSON file.
 *
 * Companion to scripts/metrics-report.ts. Same `aggregates` shape as
 * `metrics-report.ts --format json` (so downstream consumers can read
 * either source identically), PLUS the raw rows for each of the three
 * tables. Suitable for:
 *   - CI artifact upload (one file, deterministic shape)
 *   - Future web dashboard ingestion (no DB needed at read time)
 *   - Cross-machine sharing (DB is local + machine-specific)
 *
 * Usage:
 *   npx tsx scripts/metrics-export.ts [--db <path>] [--out <path>]
 *
 * Defaults: --db outputs/.metrics.db, --out outputs/.metrics.json.
 *
 * Strict TS, no any. Aggregates calculation deliberately mirrors
 * metrics-report.ts:buildReport (same SQL, same JS aggregation) — if the
 * report shape changes, both files must change together. See test loop in
 * the self-test for the round-trip check.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { MetricsDB, normalizeSourceFramework, type QueryRow, type SourceFramework } from "./metrics.js";

interface CliArgs {
  db: string;
  out: string;
}

interface MigrationExport {
  id: number;
  created_at: number;
  input_basename: string;
  source_framework: string;
  subtractive: number;
  aggregate_confidence: number;
  selector_quality_score: number;
  web_first_rate: number;
  plan_confidence_aggregate: number;
  smell_removal_rate: number;
  forbidden_absence: number;
  commit_sha: string;
}

interface PlanExport {
  id: number;
  created_at: number;
  input_basename: string;
  source_framework: string;
  subtractive: number;
  locator_count: number;
  pin_count: number;
  scenario_count: number;
  kb_ids_cited: string[];
  commit_sha: string;
}

interface VerificationExport {
  id: number;
  created_at: number;
  input_basename: string;
  verdict: string;
  disagreement_count: number;
  commit_sha: string;
}

interface FrameworkAgg {
  framework: string;
  count: number;
  avgAggregateConfidence: number;
  avgSmellRemovalRate: number;
}

interface KbCitation {
  kbId: string;
  count: number;
}

interface VerdictAgg {
  verdict: string;
  count: number;
  pct: number;
}

interface FrameworkQualityRow {
  framework: SourceFramework;
  migrationCount: number;
  verificationCount: number;
  medianConfidence: number;
  meanConfidence: number;
  shipItRate: number;
  fixFirstRate: number;
  startOverRate: number;
}

interface AggregatesExport {
  summary: {
    totalMigrations: number;
    totalPlans: number;
    totalVerifications: number;
    earliestUnix: number | null;
    latestUnix: number | null;
  };
  perFramework: FrameworkAgg[];
  topKbIds: KbCitation[];
  verdicts: VerdictAgg[];
  /** Sorted DESC by medianConfidence — same shape the dashboard renders. */
  frameworkQuality: FrameworkQualityRow[];
}

interface ExportFile {
  generatedAtUnix: number;
  schemaVersion: 1;
  rows: {
    migrations: MigrationExport[];
    plans: PlanExport[];
    verifications: VerificationExport[];
  };
  aggregates: AggregatesExport;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      db: { type: "string", default: "outputs/.metrics.db" },
      out: { type: "string", default: "outputs/.metrics.json" },
    },
  });
  return {
    db: typeof values.db === "string" ? values.db : "outputs/.metrics.db",
    out: typeof values.out === "string" ? values.out : "outputs/.metrics.json",
  };
}

function num(row: QueryRow, key: string): number {
  const v = row[key];
  return typeof v === "number" ? v : 0;
}

function str(row: QueryRow, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function exportMigrations(db: MetricsDB): MigrationExport[] {
  return db.query(`SELECT * FROM migrations ORDER BY created_at ASC, id ASC`).map((r) => ({
    id: num(r, "id"),
    created_at: num(r, "created_at"),
    input_basename: str(r, "input_basename"),
    source_framework: str(r, "source_framework"),
    subtractive: num(r, "subtractive"),
    aggregate_confidence: num(r, "aggregate_confidence"),
    selector_quality_score: num(r, "selector_quality_score"),
    web_first_rate: num(r, "web_first_rate"),
    plan_confidence_aggregate: num(r, "plan_confidence_aggregate"),
    smell_removal_rate: num(r, "smell_removal_rate"),
    forbidden_absence: num(r, "forbidden_absence"),
    commit_sha: str(r, "commit_sha"),
  }));
}

function exportPlans(db: MetricsDB): PlanExport[] {
  return db.query(`SELECT * FROM plans ORDER BY created_at ASC, id ASC`).map((r) => {
    const kbRaw = str(r, "kb_ids_cited");
    let kbIds: string[] = [];
    if (kbRaw.length > 0) {
      try {
        const parsed = JSON.parse(kbRaw) as unknown;
        if (Array.isArray(parsed)) {
          kbIds = parsed.filter((x): x is string => typeof x === "string");
        }
      } catch {
        // Malformed row — leave empty, mirrors metrics-report behavior.
      }
    }
    return {
      id: num(r, "id"),
      created_at: num(r, "created_at"),
      input_basename: str(r, "input_basename"),
      source_framework: str(r, "source_framework"),
      subtractive: num(r, "subtractive"),
      locator_count: num(r, "locator_count"),
      pin_count: num(r, "pin_count"),
      scenario_count: num(r, "scenario_count"),
      kb_ids_cited: kbIds,
      commit_sha: str(r, "commit_sha"),
    };
  });
}

function exportVerifications(db: MetricsDB): VerificationExport[] {
  return db.query(`SELECT * FROM verifications ORDER BY created_at ASC, id ASC`).map((r) => ({
    id: num(r, "id"),
    created_at: num(r, "created_at"),
    input_basename: str(r, "input_basename"),
    verdict: str(r, "verdict"),
    disagreement_count: num(r, "disagreement_count"),
    commit_sha: str(r, "commit_sha"),
  }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Per-framework quality table — matches dashboard.ts:buildFrameworkQuality.
 * Median confidence (resistant to outliers) sorts the table; SHIP IT rate
 * is the secondary signal for "which framework Migrator handles best".
 * Verdict counts join via input_basename since the verifications table
 * doesn't carry source_framework.
 */
function buildFrameworkQuality(db: MetricsDB): FrameworkQualityRow[] {
  const confRows = db.query(`SELECT source_framework, aggregate_confidence FROM migrations`);
  const confByFw = new Map<SourceFramework, number[]>();
  for (const r of confRows) {
    const fw = normalizeSourceFramework(str(r, "source_framework"));
    const samples = confByFw.get(fw) ?? [];
    samples.push(num(r, "aggregate_confidence"));
    confByFw.set(fw, samples);
  }

  const verdictRows = db.query(
    `SELECT COALESCE(m.source_framework, 'unknown') AS framework,
            v.verdict AS verdict,
            COUNT(*) AS count
     FROM verifications v
     LEFT JOIN migrations m ON m.input_basename = v.input_basename
     GROUP BY framework, verdict`,
  );
  interface Tally { shipIt: number; fixFirst: number; startOver: number }
  const verdictByFw = new Map<SourceFramework, Tally>();
  for (const r of verdictRows) {
    const fw = normalizeSourceFramework(str(r, "framework"));
    const verdict = str(r, "verdict");
    const c = num(r, "count");
    const t = verdictByFw.get(fw) ?? { shipIt: 0, fixFirst: 0, startOver: 0 };
    if (verdict === "SHIP IT") t.shipIt += c;
    else if (verdict === "FIX FIRST") t.fixFirst += c;
    else if (verdict === "START OVER") t.startOver += c;
    verdictByFw.set(fw, t);
  }

  const allFrameworks = new Set<SourceFramework>([...confByFw.keys(), ...verdictByFw.keys()]);
  const rows: FrameworkQualityRow[] = [];
  for (const fw of allFrameworks) {
    const samples = confByFw.get(fw) ?? [];
    const verdicts = verdictByFw.get(fw) ?? { shipIt: 0, fixFirst: 0, startOver: 0 };
    const totalVerdicts = verdicts.shipIt + verdicts.fixFirst + verdicts.startOver;
    const meanConfidence = samples.length === 0
      ? 0
      : samples.reduce((a, b) => a + b, 0) / samples.length;
    rows.push({
      framework: fw,
      migrationCount: samples.length,
      verificationCount: totalVerdicts,
      medianConfidence: median(samples),
      meanConfidence,
      shipItRate: totalVerdicts === 0 ? 0 : verdicts.shipIt / totalVerdicts,
      fixFirstRate: totalVerdicts === 0 ? 0 : verdicts.fixFirst / totalVerdicts,
      startOverRate: totalVerdicts === 0 ? 0 : verdicts.startOver / totalVerdicts,
    });
  }
  return rows.sort((a, b) => b.medianConfidence - a.medianConfidence);
}

function buildAggregates(
  db: MetricsDB,
  plans: PlanExport[],
): AggregatesExport {
  // Mirrors metrics-report.ts:buildReport. Trend-sparkline data is left to
  // the text-report consumer; the JSON export keeps only the cross-cutting
  // aggregates that downstream dashboards typically pivot on.
  const summaryRow = db.query(
    `SELECT
       (SELECT COUNT(*) FROM migrations) AS migrations,
       (SELECT COUNT(*) FROM plans) AS plans,
       (SELECT COUNT(*) FROM verifications) AS verifications,
       (SELECT MIN(created_at) FROM migrations) AS earliest,
       (SELECT MAX(created_at) FROM migrations) AS latest`,
  )[0] ?? {};

  const frameworkRows = db.query(
    `SELECT source_framework, COUNT(*) AS count,
            AVG(aggregate_confidence) AS avg_conf,
            AVG(smell_removal_rate) AS avg_smell
     FROM migrations
     GROUP BY source_framework
     ORDER BY count DESC`,
  );

  const kbCounts = new Map<string, number>();
  for (const plan of plans) {
    for (const kbId of plan.kb_ids_cited) {
      kbCounts.set(kbId, (kbCounts.get(kbId) ?? 0) + 1);
    }
  }
  const topKbIds: KbCitation[] = Array.from(kbCounts.entries())
    .map(([kbId, count]) => ({ kbId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const verdictRows = db.query(
    `SELECT verdict, COUNT(*) AS count FROM verifications GROUP BY verdict`,
  );
  const verdictTotal = verdictRows.reduce((acc, r) => acc + num(r, "count"), 0);
  const verdicts: VerdictAgg[] = verdictRows.map((r) => ({
    verdict: str(r, "verdict"),
    count: num(r, "count"),
    pct: verdictTotal === 0 ? 0 : (num(r, "count") / verdictTotal) * 100,
  }));

  return {
    summary: {
      totalMigrations: num(summaryRow, "migrations"),
      totalPlans: num(summaryRow, "plans"),
      totalVerifications: num(summaryRow, "verifications"),
      earliestUnix: num(summaryRow, "earliest") || null,
      latestUnix: num(summaryRow, "latest") || null,
    },
    perFramework: frameworkRows.map((r) => ({
      framework: normalizeSourceFramework(str(r, "source_framework")),
      count: num(r, "count"),
      avgAggregateConfidence: num(r, "avg_conf"),
      avgSmellRemovalRate: num(r, "avg_smell"),
    })),
    topKbIds,
    verdicts,
    frameworkQuality: buildFrameworkQuality(db),
  };
}

function main(): void {
  const args = parseCliArgs();
  const db = new MetricsDB(args.db);
  try {
    const migrations = exportMigrations(db);
    const plans = exportPlans(db);
    const verifications = exportVerifications(db);
    const aggregates = buildAggregates(db, plans);
    const out: ExportFile = {
      generatedAtUnix: Math.floor(Date.now() / 1000),
      schemaVersion: 1,
      rows: { migrations, plans, verifications },
      aggregates,
    };
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(
      `metrics-export: wrote ${args.out} (` +
        `${migrations.length} migration(s), ` +
        `${plans.length} plan(s), ` +
        `${verifications.length} verification(s))\n`,
    );
  } finally {
    db.close();
  }
}

main();
