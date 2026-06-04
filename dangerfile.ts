// Minimal Danger.js policy file for PWmodernizer.
//
// Six rules — four block merge (fail), two are heuristic warnings (warn):
//   1. PR title format            — fail
//   2. No Claude/Anthropic credit — fail
//   3. PR description schema      — warn  (description editable mid-flight)
//   4. Confidence label sanity    — warn  (CANDOR may relabel mid-flight)
//   5. File-size budget (>1500)   — fail
//   6. No staged transient files  — fail
//
// Run locally: `npx danger pr <pr-url>` — never posts, just prints.
// Run in CI:   `npx danger ci` — posts a single sticky PR comment.
//
// Rule predicates live in `scripts/lib/danger-rules.ts` as pure functions
// over a PrSnapshot. That keeps them callable from the local calibrator
// (`scripts/danger-calibrate.ts`) without booting Danger's GitHub context.

import { danger, fail, warn } from "danger";
import {
  checkBodySectionMissing,
  checkConfidenceLabelSanity,
  checkNoClaudeAttribution,
  checkTitleFormat,
  checkTransientFileStaged,
  type PrSnapshot,
  type Violation,
} from "./scripts/lib/danger-rules.js";

const labels = danger.github.issue.labels.map((l) => l.name);
const commits = (danger.github.commits ?? []).map((c) => ({
  sha: c.sha,
  message: c.commit.message,
}));
const snap: PrSnapshot = {
  pr: {
    title: danger.github.pr.title ?? "",
    body: danger.github.pr.body ?? "",
  },
  labels,
  commits,
  createdFiles: danger.git.created_files,
  modifiedFiles: danger.git.modified_files,
};

function emit(v: Violation): void {
  if (v.severity === "fail") fail(v.message);
  else warn(v.message);
}

// Rules 1, 2, 3, 4, 6 — synchronous, snapshot-only predicates.
for (const v of checkTitleFormat(snap)) emit(v);
for (const v of checkNoClaudeAttribution(snap)) emit(v);
for (const v of checkBodySectionMissing(snap)) emit(v);
for (const v of checkConfidenceLabelSanity(snap)) emit(v);
for (const v of checkTransientFileStaged(snap)) emit(v);

// Rule 5 — file-size budget. Async because it needs `git.diffForFile`
// to count post-merge lines. Kept inline here (rather than in the pure
// predicate module) because it depends on Danger's git plumbing. The
// pure-function counterpart `checkFileSizeBudget` accepts a precomputed
// `fileLineCounts` map for fixtures that want to exercise it offline.
//
// Wrapped in an async IIFE because Danger's inline runner (require-based)
// chokes on top-level await.
const SIZE_LIMIT = 1500;
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const touchedFiles = [...snap.modifiedFiles, ...snap.createdFiles];
const sizeChecks = (async () => {
  for (const file of touchedFiles) {
    if (LOCKFILES.has(file)) continue;
    const diff = await danger.git.diffForFile(file);
    if (!diff) continue;
    const afterLines = typeof diff.after === "string" ? diff.after.split("\n").length : 0;
    if (afterLines > SIZE_LIMIT) {
      fail(`\`${file}\` is ${afterLines} lines (>${SIZE_LIMIT}). Split it — human review accuracy falls off a cliff past 1.5k LOC.`);
    }
  }
})();
// Export the promise so Danger awaits completion before reporting.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
sizeChecks;
export default sizeChecks;
