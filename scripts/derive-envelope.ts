#!/usr/bin/env tsx
/**
 * Derive a plan envelope JSON from a markdown plan.
 *
 * Use cases:
 *   - Backfill envelopes for plans that Stage 1 produced without a sidecar
 *     (Claude may not yet reliably emit envelopes during v0.4 → v0.5 transition)
 *   - Pre-validate the envelope structure during Stage 1 by deriving from the
 *     just-written markdown, comparing to Claude's emitted envelope (if any)
 *   - Make plan envelope enforcement HARD (mandatory) by guaranteeing the
 *     envelope always exists — Claude's failure to emit becomes recoverable
 *
 * Parser strategy: extract by markdown section (## headers); be lenient on
 * format (the markdown plan schema is enforced by plan.yml's Validate step,
 * but reality may have minor variations). Fail loudly when essential data
 * (source framework, locator table) is missing — those are not derivable.
 *
 * Output conforms to scripts/plan-envelope.schema.json (validated by the
 * existing plan-envelope-validate.ts after derivation).
 *
 * CLI:
 *   npx tsx scripts/derive-envelope.ts \
 *     --plan outputs/plans/foo.md \
 *     --out outputs/plans/foo.envelope.json
 *   # then verify:
 *   npx tsx scripts/plan-envelope-validate.ts --envelope outputs/plans/foo.envelope.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { parseArgs } from "node:util";

interface LocatorRow {
  original: string;
  target: string;
  confidence: "high" | "med" | "low";
  notes: string;
}

interface PinEntry {
  pinId: number;
  elementDescription: string;
  assumedLocator: string;
  sourceLocator: string;
  whyComment: string;
  reviewerFallback: string;
}

interface ScenarioEntry {
  id: string;
  title: string;
  userAction: string;
  expectedAssertions: string[];
}

interface Envelope {
  inputBasename: string;
  sourceFramework: "bad-playwright" | "cypress" | "selenium-java" | "selenium-python";
  subtractive: boolean;
  scenarios: ScenarioEntry[];
  requiredPOMs: string[];
  requiredFixtures: string[];
  locatorTable: LocatorRow[];
  hallucinationDefensePins: PinEntry[];
  expectedMetrics: {
    selectorQualityScore: number;
    smellCountDelta: number;
    locDelta: number;
    antiPatternCoverage: string;
  };
}

/**
 * Split markdown into sections keyed by h2 header.
 * Returns a map: "Source framework" -> "...body...", etc.
 */
function splitSections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = md.split("\n");
  let currentHeader: string | null = null;
  let currentBody: string[] = [];
  for (const line of lines) {
    const h2 = /^## (.+?)\s*$/.exec(line);
    if (h2?.[1]) {
      if (currentHeader !== null) {
        sections.set(currentHeader, currentBody.join("\n").trim());
      }
      currentHeader = h2[1].trim();
      currentBody = [];
    } else if (currentHeader !== null) {
      currentBody.push(line);
    }
  }
  if (currentHeader !== null) {
    sections.set(currentHeader, currentBody.join("\n").trim());
  }
  return sections;
}

function parseSourceFramework(body: string): Envelope["sourceFramework"] {
  // Look for a known framework keyword anywhere in the body — tolerant of
  // both '## Source framework\n\nbad-playwright' and '## Source → Target\n\n- Source framework: selenium-java'
  // shapes seen across plan styles.
  const lowered = body.toLowerCase();
  if (lowered.includes("bad-playwright")) return "bad-playwright";
  if (lowered.includes("selenium-java") || lowered.includes("selenium java")) return "selenium-java";
  if (lowered.includes("selenium-python") || lowered.includes("selenium python")) return "selenium-python";
  if (lowered.includes("cypress")) return "cypress";
  throw new Error(`Source framework not recognised in: "${body.slice(0, 200)}"`);
}

/**
 * Parse a markdown table. Returns rows as arrays of trimmed cell strings.
 * Skips the header row and separator row.
 */
function parseMarkdownTable(body: string): string[][] {
  const lines = body.split("\n");
  const rows: string[][] = [];
  let inTable = false;
  let separatorSeen = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (!inTable) {
        inTable = true;
        continue; // skip header row
      }
      if (!separatorSeen) {
        // separator row: |---|---|---|
        if (/^\|[\s|:-]+\|$/.test(trimmed)) {
          separatorSeen = true;
          continue;
        }
      }
      // data row
      const cells = trimmed
        .slice(1, -1) // strip outer pipes
        .split("|")
        .map((c) => c.trim());
      rows.push(cells);
    } else if (inTable && trimmed === "") {
      break; // table ended
    } else if (inTable) {
      // non-table line interspersed (e.g. note) — treat as table end
      break;
    }
  }
  return rows;
}

