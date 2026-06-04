#!/usr/bin/env node
/**
 * trajectory-trace.ts — Layer 11 (Trajectory Review) scaffold.
 *
 * Why this exists: when a Stage 1 plan or Stage 2 generation goes sideways,
 * we have SQLite metrics + dashboard (snapshot view of "what happened") but
 * no per-run replay of "what the model was actually shown and what it
 * actually said". This script reaches into a CI run via `gh` and persists
 * a best-effort JSON trajectory the human can re-read locally.
 *
 * Usage:
 *
 *   npx tsx scripts/trajectory-trace.ts \
 *     --run   <github-actions-run-id> \
 *     --stage <plan|migrate|verify> \
 *     [--basename <input-basename>] \
 *     [--out <path>]
 *
 *   Exit 0 on success, the trajectory path is printed to stdout.
 *   Exit 1 if the run is still in_progress (warning logged so the caller
 *     can fall back to an older known-good run id).
 *   Exit 2 on script error (bad CLI, missing `gh`, malformed JSON).
 *
 * Output:
 *
 *   outputs/.trajectories/<run-id>-<stage>.json
 *
 *   Schema (see Trajectory interface below):
 *     runId, stage, inputBasename, startedAt, completedAt, conclusion,
 *     promptSize (bytes from log slice), promptHash (sha256 of that slice),
 *     responseSize (bytes from log slice), verdict, confidence, toolCalls,
 *     notes.
 *
 * ============================================================
 * BEST-EFFORT TRACE — KNOWN LIMITATIONS
 * ============================================================
 *
 * 1. The full assembled Claude prompt is NOT recoverable from CI logs.
 *    `prompts/_assembled/<stage>.md` is what Sonnet sees, plus prepended
 *    Stage 0 sanity output + the input file contents. None of that is
 *    echoed verbatim to the GitHub Actions log (the workflow pipes the
 *    prompt into `claude --print` via stdin or `cat | claude`). What this
 *    script captures is the SIZE of the bytes that flowed between the
 *    "Run Claude (<stage> stage)" step's start and end timestamps — a
 *    rough proxy useful for "did this run blow past the usual size?"
 *    drift checks. The promptHash is over those captured bytes, not over
 *    the literal assembled prompt.
 *
 * 2. Tool calls are NOT captured. `claude --print` (non-interactive) does
 *    not emit tool-call traces to stderr/stdout. The toolCalls field is
 *    left empty here. Full tool-call replay requires migrating Stage 2 off
 *    `claude --print` to the Anthropic SDK with streaming events recorded
 *    — that's Phase 6 of beyond-v1-research, not this scaffold.
 *
 * 3. The "response" body captured here is whatever Claude wrote to stdout
 *    inside the workflow step — typically the plan markdown or generated
 *    code. The workflow then redirects it to `outputs/plans/<basename>.md`
 *    or `outputs/tests/<basename>` and the file is committed to a PR. We
 *    re-read the committed file (when present) for hash stability; the
 *    log-derived size is fall-back for runs that didn't open a PR.
 *
 * 4. Verdict + confidence come from `outputs/reports/<basename>.md` when
 *    present (verify stage writes it; migrate stage writes a self-rated
 *    report). For plan stage there is no report → both fields are null.
 *
 * 5. This script is intentionally read-only against the CI run. It never
 *    re-triggers, retries, or mutates the run. To replay an entire
 *    pipeline locally use `npm run stage1:replay`.
 *
 * Future Phase 6 hook: the Trajectory interface below has an explicit
 * `toolCalls` array. When Stage 2 is rewritten on the SDK, that field
 * fills in automatically and `trajectory-show.ts` already renders it.
 * Backward-compatible by construction.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const TRAJ_DIR = join(REPO_ROOT, "outputs", ".trajectories");

type Stage = "plan" | "migrate" | "verify";

interface CliArgs {
  run: string;
  stage: Stage;
  basename: string | null;
  out: string | null;
}

interface RunJobStep {
  name: string;
  number: number;
  status: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
}

interface RunJob {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
  steps: RunJobStep[];
}

interface RunMetadata {
  status: string;
  conclusion: string;
  jobs: RunJob[];
}

interface ToolCall {
  tool: string;
  args: string;
  result_summary: string;
}

interface Trajectory {
  runId: string;
  stage: Stage;
  inputBasename: string;
  startedAt: string;
  completedAt: string;
  conclusion: string;
  promptSize: number;
  promptHash: string;
  responseSize: number;
  verdict: "SHIP IT" | "FIX FIRST" | "START OVER" | null;
  confidence: number | null;
  toolCalls: ToolCall[];
  notes: string;
}

function fail(message: string): never {
  process.stderr.write(`trajectory-trace: ${message}\n`);
  process.exit(2);
}

function warn(message: string): void {
  process.stderr.write(`trajectory-trace: WARN ${message}\n`);
}

function parseCliArgs(): CliArgs {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        run: { type: "string" },
        stage: { type: "string" },
        basename: { type: "string" },
        out: { type: "string" },
      },
      strict: true,
    });
  } catch (err) {
    return fail(`bad CLI: ${(err as Error).message}`);
  }
  const v = parsed.values;
  if (typeof v.run !== "string" || v.run.length === 0) {
    return fail("missing --run <github-actions-run-id>");
  }
  if (typeof v.stage !== "string" || v.stage.length === 0) {
    return fail("missing --stage <plan|migrate|verify>");
  }
  if (v.stage !== "plan" && v.stage !== "migrate" && v.stage !== "verify") {
    return fail(`--stage must be one of plan|migrate|verify (got ${v.stage})`);
  }
  return {
    run: v.run,
    stage: v.stage,
    basename: typeof v.basename === "string" && v.basename.length > 0 ? v.basename : null,
    out: typeof v.out === "string" && v.out.length > 0 ? v.out : null,
  };
}

/**
 * Shell-out to `gh run view --json status,conclusion,jobs`. Parse the JSON
 * and return the metadata. The fields we care about are status (so we can
 * skip in_progress runs) and per-step timestamps (so we can slice the
 * log).
 */
