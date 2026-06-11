#!/usr/bin/env tsx
/**
 * track-output-variability.ts — log per-migration output fingerprints.
 *
 * Sonnet is non-deterministic: the same input + plan can produce N different
 * outputs across runs. To quantify the drift, hash inputs + plan + each
 * emitted file and append a row to `outputs/.usage/variability-log.jsonl`.
 *
 * Each row: { ts, runId, inputBasename, inputHash, planHash, outputFiles: [{path, hash, loc}], confidence, attempt }
 *
 * Analysis post-hoc:
 *   - Same inputHash + planHash + N distinct outputHash sets → high variability
 *     (Sonnet model-side noise dominates). Calibration: tighten temp / prompt.
 *   - Same inputHash + planHash + 1 outputHash repeated → deterministic
 *     (pipeline is reliable on this input). Safe to ship.
 *
 * Used by `npm run dashboard` to render a variability heatmap per input.
 *
 * CLI:
 *   npx tsx scripts/track-output-variability.ts \
 *     --input <path> --plan <path> --basename <basename> \
 *     [--run-id <ci-run-id>] [--confidence <0.0-1.0>] [--attempt <N>]
 *
 * Strict TS, no any.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { parseArgs } from "node:util";

interface CliArgs {
  input: string;
  plan: string;
  basename: string;
  runId: string | null;
  confidence: string | null;
  attempt: string | null;
  outDir: string;
}

interface OutputFile {
  path: string;
  hash: string;
  loc: number;
}

interface Row {
  ts: string;
  runId: string | null;
  inputBasename: string;
  inputHash: string;
  planHash: string;
  outputFiles: OutputFile[];
  confidence: number | null;
  attempt: number | null;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      plan: { type: "string" },
      basename: { type: "string" },
      "run-id": { type: "string" },
      confidence: { type: "string" },
      attempt: { type: "string" },
      "out-dir": { type: "string", default: "outputs/.usage" },
    },
  });
  const need = (k: string, v: unknown) => {
    if (typeof v !== "string" || v.length === 0) {
      process.stderr.write(`::error::--${k} required\n`);
      process.exit(1);
    }
  };
  need("input", values.input);
  need("plan", values.plan);
  need("basename", values.basename);
  return {
    input: values.input as string,
    plan: values.plan as string,
    basename: values.basename as string,
    runId: typeof values["run-id"] === "string" ? values["run-id"] : null,
    confidence: typeof values.confidence === "string" ? values.confidence : null,
    attempt: typeof values.attempt === "string" ? values.attempt : null,
    outDir: typeof values["out-dir"] === "string" ? values["out-dir"] : "outputs/.usage",
  };
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex").slice(0, 16);
}

function hashDir(dirPath: string): string {
  // Hash the sorted concat of (relative-path:fileHash) for stable directory hashing.
  if (!existsSync(dirPath)) return "";
  const st = statSync(dirPath);
  if (st.isFile()) return hashFile(dirPath);
  const files = walk(dirPath);
  const lines = files
    .filter((f) => !f.includes("/node_modules/") && !f.endsWith(".pyc"))
    .sort()
    .map((f) => `${f.replace(dirPath, "")}:${hashFile(f)}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    const s = statSync(cur);
    if (s.isDirectory()) {
      for (const e of readdirSync(cur)) {
        if (e.startsWith(".")) continue;
        stack.push(join(cur, e));
      }
    } else {
      out.push(cur);
    }
  }
  return out;
}

function loc(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, "utf8").split("\n").length;
}

/** Collect emitted output files for this migration (spec + helpers + report). */
function collectOutputs(basename: string): string[] {
  // Match plan-code-coverage resolver semantics: any *.spec.ts under
  // outputs/tests (excl. _legacy) + all qa-master helper paths.
  const out: string[] = [];
  const testsDir = "outputs/tests";
  if (existsSync(testsDir)) {
    for (const f of walk(testsDir)) {
      if (f.includes("/_legacy-v0.1.x/")) continue;
      if (f.endsWith(".spec.ts")) out.push(f);
    }
  }
  const helperDir = "outputs/helper";
  if (existsSync(helperDir)) {
    for (const f of walk(helperDir)) {
      // Exclude pre-committed baseline scaffolding (basepage, baseblock,
      // base.fixture shell, logger) — those don't change per run.
      if (
        f.endsWith("/page-object/basepage.ts") ||
        f.endsWith("/page-object/baseblock.ts") ||
        f.endsWith("/utilities/logger.ts")
      ) continue;
      if (f.endsWith(".ts")) out.push(f);
    }
  }
  const report = `outputs/reports/${basename}.md`;
  if (existsSync(report)) out.push(report);
  return out;
}

function main(): number {
  const args = parseCliArgs();
  const inputAbs = resolve(args.input);
  const planAbs = resolve(args.plan);
  if (!existsSync(inputAbs)) {
    process.stderr.write(`::warning::input ${inputAbs} not found — skipping variability log\n`);
    return 0;
  }
  if (!existsSync(planAbs)) {
    process.stderr.write(`::warning::plan ${planAbs} not found — skipping\n`);
    return 0;
  }
  const inputHash = hashDir(inputAbs);
  const planHash = hashFile(planAbs);
  const outputFiles: OutputFile[] = collectOutputs(args.basename).map((p) => ({
    path: p,
    hash: hashFile(p),
    loc: loc(p),
  }));
  const row: Row = {
    ts: new Date().toISOString(),
    runId: args.runId,
    inputBasename: args.basename,
    inputHash,
    planHash,
    outputFiles,
    confidence: args.confidence !== null ? Number.parseFloat(args.confidence) : null,
    attempt: args.attempt !== null ? Number.parseInt(args.attempt, 10) : null,
  };
  mkdirSync(args.outDir, { recursive: true });
  const logPath = join(args.outDir, "variability-log.jsonl");
  appendFileSync(logPath, JSON.stringify(row) + "\n");
  process.stdout.write(
    `track-output-variability: appended row for ${args.basename} (inputHash=${inputHash}, planHash=${planHash}, ${outputFiles.length} output file(s)) to ${logPath}\n`,
  );
  return 0;
}

process.exit(main());
