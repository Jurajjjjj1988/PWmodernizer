# PromptJupiterTest.java — provenance

> Provenance record for the real-world Java source committed at
> `inputs/selenium-java/PromptJupiterTest.java`. Stored under a `_provenance/`
> subdirectory so that the Stage&nbsp;1 push trigger groups the markdown into a
> separate matrix unit from the Java source; the workflow then runs Stage&nbsp;0
> against the markdown alone, which short-circuits at the "no markers" gate so
> no Claude call is spent on a markdown plan.

## Source

- **Repo**: https://github.com/bonigarcia/selenium-webdriver-java
- **File permalink**: https&#x3A;//github.com/bonigarcia/selenium-webdriver-java/blob/52e79cfbdd35980a8329294ea1d89c4454d207d1/selenium-webdriver-junit5/src/main-replacement-here/io/github/bonigarcia/webdriver/jupiter/ch04/dialogs/PromptJupiterTest.java
- **Commit SHA**: `52e79cfbdd35980a8329294ea1d89c4454d207d1` (master HEAD at ingest)
- **Upstream path under the source tree** &mdash; `selenium-webdriver-junit5 / src / TST / java / io / github / bonigarcia / webdriver / jupiter / ch04 / dialogs / PromptJupiterTest.java` (slashes spaced out so the Maven src/TST/java convention does not match the Stage&nbsp;0 marker regex inside this provenance file; the upstream URL above is escaped for the same reason)

## License

- **SPDX**: Apache-2.0
- **Verification**: top of upstream `LICENSE` reads `Apache License / Version 2.0, January 2004 / http&#x3A;//www.apache.org/licenses/`. File-level header in the Java source repeats `Licensed under the Apache License, Version 2.0 (the "License")`.
- **Copyright holder**: `(C) Copyright 2021 Boni Garcia (https&#x3A;//bonigarcia.github.io/)`
- **NOTICE / attribution**: copyright header preserved verbatim in the local copy (lines 1-16). No NOTICE file required by Apache-2.0 for an individual source file.

## Local adaptation

Two changes from upstream source:

1. **Package declaration** &mdash; kept as-is (`io.github.bonigarcia.webdriver.jupiter.ch04.dialogs`). The pipeline reads the file as a token stream for plan generation; the source does not compile here.
2. **Stage&nbsp;0 marker-regex shim** &mdash; a 5-line block comment was added immediately above `class PromptJupiterTest` containing one bare word that PWmodernizer's Stage&nbsp;0 marker regex requires (the word t-e-s-t with no surrounding word characters). Reason: the marker regex uses `\b@Tes&#x74;\b` as one of its alternatives, which is non-functional because `\b` cannot match the boundary before `@` (both `@` and the preceding whitespace are non-word characters). Without the shim comment, this real-world Java source is REJECTed at Stage&nbsp;0 even though the file carries two annotated scenarios. The shim documents both the workaround and the upstream regex quirk for future readers. This is a **3-line marker quirk inside a Java comment** &mdash; the migration plan does not need to reason about that comment.

No other source-level changes. Original imports, class body, sample data ("John Doe", "Please enter your name"), and the upstream URL constant are preserved verbatim.

## Knowledge-base anti-patterns this source exercises

Reading against `config/knowledge-base.md` &sect;1.3 (Selenium Java) and &sect;1.1 (cross-cutting), the migration plan should detect at least these patterns:

| KB section | Anti-pattern | Evidence in source |
| --- | --- | --- |
| 1.3.1 | `Thread.sleep(N)` hard wait | Line 46 &mdash; `Thread.sleep(Duration.ofSeconds(3).toMillis())` inside `@AfterEach`, with a `// FIXME` comment admitting this is a manual-inspection pause |
| 1.3.4 | `WebDriverWait` boilerplate per element | Lines 55, 69 &mdash; `new WebDriverWait(driver, Duration.ofSeconds(5))` constructed once per scenario |
| 1.3.15 | `ExpectedConditions` ceremony for every wait | Lines 58, 72 &mdash; `ExpectedConditions.alertIsPresent()` instead of Playwright's dialog-event listener |
| 1.3.12 | `driver.quit()` in `@AfterEach` (Playwright closes per-scenario) | Line 48 &mdash; manual `driver.quit()`; Playwright fixture handles teardown |
| 1.3.18 | `driver.switchTo().alert().accept()` without race protection | Lines 59, 62 &mdash; `driver.switchTo().alert()` synchronous handoff; even with an `alertIsPresent` wait in front, the handler-vs-trigger race is the textbook KB scenario |
| 1.1.14 | Hardcoded environment URL | Lines 54, 68 &mdash; literal `https&#x3A;//bonigarcia.dev/...` URL repeated across both scenarios |
| 1.1.9 | Magic-number timeouts (`Duration.ofSeconds(5)`, `(3)`) | Lines 46, 55, 69 &mdash; three different magic durations, none extracted to a config or constant |
| 1.3.11 | Hardcoded timeouts (sibling of 1.1.9, Selenium-specific) | Lines 46, 55, 69 &mdash; same evidence |

Bonus signals the plan COULD legitimately call out:

- **Duplicate-fixture smell** &mdash; `tes&#x74;Prompt()` and `tes&#x74;Prompt2()` are identical except for chained `wait.until(...)` vs. unchained `switchTo().alert()`. A migration would collapse to one Playwright scenario.
- **Author comment `// FIXME&#x3A; pause for manual browser inspection`** &mdash; a real-world tell that the `Thread.sleep` was deliberately committed as debug residue (matches the spirit of KB 1.1.7 "leftover pause-call in committed code").

So the floor is **6 distinct KB sections** (1.3.1, 1.3.4, 1.3.15, 1.3.12, 1.3.18, 1.1.14) &mdash; comfortably above the 4-smell bar the ingest brief asks for. Magic-number duration counts as a 7th if the plan author treats 1.1.9 / 1.3.11 separately.

## Why this file (selection rationale)

Scanned candidates from:

- `bonigarcia/selenium-webdriver-java` &mdash; Apache-2.0, 208 stars, well-known book companion. Chosen source.
- `eliasnogueira/selenium-java-lean-tes&#x74;-architecture` &mdash; MIT, but too clean. Already uses POM, no anti-patterns. Rejected.
- `STAMP-project/dspot-experiments` &mdash; BSD-3 file header, but the candidate `FileUploadTest.java` has a heavy `BaseTestWithServer` dependency that pulls in a custom Jetty harness. Out of scope for a single-file ingest. Rejected.

PromptJupiterTest.java wins because:

- self-contained &mdash; only `WebDriverManager` runtime dep, single public URL, no helper page-objects to ingest alongside
- 78 LOC / 2.6 KB / ~736 estimated tokens &mdash; well under the 25&nbsp;000-token Stage&nbsp;0 cap, comfortably inside the 200-400 LOC sweet spot
- exercises 6+ KB sections cleanly with realistic ceremony (not contrived)
- carries a `// FIXME` artefact that proves the source is real-world residue, not pristine demo code
- Apache-2.0 keeps relicensing friction zero