function fetchRunMetadata(runId: string): RunMetadata {
  let raw: string;
  try {
    raw = execFileSync(
      "gh",
      ["run", "view", runId, "--json", "status,conclusion,jobs"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    return fail(`gh run view ${runId} failed: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw) as RunMetadata;
  } catch (err) {
    return fail(`gh run view returned non-JSON: ${(err as Error).message}`);
  }
}

/**
 * Map the requested stage to the workflow step's name prefix. The actual
 * step name is `Run Claude (<stage> stage)` for plan/migrate and
 * `Run Claude (verify stage, Opus, <lens> lens)` for verify. We use
 * startsWith on a stable prefix so the verify variant (with the lens
 * suffix) still matches.
 */
function stageToStepPrefix(stage: Stage): string {
  switch (stage) {
    case "plan":
      return "Run Claude (analyze stage)";
    case "migrate":
      return "Run Claude (generate stage)";
    case "verify":
      return "Run Claude (verify stage";
  }
}

/**
 * Find the first job that contains a step matching the stage prefix.
 * Returns the job + that step so we can pull per-step timestamps.
 *
 * Multi-job runs (plan.yml uses a matrix; verify.yml uses sub-agents) are
 * handled by taking the FIRST match — for matrix runs the caller should
 * pass --basename, which we don't currently use to filter jobs (TODO when
 * matrix jobs proliferate). For the v0.5 trajectory smoke this is fine.
 */
function findStageStep(
  meta: RunMetadata,
  stage: Stage,
): { job: RunJob; step: RunJobStep } | null {
  const prefix = stageToStepPrefix(stage);
  for (const job of meta.jobs) {
    for (const step of job.steps) {
      if (step.name.startsWith(prefix)) {
        return { job, step };
      }
    }
  }
  return null;
}

/**
 * Pull the log for a single job and return the byte slice between the
 * step's startedAt and completedAt timestamps. `gh run view --log --job
 * <id>` returns tab-separated `<job>\t<step>\t<iso-timestamp> <message>`
 * lines. We parse the timestamp column to do the slice.
 *
 * Returns ("" , 0) on log fetch failure rather than aborting — the
 * trajectory is still useful with metadata-only.
 */
function fetchStepLogSlice(
  jobId: number,
  startedAt: string,
  completedAt: string,
): { body: string; bytes: number } {
  let raw: string;
  try {
    raw = execFileSync("gh", ["run", "view", "--log", "--job", String(jobId)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    warn(`could not fetch log for job ${jobId}: ${(err as Error).message}`);
    return { body: "", bytes: 0 };
  }
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(completedAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    warn(`step timestamps unparsable (${startedAt} → ${completedAt}); empty slice`);
    return { body: "", bytes: 0 };
  }
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    // Format: `<job>\t<step-or-UNKNOWN STEP>\t<iso-timestamp> <rest>`
    const cols = line.split("\t");
    if (cols.length < 3) continue;
    const tail = cols[2];
    if (tail === undefined) continue;
    // The timestamp is everything up to the first space; the BOM that
    // GitHub prepends to the first line is stripped defensively.
    const firstSpace = tail.indexOf(" ");
    if (firstSpace === -1) continue;
    const tsLiteral = tail.slice(0, firstSpace).replace(/^﻿/, "");
    const tsMs = Date.parse(tsLiteral);
    if (Number.isNaN(tsMs)) continue;
    if (tsMs < startMs || tsMs > endMs) continue;
    kept.push(tail.slice(firstSpace + 1));
  }
  const body = kept.join("\n");
  return { body, bytes: Buffer.byteLength(body, "utf8") };
}

/**
 * Try to recover verdict + confidence from `outputs/reports/<basename>.md`
 * (migrate-stage self-rated report) or `<basename>-verify.md` (combined
 * verify report). Returns nulls when no report is found — the trajectory
 * is still useful without it.
 *
 * Verdict regex matches `^- Verdict: SHIP IT|FIX FIRST|START OVER$` —
 * same line shape that `persist-verify-metrics.ts` parses, so we stay
 * consistent across the codebase.
 *
 * Confidence regex is a best-effort: looks for a line like
 * `- Confidence: 0.78` or `confidence: 0.78`. The verify prompt does not
 * mandate a structured confidence number today (it's qualitative inside
 * findings), so the field is usually null for verify reports. Migrate
 * reports occasionally embed one when the evaluator pipeline writes it.
 */
function loadVerdictAndConfidence(basename: string): {
  verdict: Trajectory["verdict"];
  confidence: Trajectory["confidence"];
} {
  const candidates = [
    join(REPO_ROOT, "outputs", "reports", `${basename}-verify.md`),
    join(REPO_ROOT, "outputs", "reports", `${basename}.md`),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const body = readFileSync(path, "utf8");
    const verdictMatch = body.match(/^- Verdict:\s+(SHIP IT|FIX FIRST|START OVER)\s*$/m);
    const confidenceMatch = body.match(/(?:^|\s)[Cc]onfidence:\s*(0(?:\.\d+)?|1(?:\.0+)?)\b/);
    return {
      verdict: verdictMatch !== null && verdictMatch[1] !== undefined
        ? (verdictMatch[1] as Trajectory["verdict"])
        : null,
      confidence: confidenceMatch !== null && confidenceMatch[1] !== undefined
        ? Number(confidenceMatch[1])
        : null,
    };
  }
  return { verdict: null, confidence: null };
}

/**
 * Reconstruct the "response" body: the canonical Stage 1 / Stage 2
 * output is the file the workflow committed (plan markdown or generated
 * test file). When that file exists we hash it for byte-stable identity.
 * Otherwise we fall back to the log slice (which contains everything
 * Claude streamed to stdout in CI).
 */
function loadResponseBytes(stage: Stage, basename: string, logBody: string): {
  bytes: number;
  source: "file" | "log";
} {
  let filePath: string | null = null;
  if (stage === "plan") {
    filePath = join(REPO_ROOT, "outputs", "plans", `${basename}.md`);
  } else if (stage === "migrate") {
    filePath = join(REPO_ROOT, "outputs", "tests", basename);
  } else {
    // verify
    filePath = join(REPO_ROOT, "outputs", "reports", `${basename}-verify.md`);
  }
  if (filePath !== null && existsSync(filePath)) {
    const body = readFileSync(filePath, "utf8");
    return { bytes: Buffer.byteLength(body, "utf8"), source: "file" };
  }
  return { bytes: Buffer.byteLength(logBody, "utf8"), source: "log" };
}

function sha256(s: string): string {
  return "sha256:" + createHash("sha256").update(s, "utf8").digest("hex");
}

function inferBasenameFromJobName(jobName: string): string | null {
  // Plan + migrate jobs look like:
  //   "plan (inputs/selenium-java/EmployeesTest.java)"
  //   "generate (inputs/bad-playwright/flaky-waits.spec.ts)"
  // Strip "<phase> (<path>)" → return the trailing path's basename.
  const m = jobName.match(/\(([^)]+)\)\s*$/);
  if (m === null || m[1] === undefined) return null;
  const path = m[1];
  const slashIdx = path.lastIndexOf("/");
  return slashIdx === -1 ? path : path.slice(slashIdx + 1);
}

function buildNotes(t: Pick<Trajectory, "stage" | "conclusion" | "verdict" | "promptSize" | "responseSize">): string {
  const parts: string[] = [];
  parts.push(`${t.stage} stage, CI conclusion=${t.conclusion}`);
  if (t.verdict !== null) parts.push(`verdict=${t.verdict}`);
  parts.push(`prompt~${t.promptSize}B`);
  parts.push(`response~${t.responseSize}B`);
  return parts.join("; ");
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function main(): void {
  const args = parseCliArgs();
  const meta = fetchRunMetadata(args.run);

  if (meta.status !== "completed") {
    warn(
      `run ${args.run} is still ${meta.status}. Trajectory will be partial. ` +
        `Re-run after completion for a full trace.`,
    );
    // Exit 1 so the smoke script can fall back to a known-good run id.
    process.exit(1);
  }

  const match = findStageStep(meta, args.stage);
  if (match === null) {
    return fail(
      `no step matching "${stageToStepPrefix(args.stage)}" in run ${args.run}. ` +
        `Wrong --stage, or the run was skipped at that step?`,
    );
  }

  const basename =
    args.basename ?? inferBasenameFromJobName(match.job.name) ?? "(unknown-input)";

  const logSlice = fetchStepLogSlice(
    match.job.databaseId,
    match.step.startedAt,
    match.step.completedAt,
  );

  const promptHash = sha256(logSlice.body);
  const response = loadResponseBytes(args.stage, basename, logSlice.body);
  const { verdict, confidence } = loadVerdictAndConfidence(basename);

  const trajectory: Trajectory = {
    runId: args.run,
    stage: args.stage,
    inputBasename: basename,
    startedAt: match.step.startedAt,
    completedAt: match.step.completedAt,
    conclusion: match.step.conclusion,
    promptSize: logSlice.bytes,
    promptHash,
    responseSize: response.bytes,
    verdict,
    confidence,
    toolCalls: [], // see header limitation 2.
    notes: "",
  };
  trajectory.notes = buildNotes(trajectory);

  const outPath =
    args.out ?? join(TRAJ_DIR, `${args.run}-${args.stage}.json`);
  ensureDir(dirname(outPath));
  writeFileSync(outPath, JSON.stringify(trajectory, null, 2) + "\n", "utf8");

  process.stdout.write(`${outPath}\n`);
  process.stdout.write(
    `trajectory-trace: persisted ${args.stage} trace for run ${args.run} ` +
      `(prompt=${trajectory.promptSize}B from log, response=${trajectory.responseSize}B from ${response.source})\n`,
  );
}

main();
