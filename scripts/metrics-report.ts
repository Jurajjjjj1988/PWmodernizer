#!/usr/bin/env node
/**
 * metrics-report.ts — read `outputs/.metrics.db` and print cross-run trends.
 *
 * v1.0 ROADMAP "Metrics dashboard" — text/JSON report, not yet a web UI.
 *
 * Usage:
 *   npx tsx scripts/metrics-report.ts [--db <path>] [--format text|json] [--last N]
 *
 * Sections:
 *   - Summary (counts + date range)
 *   - Per source framework (count, avg confidence, avg smell removal)
 *   - Top KB-IDs cited across plans (top 10)
 *   - Verdict distribution (counts + percentages)
 *   - Confidence trend (Unicode sparkline of last N migrations)
 *
 * Strict TS, no any. Reads `kb_ids_cited` as JSON-encoded TEXT and aggregates
 * in JS — see metrics.ts schema rationale.
 */

import { parseArgs } from "node:util";
import { MetricsDB, normalizeSourceFramework, type QueryRow, type SourceFramework } from "./metrics.js";

interface CliArgs {
  db: string;
  format: "text" | "json";
  last: number | null;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      db: { type: "string", default: "outputs/.metrics.db" },
      format: { type: "string", default: "text" },
      last: { type: "string" },
    },
  });
  const fmt = values.format === "json" ? "json" : "text";
  const lastStr = values.last;
  const last = typeof lastStr === "string" && lastStr.length > 0 ? Number.parseInt(lastStr, 10) : null;
  if (last !== null && (!Number.isFinite(last) || last <= 0)) {
    throw new Error(`--last must be a positive integer, got "${lastStr}"`);
  }
  return {
    db: typeof values.db === "string" ? values.db : "outputs/.metrics.db",
    format: fmt,
    last,
  };
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

interface ReportData {
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
  confidenceTrend: number[];
  /** Sorted DESC by medianConfidence — answers "best/worst framework". */
  frameworkQuality: FrameworkQualityRow[];
}

function num(row: QueryRow, key: string): number {
  const v = row[key];
  return typeof v === "number" ? v : 0;
}

function str(row: QueryRow, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Per-framework quality table — mirrors dashboard.ts and metrics-export.ts.
 * Median confidence (resistant to outliers) sorts the table; SHIP IT rate
 * is the secondary signal. Verdict counts join via input_basename.
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
      medianConfidence: medianOf(samples),
      meanConfidence,
      shipItRate: totalVerdicts === 0 ? 0 : verdicts.shipIt / totalVerdicts,
      fixFirstRate: totalVerdicts === 0 ? 0 : verdicts.fixFirst / totalVerdicts,
      startOverRate: totalVerdicts === 0 ? 0 : verdicts.startOver / totalVerdicts,
    });
  }
  return rows.sort((a, b) => b.medianConfidence - a.medianConfidence);
}

