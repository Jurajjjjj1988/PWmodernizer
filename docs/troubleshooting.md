# Troubleshooting

> Known failure modes + the exact fix. Append-only — entries are named by SYMPTOM (what the user sees), not by cause. When you fix a new failure mode, add an entry here so the next person catches it in 30 seconds.

## CI / workflows

### Symptom: `npm error code ERESOLVE` on `npm ci` (CI or local)

```
npm error ERESOLVE could not resolve
npm error While resolving: tree-sitter-python@0.23.6
npm error Found: tree-sitter@0.21.1
npm error peerOptional tree-sitter@"^0.25.0" from tree-sitter-python@0.23.6
```

**Cause:** `tree-sitter-python@0.23.6` declares `peerOptional` on `tree-sitter@^0.25`. Our root project pins `tree-sitter@^0.21.1`. Both work fine at runtime; npm strict mode rejects the version conflict.

**Fix shipped (commit `ca9afdb`):** `.npmrc` at repo root sets `legacy-peer-deps=true`. Applies to all `npm ci` / `npm install` (local + CI).

If you ever delete `.npmrc`, the symptom returns. Either restore it or update the tree-sitter pins to a non-conflicting pair.

---

### Symptom: `plan.yml` / `migrate.yml` fails at "Open plan PR" / "Open code PR" step with HTTP 400

```
remote: Duplicate header: "Authorization"
fatal: unable to access 'https://github.com/.../': The requested URL returned error: 400
##[error]The process '/usr/bin/git' failed with exit code 128
```

**Cause:** `actions/checkout` (with `persist-credentials: true`, the default) stashes an `AUTHORIZATION` extraheader in the local git config. `peter-evans/create-pull-request@v7` then sets its own `AUTHORIZATION` header during fetch. GitHub server rejects the duplicate.

**Fix shipped (commit `0b38aa5`):** add `persist-credentials: false` to actions/checkout in `plan.yml` and `migrate.yml`. peter-evans/create-pull-request drives its own credentials via `inputs.token` (default `${{ github.token }}`).

`verify.yml` doesn't open PRs and stays as-is.

---

### Symptom: Stage 1 plan file produced but workflow fails at "Validate plan structure"

```
::error::Plan missing required section: ## Source framework
::error::Plan missing required section: ## Anti-patterns detected
::error::Plan has no confidence markers (HIGH/MED/LOW)
```

**Cause:** Sonnet produced output but the formatting drifted from the schema. Usually triggered by an over-long input or a corrupted prompt assembly.

**Fix:**
1. Run `npm run check:assemble` locally — if it reports `prompts/_assembled/` is out of sync, run `npm run assemble-prompts` and commit.
2. Comment `/regenerate <feedback>` on the plan PR — the regenerate-dispatch workflow re-fires Stage 1 with your feedback string passed to the prompt.
3. If a specific section is missing repeatedly, edit `prompts/analyze.md` to make the schema requirement louder (NOT bigger — louder, per Tam et al. 2024 schema-demotion guidance).

---

### Symptom: `npm run smoke` fails with `validate-examples: ... KB-ID 'cy/foo/bar' not defined`

**Cause:** A plan in `examples/*/expected-plan.md` cites a new-format KB ID (`cy/foo/bar`) that is documented in `config/kb-id-migration.md` as an alias but not yet rewritten as a new-format header in `config/knowledge-base.md`. The headers are still old-format (`#### 1.2.X`), so the validator only resolves `KB-1.2.X` references.

**Fix:**
- Strip the redundant new-format citation if the plan already cites the `KB-1.2.X` form (commit `62e4014` example).
- OR (Phase 2 work, not yet done): land the §1.2 header rewrite in `knowledge-base.md` so both formats resolve. See `kb-id-migration.md §3.2` for the migration steps.

---

## Pipeline behavior

### Symptom: Verify ships SHIP IT but PR keeps `confidence:low` label

**Cause:** Stage 2 confidence was below 0.7, so the `confidence:low` label was attached at PR open. Verify's CANDOR consensus came back 2/2 SHIP IT but the label wasn't updated.

**Fix shipped (commit `0c9f234`):** Verify-tally job explicitly removes `confidence:low` and adds `confidence:high` on final SHIP IT. If you see this on a PR opened before that commit, manually relabel.

---

### Symptom: PR auto-fires verify with `regen-attempt:max-reached` and refuses to retry

**Cause:** The PR has already gone through 3 START OVER → repository_dispatch regenerate cycles. The verify workflow caps at 3 attempts to prevent infinite loops.

**Fix:** This is expected. The next step is human review — either:
1. Edit the plan/code by hand to fix what's blocking SHIP IT
2. Close the PR and `gh workflow run plan.yml -f input_path=<original>` to start fresh
3. If the regen logic itself looks broken, see `regenerate-dispatch.yml` + verify.yml's regen counter logic.

---

### Symptom: DOM grounding step is `skipped` even though MIGRATION_TARGET_URL is set in repo secrets

**Cause:** The secret is set at the org/user level but not visible to the workflow (private fork, secret scoped to specific environments).

**Fix:**
1. Confirm `MIGRATION_TARGET_URL` is set in **Repo Settings → Secrets and variables → Actions**, NOT in environments.
2. In migrate.yml the env binding is `${{ secrets.MIGRATION_TARGET_URL }}`. If `secrets.MIGRATION_TARGET_URL` evaluates to empty string at runtime, the step writes `dom_probe_status=skipped` and exits 0 by design.
3. To debug, temporarily change the step to also echo `[ -n "${MIGRATION_TARGET_URL:-}" ] && echo "URL present, len=${#MIGRATION_TARGET_URL}"`.

---

## Local dev

### Symptom: `npm run dashboard` shows empty charts

**Cause:** `outputs/.metrics.db` is empty (first-run state) or you're running against a fresh checkout.

**Fix:** Run any migration through the local pipeline at least once to populate the DB. Or synthesize a row:

```bash
sqlite3 outputs/.metrics.db "INSERT INTO migrations VALUES ('test', 'bad-playwright', 0.85, 0.92, 'SHIP IT', '2026-06-04', 'flaky-waits.spec.ts');"
```

See `scripts/metrics.ts` for the canonical schema.

---

### Symptom: `npm run check:dom-ground` smoke fails with `playwright was not found`

**Cause:** `node_modules/playwright` is missing or the browser binaries aren't installed.

**Fix:**
```bash
npm ci
npx playwright install chromium
```

The mock-mode smoke (`mock://always-resolve`) doesn't actually launch a browser, so it should work without `playwright install`. If it still fails, the `playwright` package import is the bottleneck — `npm ci` should fix that.

---

### Symptom: `scripts/derive-envelope.ts` produces an envelope but `plan-envelope-validate.ts --code` reports orphans

**Cause:** The derived envelope synthesized scenarios that don't have matching `// plan:scenario=<id>` pins in the spec file. Common when the spec uses a different ID scheme than the markdown plan.

**Fix:**
1. Read the derived envelope. Scenarios will be `1.1`, `1.2` etc.
2. Add `// plan:scenario=1.1` comments immediately above each `test(...)` call in the spec, matching the derived IDs.
3. Re-run `npm run check:envelope:code`.

For a long-term fix, edit the source plan markdown so it uses explicit scenario IDs that survive derivation cleanly.
