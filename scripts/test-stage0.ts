/**
 * Local self-test for plan.yml Stage 0 (Risk 4) sanity gate.
 *
 * Applies the same checks the workflow runs:
 *   - File size in [200B, ∞) bytes  (workflow has no byte upper bound)
 *   - Encoding via `file --mime-encoding -b`
 *   - Test-marker regex     \b(test|it|describe|@Test|def test_|cy\.|page\.)\b
 *   - Token estimate via chars/4 ≤ 25000
 *   - AWS-key secret-scan regex (representative of pattern list in plan.yml)
 *
 * Prints a fixed-width table; exits 0 always (this is a fixture validator,
 * not a CI gate). Useful for local validation without firing CI.
 *
 * Usage:
 *   npx tsx scripts/test-stage0.ts                 # defaults to inputs/_stress/
 *   npx tsx scripts/test-stage0.ts --dir <path>
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface CheckResult {
  file: string;
  sizeBytes: number;
  encoding: string;
  hasMarkers: boolean;
  estTokens: number;
  hasSecret: boolean;
  verdict: 'PASS' | 'REJECT' | 'WARN';
  reason: string;
}

const MARKER_RE = /\b(test|it|describe|@Test|def test_|cy\.|page\.)\b/;
const AWS_KEY_RE = /AKIA[0-9A-Z]{16}/;
const SIZE_FLOOR = 200;
const TOKEN_CAP = 25000;

/**
 * Expected verdict per stress fixture. Used to validate that real shell
 * tools (`file`, `wc`) still classify each fixture the way we documented
 * in inputs/_stress/README.md. If you add a fixture, add a row here too.
 *
 * `bom-encoded.ts` is PASS (not WARN) because `file --mime-encoding -b`
 * reports `utf-8` for BOM-prefixed UTF-8 — see README "surface fixture"
 * note. Same pattern: `binary-as-text.spec.ts` is WARN (not REJECT)
 * because Stage 0's encoding gate is non-blocking and there is no
 * separate mime-type rejection step yet.
 */
const EXPECTED_VERDICTS: Record<string, 'PASS' | 'REJECT' | 'WARN'> = {
  'empty.spec.ts': 'REJECT',
  'too-small.spec.ts': 'REJECT',
  'huge.spec.ts': 'REJECT',
  'no-test-markers.spec.ts': 'REJECT',
  'latin1.ts': 'WARN',
  'mixed-encoding.spec.ts': 'WARN',
  'binary-as-text.spec.ts': 'WARN',
  'with-real-aws-key.spec.ts': 'WARN',
  'bom-encoded.ts': 'PASS',
  'clean-pass.spec.ts': 'PASS',
  'mixed-languages.spec.ts': 'PASS',
  'single-long-line.spec.ts': 'PASS',
  'test-markers-in-comments-only.spec.ts': 'PASS',
  'near-token-limit.spec.ts': 'PASS',
  'unicode-emoji-test.spec.ts': 'PASS',
  // Language-specific adversarial inputs (PW + Selenium calibration deepening).
  // `pw-no-tests-only-describe.spec.ts` PASSES because Stage 0's marker regex
  // matches the substrings `test` and `describe` inside `test.describe(...)`
  // even when no test() call exists — same FIXME pattern as
  // `test-markers-in-comments-only.spec.ts`. Stage 1 Claude review should
  // catch the empty-describe and emit a WARN (no executable tests).
  'pw-deeply-nested-describe.spec.ts': 'PASS',
  'pw-no-tests-only-describe.spec.ts': 'PASS',
  'sel-java-no-test-annotation.java': 'REJECT',
  'sel-py-pytest-skip-all.py': 'PASS',
};

function parseArgs(argv: string[]): { dir: string } {
  let dir = 'inputs/_stress';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (typeof next === 'string') {
        dir = next;
      }
    }
  }
  return { dir };
}

function detectEncoding(path: string): string {
  try {
    const out = execFileSync('file', ['--mime-encoding', '-b', path], {
      encoding: 'utf8',
    });
    return out.trim();
  } catch {
    return 'unknown';
  }
}

function isEncodingOk(enc: string): boolean {
  return enc === 'utf-8' || enc === 'us-ascii' || enc === 'utf-8-binary';
}

