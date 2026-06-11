#!/usr/bin/env tsx
/**
 * validate-envelope-vs-source.ts — Stage 1 envelope quality gate.
 *
 * Compares envelope.scenarios.length to the count of test functions in the
 * source input. Catches "derived-placeholder" envelopes where Stage 1 emitted
 * a single placeholder scenario instead of one per source test — sel-python
 * iter 1 fix (#65) and bad-PW envelope fix (#65) were both manual responses
 * to this exact failure mode.
 *
 * Heuristic detection per framework:
 *   - selenium-python (.py)     → `def test_*(`
 *   - selenium-java (.java)     → `@Test`
 *   - cypress (.cy.{js,ts})     → `it(` or `test(`
 *   - bad-playwright (.spec.ts) → `test(`
 *
 * Exit codes:
 *   0 = match (envelope.scenarios.length == source test count) OR
 *       envelope has placeholder scenario (id=1.1 + title containing "placeholder")
 *       AND source has multiple tests → still pass for backward-compat but warn
 *   1 = mismatch (envelope says N, source has M, N != M)
 *
 * Strict TS, no any.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

interface CliArgs {
  envelope: string;
  input: string;
  strict: boolean;
}

interface EnvelopeScenarios {
  scenarios: Array<{ id: string; title: string }>;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      envelope: { type: "string" },
      input: { type: "string" },
      strict: { type: "boolean", default: false },
    },
  });
  if (typeof values.envelope !== "string" || values.envelope.length === 0) {
    process.stderr.write("::error::--envelope <path> required\n");
    process.exit(1);
  }
  if (typeof values.input !== "string" || values.input.length === 0) {
    process.stderr.write("::error::--input <path> required\n");
    process.exit(1);
  }
  return { envelope: values.envelope, input: values.input, strict: values.strict === true };
}

/** Detect framework by source file extension. */
function detectFramework(inputPath: string): "selenium-python" | "selenium-java" | "cypress" | "bad-playwright" | "unknown" {
  if (inputPath.endsWith(".py")) return "selenium-python";
  if (inputPath.endsWith(".java")) return "selenium-java";
  if (inputPath.endsWith(".cy.js") || inputPath.endsWith(".cy.ts")) return "cypress";
  if (inputPath.endsWith(".spec.ts") || inputPath.endsWith(".spec.js")) return "bad-playwright";
  return "unknown";
}

/** Walk directory, return all source files matching the framework's extension. */
function collectSourceFiles(inputPath: string): string[] {
  if (!existsSync(inputPath)) return [];
  const st = statSync(inputPath);
  if (st.isFile()) return [inputPath];
  // Directory: walk for any source files.
  const out: string[] = [];
  const stack: string[] = [inputPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const s = statSync(current);
    if (s.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (entry.startsWith(".")) continue;
        stack.push(join(current, entry));
      }
    } else if (
      current.endsWith(".py") || current.endsWith(".java") ||
      current.endsWith(".cy.js") || current.endsWith(".cy.ts") ||
      current.endsWith(".spec.ts") || current.endsWith(".spec.js")
    ) {
      out.push(current);
    }
  }
  return out;
}

/** Count tests in source files using framework-appropriate pattern. */
function countTests(sourceFiles: string[], framework: ReturnType<typeof detectFramework>): number {
  let total = 0;
  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    // Strip block + line comments to avoid counting commented-out tests.
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")  // /* ... */
      .replace(/\/\/[^\n]*/g, "")        // // ...
      .replace(/#[^\n]*/g, (m) => {       // Python #... — keep shebang line
        return file.endsWith(".py") && m.startsWith("#!") ? m : "";
      });
    switch (framework) {
      case "selenium-python": {
        // def test_xxx( — pytest discovery rule
        const matches = stripped.match(/^\s*(async\s+)?def\s+test_\w+\s*\(/gm);
        total += matches?.length ?? 0;
        break;
      }
      case "selenium-java": {
        // @Test annotations
        const matches = stripped.match(/@Test\b/g);
        total += matches?.length ?? 0;
        break;
      }
      case "cypress": {
        // it(...) or test(...) — top-level test calls
        const matches = stripped.match(/\b(it|test)\s*\(/g);
        total += matches?.length ?? 0;
        break;
      }
      case "bad-playwright": {
        // \btest\s*\( only matches raw test( — not test.describe( / test.beforeEach( etc.
        // (the `.` after `test` breaks the \s*\( match). Same for cypress above —
        // but cypress also allows `it(` which we count separately.
        const matches = stripped.match(/\btest\s*\(/g);
        total += matches?.length ?? 0;
        break;
      }
      case "unknown":
        break;
    }
  }
  return total;
}

function main(): number {
  const args = parseCliArgs();
  const envelopePath = resolve(args.envelope);
  if (!existsSync(envelopePath)) {
    process.stderr.write(`::error::envelope file missing: ${envelopePath}\n`);
    return 1;
  }
  const inputPath = resolve(args.input);
  const framework = detectFramework(args.input);
  if (framework === "unknown") {
    process.stderr.write(`::warning::Unknown framework for input ${args.input} — skipping envelope-vs-source count.\n`);
    return 0;
  }
  const envelopeRaw: unknown = JSON.parse(readFileSync(envelopePath, "utf8"));
  const envelope = envelopeRaw as EnvelopeScenarios;
  const envelopeCount = envelope.scenarios.length;
  const sourceFiles = collectSourceFiles(inputPath);
  if (sourceFiles.length === 0) {
    process.stderr.write(`::warning::No source files found at ${args.input} — skipping.\n`);
    return 0;
  }
  const sourceCount = countTests(sourceFiles, framework);
  if (sourceCount === 0) {
    process.stderr.write(`::warning::Source-test count came out as 0 for ${args.input} (framework=${framework}) — heuristic may have missed; skipping.\n`);
    return 0;
  }
  // Placeholder envelope detection (sel-python iter 1 root cause):
  // single scenario with title containing 'placeholder'.
  const isPlaceholder = envelopeCount === 1 && /placeholder/i.test(envelope.scenarios[0]?.title ?? "");
  if (isPlaceholder && sourceCount > 1) {
    process.stderr.write(`::error::Envelope has 1 placeholder scenario but source has ${sourceCount} test${sourceCount === 1 ? "" : "s"} — envelope is derived-placeholder. Stage 1 must re-emit with one scenario per source test before Stage 2.\n`);
    return 1;
  }
  if (envelopeCount !== sourceCount) {
    process.stderr.write(`::error::Envelope scenario count (${envelopeCount}) does not match source test count (${sourceCount}) for ${args.input} (framework=${framework}). Stage 1 envelope is incomplete.\n`);
    return 1;
  }
  process.stdout.write(`validate-envelope-vs-source: ${envelopeCount} scenario(s) match ${sourceCount} source test(s) in ${sourceFiles.length} file(s) (framework=${framework}).\n`);
  return 0;
}

process.exit(main());