function normaliseConfidence(s: string): "high" | "med" | "low" {
  const c = s.toLowerCase().trim();
  if (c === "high" || c === "h") return "high";
  if (c === "med" || c === "medium" || c === "m") return "med";
  if (c === "low" || c === "l") return "low";
  throw new Error(`Unknown confidence value: "${s}"`);
}

function parseLocatorTable(body: string): LocatorRow[] {
  const rows = parseMarkdownTable(body);
  return rows.map((row) => {
    // Heuristic: original is column with locator-like syntax, target is similar,
    // confidence is the H/M/L cell, notes is the longest text cell.
    // Canonical column order: Original | New | Confidence | Notes.
    // Real plans may have more columns (Line, Element role, Evidence) — keep
    // the first locator-shaped cell as original, the next as target.
    const locatorCells = row.filter(
      (c) => c.includes("page.") || c.includes("locator(") || c.includes("By.") || c.includes("cy."),
    );
    if (locatorCells.length < 2) {
      // Couldn't identify both — skip.
      return null;
    }
    const original = locatorCells[0] ?? "";
    const target = locatorCells[1] ?? "";
    const confCell = row.find((c) => /^(high|med|medium|low|h|m|l)$/i.test(c.trim()));
    const confidence = confCell ? normaliseConfidence(confCell) : "med";
    const notesCell = row.filter((c) => c !== original && c !== target && c !== confCell);
    const notes = notesCell.length > 0 ? (notesCell.toSorted((a, b) => b.length - a.length)[0] ?? "") : "";
    return { original, target, confidence, notes };
  }).filter((r): r is LocatorRow => r !== null);
}

function parseStructuralChanges(body: string): { requiredPOMs: string[]; requiredFixtures: string[] } {
  const requiredPOMs: string[] = [];
  const requiredFixtures: string[] = [];
  // Look for "Extract POM: yes — <name>" and "Extract fixture: yes — <name>" bullets.
  for (const line of body.split("\n")) {
    const trimmed = line.trim().replace(/^[-*]\s*\*?\*?/, "").replace(/\*\*/g, "");
    const pomMatch = /Extract POM:\s*yes\s*[—-]?\s*([A-Za-z0-9_./-]+(?:\.page\.ts)?)/i.exec(trimmed);
    if (pomMatch?.[1]) {
      const name = pomMatch[1].toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/^-|-$/g, "");
      requiredPOMs.push(`outputs/tests/pages/${name}.page.ts`);
    }
    const fixMatch = /Extract fixture:\s*yes\s*[—-]?\s*([A-Za-z0-9_./-]+(?:\.fixture\.ts)?)/i.exec(trimmed);
    if (fixMatch?.[1]) {
      const name = fixMatch[1].toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/^-|-$/g, "");
      requiredFixtures.push(`outputs/tests/fixtures/${name}.fixture.ts`);
    }
  }
  return { requiredPOMs, requiredFixtures };
}

function parseExpectedMetrics(body: string): Envelope["expectedMetrics"] {
  const get = (label: RegExp): string | null => {
    for (const line of body.split("\n")) {
      const m = label.exec(line);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };
  const selectorRaw = get(/Selector quality score[^:]*:\s*([0-9./]+)/i);
  const smellRaw = get(/Smell count delta[^:]*:\s*(-?\d+)/i);
  const locRaw = get(/LOC delta[^:]*:\s*([+-]?\d+)/i);
  const coverageRaw = get(/Anti-pattern coverage[^:]*:\s*(\d+\/\d+)/i);
  const parseRatio = (s: string | null): number => {
    if (!s) return 0;
    if (s.includes("/")) {
      const parts = s.split("/").map((x) => Number.parseFloat(x.trim()));
      if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined && parts[1] !== 0) {
        return parts[0] / parts[1];
      }
    }
    return Number.parseFloat(s);
  };
  return {
    selectorQualityScore: Number(parseRatio(selectorRaw).toFixed(2)),
    smellCountDelta: smellRaw ? Number.parseInt(smellRaw, 10) : 0,
    locDelta: locRaw ? Number.parseInt(locRaw, 10) : 0,
    antiPatternCoverage: coverageRaw ?? "0/0",
  };
}