function buildReport(db: MetricsDB, last: number | null): ReportData {
  const summaryRow = db.query(
    `SELECT
       (SELECT COUNT(*) FROM migrations) AS migrations,
       (SELECT COUNT(*) FROM plans) AS plans,
       (SELECT COUNT(*) FROM verifications) AS verifications,
       (SELECT MIN(created_at) FROM migrations) AS earliest,
       (SELECT MAX(created_at) FROM migrations) AS latest`
  )[0] ?? {};

  const frameworkRows = db.query(
    `SELECT source_framework, COUNT(*) AS count,
            AVG(aggregate_confidence) AS avg_conf,
            AVG(smell_removal_rate) AS avg_smell
     FROM migrations
     GROUP BY source_framework
     ORDER BY count DESC`
  );

  const planKbRows = db.query(`SELECT kb_ids_cited FROM plans`);
  const kbCounts = new Map<string, number>();
  for (const row of planKbRows) {
    const raw = str(row, "kb_ids_cited");
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const kbId of parsed) {
        if (typeof kbId !== "string") continue;
        kbCounts.set(kbId, (kbCounts.get(kbId) ?? 0) + 1);
      }
    } catch {
      // Skip malformed rows — DB is a cache, not a source of truth.
    }
  }
  const topKbIds: KbCitation[] = Array.from(kbCounts.entries())
    .map(([kbId, count]) => ({ kbId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const verdictRows = db.query(
    `SELECT verdict, COUNT(*) AS count FROM verifications GROUP BY verdict`
  );
  const verdictTotal = verdictRows.reduce((acc, r) => acc + num(r, "count"), 0);
  const verdicts: VerdictAgg[] = verdictRows.map((r) => ({
    verdict: str(r, "verdict"),
    count: num(r, "count"),
    pct: verdictTotal === 0 ? 0 : (num(r, "count") / verdictTotal) * 100,
  }));

  const trendLimit = last ?? 50;
  const trendRows = db.query(
    `SELECT aggregate_confidence FROM migrations
     ORDER BY created_at DESC
     LIMIT ${trendLimit}`
  );
  const confidenceTrend = trendRows
    .map((r) => num(r, "aggregate_confidence"))
    .reverse();

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
    confidenceTrend,
    frameworkQuality: buildFrameworkQuality(db),
  };
}

const SPARK_BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function sparkline(values: number[]): string {
  if (values.length === 0) return "(no data)";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values
    .map((v) => {
      if (range === 0) return SPARK_BARS[3] ?? "▄";
      const normalized = (v - min) / range;
      const idx = Math.min(SPARK_BARS.length - 1, Math.floor(normalized * SPARK_BARS.length));
      return SPARK_BARS[idx] ?? "▄";
    })
    .join("");
}

function formatUnix(ts: number | null): string {
  if (ts === null) return "(none)";
  return new Date(ts * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function renderFrameworkQualitySection(quality: FrameworkQualityRow[]): string[] {
  const out: string[] = [];
  out.push("## Migrator quality by framework (best → worst, by median conf.)");
  if (quality.length === 0) {
    out.push("  (no migration rows)");
    return out;
  }
  out.push("  framework                 n   med_conf   mean_conf   SHIP%   FIX%   STOP%");
  for (const q of quality) {
    const fw = q.framework.padEnd(24);
    const n = String(q.migrationCount).padStart(3);
    const med = q.medianConfidence.toFixed(3).padStart(8);
    const mean = q.meanConfidence.toFixed(3).padStart(9);
    const ship = (q.shipItRate * 100).toFixed(1).padStart(5);
    const fix = (q.fixFirstRate * 100).toFixed(1).padStart(5);
    const stop = (q.startOverRate * 100).toFixed(1).padStart(5);
    out.push(`  ${fw}  ${n}   ${med}   ${mean}   ${ship}  ${fix}  ${stop}`);
  }
  return out;
}

function renderText(data: ReportData): string {
  const lines: string[] = [];
  lines.push("# PWmodernizer metrics report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`  Migrations:    ${data.summary.totalMigrations}`);
  lines.push(`  Plans:         ${data.summary.totalPlans}`);
  lines.push(`  Verifications: ${data.summary.totalVerifications}`);
  lines.push(`  Date range:    ${formatUnix(data.summary.earliestUnix)}  →  ${formatUnix(data.summary.latestUnix)}`);
  lines.push("");

  lines.push("## Per source framework");
  if (data.perFramework.length === 0) {
    lines.push("  (no migration rows)");
  } else {
    lines.push("  framework                 count   avg_conf   avg_smell_removal");
    for (const f of data.perFramework) {
      const fw = f.framework.padEnd(24);
      const ct = String(f.count).padStart(5);
      const ac = f.avgAggregateConfidence.toFixed(3).padStart(8);
      const sr = f.avgSmellRemovalRate.toFixed(3).padStart(16);
      lines.push(`  ${fw}  ${ct}   ${ac}   ${sr}`);
    }
  }
  lines.push("");

  lines.push(...renderFrameworkQualitySection(data.frameworkQuality));
  lines.push("");

  lines.push("## Top 10 KB-IDs cited");
  if (data.topKbIds.length === 0) {
    lines.push("  (no plans recorded)");
  } else {
    for (const kb of data.topKbIds) {
      lines.push(`  ${kb.kbId.padEnd(16)} ${String(kb.count).padStart(4)}`);
    }
  }
  lines.push("");

  lines.push("## Verdict distribution");
  if (data.verdicts.length === 0) {
    lines.push("  (no verifications recorded)");
  } else {
    for (const v of data.verdicts) {
      lines.push(`  ${v.verdict.padEnd(12)} ${String(v.count).padStart(4)}  (${v.pct.toFixed(1)}%)`);
    }
  }
  lines.push("");

  lines.push("## Confidence trend (oldest → newest)");
  if (data.confidenceTrend.length === 0) {
    lines.push("  (no migrations recorded)");
  } else {
    const min = Math.min(...data.confidenceTrend);
    const max = Math.max(...data.confidenceTrend);
    lines.push(`  ${sparkline(data.confidenceTrend)}`);
    lines.push(`  range: ${min.toFixed(2)} → ${max.toFixed(2)}    n=${data.confidenceTrend.length}`);
  }
  lines.push("");

  return lines.join("\n");
}

function main(): void {
  const args = parseCliArgs();
  const db = new MetricsDB(args.db);
  try {
    const data = buildReport(db, args.last);
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    } else {
      process.stdout.write(renderText(data));
    }
  } finally {
    db.close();
  }
}

main();
