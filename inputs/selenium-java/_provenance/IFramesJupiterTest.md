# Provenance: IFramesJupiterTest.java

## Source
- **Upstream:** [bonigarcia/selenium-webdriver-java](https://github.com/bonigarcia/selenium-webdriver-java)
- **License:** Apache-2.0
- **Path in upstream:** `selenium-webdriver-junit5/src/test/java/io/github/bonigarcia/webdriver/jupiter/ch04/targets/IFramesJupiterTest.java`
- **Fetched on:** 2026-06-09 via `gh api repos/bonigarcia/selenium-webdriver-java/contents/...`

## Topic
- **Anti-pattern domain:** Frames
- **Summary:** Switch into iframe + back via driver.switchTo().frame() (ch04/targets)

## Why included
Part of PWmodernizer's real-world bonigarcia chapter coverage. CONTINUE.md Priority 3 calls for 10+ random Selenium tests from chapters 5-10; this is batch 1 (5 tests). Cross-language migration target: Java → Playwright TypeScript.

## Modifications from upstream
None. Verbatim copy.

## Test plan after Stage 1 + Stage 2
- Plan PR labelled `migrator:plan` opens via plan.yml on push
- Reviewer merges plan
- Stage 2 fires, emits `outputs/tests/iframesjupitertest.spec.ts` (kebab-case per migration-rules.md)
- Verify CANDOR fires if confidence < 0.7
