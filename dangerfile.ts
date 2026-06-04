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

import { danger, fail, warn } from "danger";

const labels = danger.github.issue.labels.map((l) => l.name);
const title = danger.github.pr.title ?? "";
const body = danger.github.pr.body ?? "";
const isPlanPR = labels.includes("migrator:plan");
const isCodePR = labels.includes("migrator:code");

// Rule 1 — PR title format. Migrator PRs are machine-generated and must follow
// the [Migration plan] / [Migration code] convention. Human PRs are unconstrained.
if (isPlanPR && !title.startsWith("[Migration plan]")) {
  fail(`PR labeled \`migrator:plan\` must have a title starting with \`[Migration plan]\` — got: \`${title}\``);
}
if (isCodePR && !title.startsWith("[Migration code]")) {
  fail(`PR labeled \`migrator:code\` must have a title starting with \`[Migration code]\` — got: \`${title}\``);
}

// Rule 2 — no Claude/Anthropic attribution in any commit. Project rule —
// see ~/.claude/CLAUDE.md (Global Rules → Git/GitHub → Never).
const commits = danger.github.commits ?? [];
const attributionRegex = /Co-Authored-By:.*([Cc]laude|[Aa]nthropic)/;
const taintedCommits = commits.filter((c) => attributionRegex.test(c.commit.message));
if (taintedCommits.length > 0) {
  const shas = taintedCommits.map((c) => `\`${c.sha.slice(0, 7)}\``).join(", ");
  fail(`Commit(s) contain Claude/Anthropic attribution — strip the \`Co-Authored-By:\` trailer and force-push: ${shas}`);
}

// Rule 3 — PR description schema. Each migrator PR type owns a section header.
// Warn (not fail) — humans sometimes edit descriptions mid-review.
if (isPlanPR && !body.includes("## Stage 1 — Migration plan")) {
  warn("Plan PR description is missing the `## Stage 1 — Migration plan` section header. Was the body edited away from the template?");
}
if (isCodePR && !body.includes("## Stage 2 — Generated migration")) {
  warn("Code PR description is missing the `## Stage 2 — Generated migration` section header. Was the body edited away from the template?");
}

// Rule 4 — confidence label sanity. CANDOR should leave exactly one of
// `confidence:high` / `confidence:low` on a code PR. Warn (not fail) because
// CANDOR may be mid-flight or the user may legitimately relabel during review.
if (isCodePR) {
  const confLabels = labels.filter((l) => l === "confidence:high" || l === "confidence:low");
  if (confLabels.length === 0) {
    warn("Code PR has no `confidence:*` label — CANDOR may not have run yet, or labels were stripped.");
  } else if (confLabels.length > 1) {
    warn(`Code PR has multiple confidence labels (${confLabels.join(", ")}) — exactly one expected.`);
  }
}

// Rule 5 — file-size budget. Anything over 1500 lines is hard to review
// accurately; the human reviewer will rubber-stamp it. Fail loudly.
// Wrapped in an async IIFE because Danger's inline runner (require-based)
// chokes on top-level await.
const SIZE_LIMIT = 1500;
const touchedFiles = [...danger.git.modified_files, ...danger.git.created_files];
const sizeChecks = (async () => {
  for (const file of touchedFiles) {
    // Skip lockfile — auto-generated, often huge, not human-reviewed line by line.
    if (file === "package-lock.json" || file === "yarn.lock" || file === "pnpm-lock.yaml") continue;
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

// Rule 6 — no staged transient/cache files. These paths are gitignored
// (see .gitignore). If they show up in a diff, the gitignore is broken.
const FORBIDDEN_PATHS = [
  "outputs/.snippets-inventory.md",
  "outputs/.lint-errors.md",
];
const FORBIDDEN_PREFIXES = [
  "outputs/.stage1-cache/",
];
for (const file of touchedFiles) {
  if (FORBIDDEN_PATHS.includes(file) || FORBIDDEN_PREFIXES.some((p) => file.startsWith(p))) {
    fail(`Transient/cache file staged: \`${file}\`. This path is gitignored — your local \`.gitignore\` may be out of sync. Run \`git rm --cached <file>\` and re-push.`);
  }
}