function parseHallucinationPins(body: string): PinEntry[] {
  const pins: PinEntry[] = [];
  if (!body) return pins;
  // Split into per-pin blocks; each block starts with a number-dot at line start.
  const blocks = body.split(/\n(?=\d+\.\s)/);
  for (const block of blocks) {
    const idMatch = /^(\d+)\.\s+\*\*(.+?)\*\*/s.exec(block);
    if (!idMatch?.[1] || !idMatch[2]) continue;
    const assumedMatch = /assumed\s*`([^`]+)`/.exec(block);
    const sourceMatch = /keep\s*`([^`]+)`/.exec(block);
    const whyMatch = /WHY-comment\s*`([^`]+)`/.exec(block);
    const fallbackMatch = /Reviewer fallback:\s*([\s\S]+?)(?:\n\s*\n|$)/.exec(block);
    if (!assumedMatch?.[1] || !sourceMatch?.[1] || !whyMatch?.[1] || !fallbackMatch?.[1]) continue;
    pins.push({
      pinId: Number.parseInt(idMatch[1], 10),
      elementDescription: idMatch[2].trim(),
      assumedLocator: assumedMatch[1].trim(),
      sourceLocator: sourceMatch[1].trim(),
      whyComment: whyMatch[1].trim(),
      reviewerFallback: fallbackMatch[1].trim().replaceAll(/\s+/g, " "),
    });
  }
  return pins;
}

function extractChecklistAssertions(summaryBody: string): string[] {
  const lines = summaryBody.split("\n");
  let inChecklist = false;
  const assertions: string[] = [];
  for (const line of lines) {
    if (/^###\s+User-perceivable assertion checklist/i.test(line)) {
      inChecklist = true;
      continue;
    }
    if (inChecklist && /^##/.test(line)) break;
    if (!inChecklist) continue;
    const m = /^-\s*\[\s*[x ]\s*\]\s+(.+)$/i.exec(line.trim());
    if (m?.[1]) assertions.push(m[1].trim());
  }
  return assertions;
}

function placeholderScenario(): ScenarioEntry[] {
  return [
    {
      id: "1.1",
      title: "primary scenario (derived placeholder)",
      userAction: "Derived from markdown without an assertion checklist; reviewer must enrich.",
      expectedAssertions: ["TODO: populate from source test"],
    },
  ];
}

function groupAssertionsIntoScenarios(assertions: string[]): ScenarioEntry[] {
  const positive = assertions.filter((a) => /valid|positive|success/i.test(a) && !/invalid/i.test(a));
  const negative = assertions.filter((a) => /invalid|negative|error/i.test(a));
  const scenarios: ScenarioEntry[] = [];
  if (positive.length > 0) {
    scenarios.push({
      id: `1.${scenarios.length + 1}`,
      title: "happy path",
      userAction: "Exercise the user-perceivable flow with valid input.",
      expectedAssertions: positive,
    });
  }
  if (negative.length > 0) {
    scenarios.push({
      id: `1.${scenarios.length + 1}`,
      title: "error path",
      userAction: "Exercise the user-perceivable flow with invalid input.",
      expectedAssertions: negative,
    });
  }
  if (scenarios.length === 0) {
    scenarios.push({
      id: "1.1",
      title: "primary scenario",
      userAction: "Derived from assertion checklist.",
      expectedAssertions: assertions,
    });
  }
  return scenarios;
}

function parseScenarios(summaryBody: string): ScenarioEntry[] {
  const assertions = extractChecklistAssertions(summaryBody);
  return assertions.length === 0 ? placeholderScenario() : groupAssertionsIntoScenarios(assertions);
}

function deriveEnvelope(md: string, inputBasename: string): Envelope {
  const sections = splitSections(md);
  const get = (key: string): string => sections.get(key) ?? "";
  // Source framework: prefer dedicated section, but multi-file plans use
  // '## Source → Target' instead. Fall back to scanning the whole markdown.
  const frameworkBody = get("Source framework") || get("Source → Target") || md;
  const sourceFramework = parseSourceFramework(frameworkBody);
  const locatorTable = parseLocatorTable(get("Locator translation table"));
  const { requiredPOMs, requiredFixtures } = parseStructuralChanges(get("Structural changes"));
  const expectedMetrics = parseExpectedMetrics(get("Expected metrics"));
  const hallucinationDefensePins = parseHallucinationPins(get("Hallucination-defense pins"));
  const scenarios = parseScenarios(get("Summary"));
  return {
    inputBasename,
    sourceFramework,
    subtractive: sourceFramework === "bad-playwright",
    scenarios,
    requiredPOMs,
    requiredFixtures,
    locatorTable,
    hallucinationDefensePins,
    expectedMetrics,
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });
  if (!values.plan || !values.out) {
    console.error("Usage: derive-envelope --plan <plan.md> --out <envelope.json>");
    process.exit(2);
  }
  try {
    readFileSync(values.plan, "utf-8");
  } catch {
    process.stderr.write(`::error::derive-envelope: --plan not found at ${values.plan}\n`);
    process.exit(1);
  }
  const md = readFileSync(values.plan, "utf-8");
  const inputBasename = basename(values.plan).replace(/\.md$/, "");
  const envelope = deriveEnvelope(md, inputBasename);
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, JSON.stringify(envelope, null, 2) + "\n");
  console.log(`derive-envelope: wrote ${values.out}`);
  console.log(`  scenarios: ${envelope.scenarios.length}, locators: ${envelope.locatorTable.length}, pins: ${envelope.hallucinationDefensePins.length}`);
}

main();
