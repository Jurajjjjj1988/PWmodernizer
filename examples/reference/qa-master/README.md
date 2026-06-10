# qa-master — production-grade style anchor

Real-company production Playwright TypeScript test suite, used by PWmodernizer
as the **target architecture style anchor** that Stage 2 generates against
(v0.2.0 default).

## How PWmodernizer uses this

1. **Snippet inventory grounding** (Stage 2 `Build snippet inventory for Claude
   grounding`): the snippet inventory step walks this directory and presents
   the existing POMs / fixtures / API wrappers to Sonnet. Same Aider repo-map
   pattern — reuse beats invent.
2. **Style anchor** (Stage 2 prompt): `prompts/_assembled/generate.md`
   references this directory as the "what good looks like" target. The
   generated `.spec.ts` and POMs should look like they belong in this tree.
3. **Conformance validator** (`scripts/validate-qa-master-conformance.ts`)
   gates Stage 2 output against the rules these files demonstrate —
   `.describe()` coverage, `[LABEL]` discipline, path-alias usage, no
   `@playwright/test` imports outside the fixture file.

## What's in this snapshot

```
helper/
├── page-object/
│   ├── basepage.ts            # abstract BasePage — wires `page`, abstract waitForPageLoad()
│   ├── baseblock.ts           # abstract BaseBlock — same, for reusable sections
│   ├── accounts.page.ts       # PageClassAccounts — readonly fields w/ .describe(), [LABEL] expects
│   └── cart.page.ts           # PageClassCart — same pattern, exercises blocks
├── fixtures/
│   └── base.fixture.ts        # the ONE file allowed to import from @playwright/test
├── api/
│   └── accounts.api.ts        # signup + sign-in request wrappers (per-test fresh user)
├── utilities/
│   └── logger.ts              # structured logger (never console.log)
└── test-data/
    └── urls.ts                # constants only — URLs, ids, cookies
tests/
└── account.sign-in.spec.ts    # canonical spec — imports test/expect from @fixtures/base.fixture,
                               # uses the injected page objects, asserts via UI
docs/
├── CLAUDE.md                  # 100-line orientation doc (non-negotiable rules)
└── ARCHITECTURE.md            # full layered architecture spec — read before designing
```

## Provenance

Real-company production Playwright tests, included in PWmodernizer with the
owner's permission specifically as a structural reference for the migration
tool's output. The files are verbatim — no modifications.

The snapshot here is a curated minimal subset (11 files) sufficient to
demonstrate the architecture; the full upstream project has many more pages,
blocks, fixtures, and ~17 specs across one config-project surface.

## Non-goals

This is a STYLE REFERENCE, not a runtime dependency of PWmodernizer.

- PWmodernizer does NOT install or compile these files. There's no
  `npm install` from this directory.
- Generated tests **do not import from `examples/reference/qa-master/`**.
  They import from their own target project's `helper/` tree.
- This directory is for SONNET to read at Stage 2 generation time, not for
  `tsc` to typecheck.

## See also

- `config/migration-rules.md` §1–§4 — the rules these files demonstrate.
- `config/knowledge-base.md` § `qa-master/` namespace — the anti-pattern
  catalogue derived from CLAUDE.md + ARCHITECTURE.md.
- `scripts/validate-qa-master-conformance.ts` — the validator that enforces
  the patterns shown here.
