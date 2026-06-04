// Pure-function rule predicates for `dangerfile.ts`. Extracted so the
// calibrate runner can exercise the same code path against JSON fixtures
// without booting Danger's GitHub context.
//
// Each rule takes a normalised PR snapshot and returns an array of
// violations. Both `dangerfile.ts` (CI path) and
// `scripts/danger-calibrate.ts` (local calibration path) consume these.
//
// Rule numbers match the comment block at the top of `dangerfile.ts`:
//   1. PR title format            — fail  (rule "title-format")
//   2. No Claude/Anthropic credit — fail  (rule "no-claude-attribution")
//   3. PR description schema      — warn  (rule "body-section-missing")
//   4. Confidence label sanity    — warn  (rule "confidence-label-sanity")
//   5. File-size budget           — fail  (rule "file-size-budget")
//   6. No staged transient files  — fail  (rule "transient-file-staged")
//
// Rule 5 is async in `dangerfile.ts` because it needs the diff to count
// post-merge line counts. Here it accepts a precomputed `(file, lines)`
// pair so calibration fixtures stay declarative JSON.

export interface PrSnapshot {
  /** PR metadata: title + body as plain strings. */
  pr: { title: string; body: string };
  /** GitHub issue labels attached to the PR. */
  labels: string[];
  /** Commits, each with the raw commit message Danger exposes verbatim. */
  commits: Array<{ sha: string; message: string }>;
  /** All files added by this PR. */
  createdFiles: string[];
  /** All files modified by this PR. */
  modifiedFiles: string[];
  /**
   * Optional precomputed post-merge line counts (`file` → `lines`) for the
   * file-size rule. Omit to skip rule 5 — fixtures that only exercise the
   * other five rules need not populate this.
   */
  fileLineCounts?: Record<string, number>;
}

export type Severity = "fail" | "warn";

export interface Violation {
  rule:
    | "title-format"
    | "no-claude-attribution"
    | "body-section-missing"
    | "confidence-label-sanity"
    | "file-size-budget"
    | "transient-file-staged";
  severity: Severity;
  message: string;
}

const SIZE_LIMIT = 1500;
const SIZE_RULE_LOCKFILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
]);
const FORBIDDEN_PATHS = [
  "outputs/.snippets-inventory.md",
  "outputs/.lint-errors.md",
];
const FORBIDDEN_PREFIXES = [
  "outputs/.stage1-cache/",
];
const ATTRIBUTION_REGEX = /Co-Authored-By:.*([Cc]laude|[Aa]nthropic)/;

export function checkTitleFormat(snap: PrSnapshot): Violation[] {
  const out: Violation[] = [];
  const isPlanPR = snap.labels.includes("migrator:plan");
  const isCodePR = snap.labels.includes("migrator:code");
  const title = snap.pr.title ?? "";
  if (isPlanPR && !title.startsWith("[Migration plan]")) {
    out.push({
      rule: "title-format", severity: "fail",
      message: `PR labeled \`migrator:plan\` must have a title starting with \`[Migration plan]\` — got: \`${title}\``,
    });
  }
  if (isCodePR && !title.startsWith("[Migration code]")) {
    out.push({
      rule: "title-format", severity: "fail",
      message: `PR labeled \`migrator:code\` must have a title starting with \`[Migration code]\` — got: \`${title}\``,
    });
  }
  return out;
}

export function checkNoClaudeAttribution(snap: PrSnapshot): Violation[] {
  const tainted = snap.commits.filter((c) => ATTRIBUTION_REGEX.test(c.message));
  if (tainted.length === 0) return [];
  const shas = tainted.map((c) => `\`${c.sha.slice(0, 7)}\``).join(", ");
  return [{
    rule: "no-claude-attribution", severity: "fail",
    message: `Commit(s) contain Claude/Anthropic attribution — strip the \`Co-Authored-By:\` trailer and force-push: ${shas}`,
  }];
}

export function checkBodySectionMissing(snap: PrSnapshot): Violation[] {
  const out: Violation[] = [];
  const isPlanPR = snap.labels.includes("migrator:plan");
  const isCodePR = snap.labels.includes("migrator:code");
  const body = snap.pr.body ?? "";
  if (isPlanPR && !body.includes("## Stage 1 — Migration plan")) {
    out.push({
      rule: "body-section-missing", severity: "warn",
      message: "Plan PR description is missing the `## Stage 1 — Migration plan` section header. Was the body edited away from the template?",
    });
  }
  if (isCodePR && !body.includes("## Stage 2 — Generated migration")) {
    out.push({
      rule: "body-section-missing", severity: "warn",
      message: "Code PR description is missing the `## Stage 2 — Generated migration` section header. Was the body edited away from the template?",
    });
  }
  return out;
}

export function checkConfidenceLabelSanity(snap: PrSnapshot): Violation[] {
  if (!snap.labels.includes("migrator:code")) return [];
  const conf = snap.labels.filter((l) => l === "confidence:high" || l === "confidence:low");
  if (conf.length === 0) {
    return [{
      rule: "confidence-label-sanity", severity: "warn",
      message: "Code PR has no `confidence:*` label — CANDOR may not have run yet, or labels were stripped.",
    }];
  }
  if (conf.length > 1) {
    return [{
      rule: "confidence-label-sanity", severity: "warn",
      message: `Code PR has multiple confidence labels (${conf.join(", ")}) — exactly one expected.`,
    }];
  }
  return [];
}

export function checkFileSizeBudget(snap: PrSnapshot): Violation[] {
  if (snap.fileLineCounts === undefined) return [];
  const out: Violation[] = [];
  const touched = [...snap.modifiedFiles, ...snap.createdFiles];
  for (const file of touched) {
    if (SIZE_RULE_LOCKFILES.has(file)) continue;
    const lines = snap.fileLineCounts[file];
    if (lines === undefined) continue;
    if (lines > SIZE_LIMIT) {
      out.push({
        rule: "file-size-budget", severity: "fail",
        message: `\`${file}\` is ${lines} lines (>${SIZE_LIMIT}). Split it — human review accuracy falls off a cliff past 1.5k LOC.`,
      });
    }
  }
  return out;
}

export function checkTransientFileStaged(snap: PrSnapshot): Violation[] {
  const out: Violation[] = [];
  const touched = [...snap.modifiedFiles, ...snap.createdFiles];
  for (const file of touched) {
    if (FORBIDDEN_PATHS.includes(file) || FORBIDDEN_PREFIXES.some((p) => file.startsWith(p))) {
      out.push({
        rule: "transient-file-staged", severity: "fail",
        message: `Transient/cache file staged: \`${file}\`. This path is gitignored — your local \`.gitignore\` may be out of sync. Run \`git rm --cached <file>\` and re-push.`,
      });
    }
  }
  return out;
}

/** Runs every synchronous rule (1, 2, 3, 4, 5 if counts present, 6). */
export function checkAllSync(snap: PrSnapshot): Violation[] {
  return [
    ...checkTitleFormat(snap),
    ...checkNoClaudeAttribution(snap),
    ...checkBodySectionMissing(snap),
    ...checkConfidenceLabelSanity(snap),
    ...checkFileSizeBudget(snap),
    ...checkTransientFileStaged(snap),
  ];
}