function checkFile(path: string): CheckResult {
  const st = statSync(path);
  const sizeBytes = st.size;
  const encoding = detectEncoding(path);
  // Read as buffer; if empty, content checks short-circuit.
  const buf = readFileSync(path);
  const content = buf.toString('utf8');
  const hasMarkers = MARKER_RE.test(content);
  const hasSecret = AWS_KEY_RE.test(content);
  // Workflow uses `wc -m` for chars (multibyte-aware), then chars/4.
  // For latin1 files, `wc -m` may differ from Buffer.length; approximate
  // here with Buffer.length / 4 which is close enough for the cap heuristic.
  const estTokens = Math.floor(buf.length / 4);

  // Apply Stage 0 verdict tree in workflow order.
  if (sizeBytes < SIZE_FLOOR) {
    return {
      file: path,
      sizeBytes,
      encoding,
      hasMarkers,
      estTokens,
      hasSecret,
      verdict: 'REJECT',
      reason: `size ${sizeBytes}B < ${SIZE_FLOOR}B floor`,
    };
  }
  if (estTokens > TOKEN_CAP) {
    return {
      file: path,
      sizeBytes,
      encoding,
      hasMarkers,
      estTokens,
      hasSecret,
      verdict: 'REJECT',
      reason: `~${estTokens} tokens > ${TOKEN_CAP} cap`,
    };
  }
  if (!hasMarkers) {
    return {
      file: path,
      sizeBytes,
      encoding,
      hasMarkers,
      estTokens,
      hasSecret,
      verdict: 'REJECT',
      reason: 'no test markers',
    };
  }
  if (!isEncodingOk(encoding)) {
    return {
      file: path,
      sizeBytes,
      encoding,
      hasMarkers,
      estTokens,
      hasSecret,
      verdict: 'WARN',
      reason: `encoding ${encoding} (warn, does not block)`,
    };
  }
  if (hasSecret) {
    return {
      file: path,
      sizeBytes,
      encoding,
      hasMarkers,
      estTokens,
      hasSecret,
      verdict: 'WARN',
      reason: 'AWS-key pattern matched (warn, does not block)',
    };
  }
  return {
    file: path,
    sizeBytes,
    encoding,
    hasMarkers,
    estTokens,
    hasSecret,
    verdict: 'PASS',
    reason: 'all gates clear',
  };
}

function formatTable(rows: CheckResult[]): string {
  const header = ['FILE', 'SIZE', 'ENCODING', 'MARKERS', 'TOKENS', 'VERDICT', 'REASON'];
  const data = rows.map((r) => [
    r.file.split('/').pop() ?? r.file,
    `${r.sizeBytes}B`,
    r.encoding,
    r.hasMarkers ? 'yes' : 'no',
    String(r.estTokens),
    r.verdict,
    r.reason,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...data.map((row) => (row[i] ?? '').length)),
  );
  const fmt = (row: string[]): string =>
    row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  return [fmt(header), sep, ...data.map(fmt)].join('\n');
}

function main(): void {
  const { dir } = parseArgs(process.argv.slice(2));
  const abs = resolve(dir);
  const entries = readdirSync(abs)
    .filter((f) => !f.startsWith('.') && f !== 'README.md')
    .map((f) => join(abs, f))
    .filter((p) => statSync(p).isFile())
    .sort();
  if (entries.length === 0) {
    console.error(`No files in ${abs}`);
    process.exit(1);
  }
  const results = entries.map(checkFile);
  console.log(`Stage 0 self-test — ${abs}\n`);
  console.log(formatTable(results));
  console.log('');
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `Totals: PASS=${counts.PASS ?? 0}  REJECT=${counts.REJECT ?? 0}  WARN=${counts.WARN ?? 0}`,
  );

  // Validate each fixture's actual verdict against EXPECTED_VERDICTS.
  // Print mismatches as a table; exit non-zero only if a fixture present
  // in EXPECTED_VERDICTS produced the wrong verdict, OR an expected
  // fixture is missing from disk. Unknown fixtures (no expected entry)
  // are reported but not fatal — lets contributors add a fixture and
  // see actual behaviour first, then pin it.
  const expectedNames = new Set(Object.keys(EXPECTED_VERDICTS));
  const actualByName = new Map(
    results.map((r) => [r.file.split('/').pop() ?? r.file, r.verdict] as const),
  );
  const mismatches: string[] = [];
  const unknown: string[] = [];
  for (const [name, expected] of Object.entries(EXPECTED_VERDICTS)) {
    const actual = actualByName.get(name);
    if (actual === undefined) {
      mismatches.push(`MISSING: ${name} (expected ${expected}, not on disk)`);
    } else if (actual !== expected) {
      mismatches.push(`MISMATCH: ${name} expected=${expected} actual=${actual}`);
    }
  }
  for (const r of results) {
    const name = r.file.split('/').pop() ?? r.file;
    if (!expectedNames.has(name)) {
      unknown.push(`UNPINNED: ${name} actual=${r.verdict} (add to EXPECTED_VERDICTS)`);
    }
  }
  if (unknown.length > 0) {
    console.log('');
    console.log(unknown.join('\n'));
  }
  if (mismatches.length > 0) {
    console.log('');
    console.log(mismatches.join('\n'));
    process.exit(1);
  }
  console.log('');
  console.log(`All ${Object.keys(EXPECTED_VERDICTS).length} pinned fixtures produced expected verdicts.`);
}

main();
