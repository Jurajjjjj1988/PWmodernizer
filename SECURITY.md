# Security Policy

## Supported Versions

PWmodernizer is in **v0** (pre-release). Security fixes target the current `main` branch only; tagged releases are advisory snapshots, not LTS lines.

| Version | Supported |
|---|---|
| `main` (active) | ✅ |
| Tagged releases (`v0.x`) | Best-effort; no backport guarantee |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security findings.**

Email the maintainer directly: **[juraj.kapusansky@gmail.com](mailto:juraj.kapusansky@gmail.com)**

Subject line prefix: `[SECURITY] PWmodernizer — <one-line summary>`

### Include in your report

1. **Affected component** — workflow / script / prompt / KB file
2. **Reproduction steps** — minimal commit SHA + commands
3. **Impact assessment** — confidentiality / integrity / availability axes
4. **Suggested fix** if you have one (optional)

### Response timeline

| Stage | Target |
|---|---|
| Acknowledgement of receipt | within **72 hours** |
| Initial triage + severity assessment | within **7 days** |
| Fix proposal + draft advisory | within **30 days** |
| Public disclosure (CVE / GitHub Security Advisory) | coordinated with reporter |

If you do not receive an acknowledgement within 72 hours, please re-send with `[URGENT]` prefix.

## In-scope

- Workflow YAML privilege escalation, secret leakage, or supply-chain risks
- Claude prompt-injection vectors that bypass the validation cascade
- KB-ID or migration-plan poisoning that lands malicious code in generated `outputs/tests/`
- SQLite metrics DB injection / path traversal
- Hardcoded credentials in `inputs/`, `examples/`, or `prompts/`

## Out-of-scope

- Bugs in `inputs/_stress/` (these are intentionally bad-shape adversarial fixtures)
- Issues that require a malicious commit on `main` already to exploit (privileged attacker)
- Denial-of-service via unbounded LLM token spend (this is by design — see `outputs/.metrics.db` for cost monitoring)
- Vulnerabilities in transitively-imported `node_modules/` packages; please report those upstream and CC us if PWmodernizer is the discovery surface

## Disclosure

Once a fix lands on `main`, we will:

1. Publish a GitHub Security Advisory with the agreed-upon severity (CVSS 3.1)
2. Credit the reporter (or honour an anonymous request)
3. Backport to the most-recent tagged release if practical

## Coordinated disclosure timeline

We follow a **90-day** coordinated disclosure window from the date of first contact, extendable by mutual agreement when a fix is genuinely complex.
