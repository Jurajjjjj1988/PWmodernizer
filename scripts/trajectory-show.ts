#!/usr/bin/env node
/**
 * trajectory-show.ts — pretty-print a Layer 11 trajectory JSON file.
 *
 * Companion to scripts/trajectory-trace.ts. Reads a persisted trajectory
 * and prints it in the terminal as section headers + indented bodies,
 * suitable for a human triage pass when a CI run misbehaved.
 *
 * Usage:
 *
 *   npx tsx scripts/trajectory-show.ts \
 *     --trajectory outputs/.trajectories/<run-id>-<stage>.json
 *
 *   Exit 0 on success.
 *   Exit 2 on bad CLI / file-not-found / bad JSON.
 *
 * ============================================================
 * SAME BEST-EFFORT CAVEATS AS trajectory-trace.ts
 * ============================================================
 *
 * 1. promptSize / promptHash are derived from the GitHub Actions log slice
 *    bounded by the "Run Claude (<stage> stage)" step timestamps. That is
 *    NOT the literal assembled prompt — the workflow pipes the prompt to
 *    `claude --print` via stdin without echoing it. Treat promptSize as a
 *    "did this run blow past the usual byte count?" drift signal, not as
 *    the authoritative prompt body.
 *
 * 2. toolCalls is always [] until Stage 2 is rewritten on the Anthropic
 *    SDK with streaming events recorded (Phase 6 of beyond-v1-research).
 *    The renderer already handles non-empty arrays so the change will be
 *    backward-compatible by construction.
 *
 * 3. responseSize is exact when the committed file (`outputs/plans/...`,
 *    `outputs/tests/...`, `outputs/reports/...-verify.md`) is present
 *    locally; otherwise it falls back to the log-slice byte count.
 *
 * 4. verdict + confidence are nullable: plan stage has no verdict, and
 *    confidence is rarely structured in current reports.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

interface ToolCall {
  tool: string;
  args: string;
  result_summary: string;
}

interface Trajectory {
  runId: string;
  stage: "plan" | "migrate" | "verify";
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

interface CliArgs {
  trajectory: string;
}

function fail(message: string): never {
  process.stderr.write(`trajectory-show: ${message}\n`);
  process.exit(2);
}

function parseCliArgs(): CliArgs {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        trajectory: { type: "string" },
      },
      strict: true,
    });
  } catch (err) {
    return fail(`bad CLI: ${(err as Error).message}`);
  }
  const v = parsed.values;
  if (typeof v.trajectory !== "string" || v.trajectory.length === 0) {
    return fail("missing --trajectory <path-to-trajectory.json>");
  }
  return { trajectory: v.trajectory };
}

function loadTrajectory(path: string): Trajectory {
  const absPath = resolve(path);
  if (!existsSync(absPath)) {
    return fail(`trajectory file not found: ${absPath}`);
  }
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch (err) {
    return fail(`could not read ${absPath}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw) as Trajectory;
  } catch (err) {
    return fail(`malformed JSON in ${absPath}: ${(err as Error).message}`);
  }
}

const RULE = "=".repeat(72);
const SUB_RULE = "-".repeat(72);

/**
 * Format duration between two ISO timestamps as "Nm Ms". Falls back to a
 * literal "unknown" when timestamps are missing/unparsable, since we
 * never want to display an invalid number.
 */
function fmtDuration(startISO: string, endISO: string): string {
  const startMs = Date.parse(startISO);
  const endMs = Date.parse(endISO);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "unknown";
  const deltaSec = Math.max(0, Math.round((endMs - startMs) / 1000));
  const m = Math.floor(deltaSec / 60);
  const s = deltaSec % 60;
  return `${m}m ${s}s`;
}

/**
 * Approximate human-readable bytes ("12.5 KB"). Always shows raw bytes
 * too because for prompt-size drift comparisons exactness matters.
 */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  return `${kb.toFixed(1)} KB (${n} B)`;
}

function section(title: string, body: string[]): void {
  process.stdout.write(`\n${RULE}\n`);
  process.stdout.write(`  ${title}\n`);
  process.stdout.write(`${RULE}\n`);
  for (const line of body) {
    process.stdout.write(`  ${line}\n`);
  }
}

function render(t: Trajectory): void {
  process.stdout.write(`\n${RULE}\n`);
  process.stdout.write(`  TRAJECTORY  run=${t.runId}  stage=${t.stage}\n`);
  process.stdout.write(`${RULE}\n`);

  section("Identity", [
    `Run ID:         ${t.runId}`,
    `Stage:          ${t.stage}`,
    `Input:          ${t.inputBasename}`,
    `Conclusion:     ${t.conclusion}`,
    `Started:        ${t.startedAt}`,
    `Completed:      ${t.completedAt}`,
    `Duration:       ${fmtDuration(t.startedAt, t.completedAt)}`,
  ]);

  section("Prompt (best-effort, from log slice — see header)", [
    `Size:           ${fmtBytes(t.promptSize)}`,
    `SHA-256:        ${t.promptHash}`,
    `Note:           This is the byte count between the "Run Claude" step's`,
    `                startedAt and completedAt log timestamps. The literal`,
    `                assembled prompt is piped through stdin and is NOT in`,
    `                the log. Use this as a drift signal, not as truth.`,
  ]);

  section("Response (from committed file when present, else log)", [
    `Size:           ${fmtBytes(t.responseSize)}`,
  ]);

  const verdictLine =
    t.verdict !== null ? t.verdict : "(no verdict — plan stage or missing report)";
  const confLine =
    t.confidence !== null
      ? `${t.confidence.toFixed(2)}`
      : "(unstructured — verify prompt does not mandate a numeric value yet)";
  section("Verdict + confidence", [
    `Verdict:        ${verdictLine}`,
    `Confidence:     ${confLine}`,
  ]);

  if (t.toolCalls.length === 0) {
    section("Tool calls", [
      "(none captured — claude --print does not stream tool events;",
      " populated when Stage 2 moves to the SDK, Phase 6 of",
      " beyond-v1-research)",
    ]);
  } else {
    const body: string[] = [];
    body.push(`${t.toolCalls.length} tool call(s):`);
    body.push(SUB_RULE);
    for (let i = 0; i < t.toolCalls.length; i++) {
      const c = t.toolCalls[i];
      if (c === undefined) continue;
      body.push(`${i + 1}. ${c.tool}`);
      body.push(`   args:    ${c.args}`);
      body.push(`   result:  ${c.result_summary}`);
      body.push(SUB_RULE);
    }
    section("Tool calls", body);
  }

  section("Notes", [t.notes.length > 0 ? t.notes : "(empty)"]);

  process.stdout.write(`\n${RULE}\n`);
  process.stdout.write(`  END  ${t.runId}-${t.stage}\n`);
  process.stdout.write(`${RULE}\n\n`);
}

function main(): void {
  const args = parseCliArgs();
  const t = loadTrajectory(args.trajectory);
  render(t);
}

main();
