KB-IDs cite anti-pattern entries in `config/knowledge-base.md`. Two formats are accepted during the transition window (see `config/kb-id-migration.md`):

- **OLD format (legacy, still accepted):** `KB-N.N.N` — e.g., `KB-1.1.1`, `KB-1.2.5`. Hand-numbered. Already cited in merged PRs; do not break.
- **NEW format (preferred for new entries):** `<framework>/<topic>/<name>` — e.g., `pw/timing/hard-wait`, `cy/selector/css-class`, `sel/wait/implicit`. Kebab-case, ESLint-rule style.

New-format regex (enforced by `scripts/kb-validate.ts`): `^(pw|cy|sel)/[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$`.

Framework prefixes: `pw` (Playwright — bad-playwright + target), `cy` (Cypress source), `sel` (Selenium WebDriver — Java + Python collapsed).

Sentinel: `KB-UNCLASSIFIED` — used when you spot a smell with no catalog entry yet. Emit the row, then add a one-paragraph note in an "Unclassified smells" subsection asking the reviewer to triage.

When citing in a plan or report: use whichever format the entry uses in `config/knowledge-base.md`. Do not invent IDs. Do not paraphrase format (e.g., `KB1.1.1` or `pw-timing-hard-wait` will fail the validator).
