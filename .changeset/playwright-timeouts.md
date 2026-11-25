---
"@interfere/landmines": minor
---

`no-flake-masking` also reports Playwright's raised timeouts: `test.describe.configure({ timeout })`, `test.setTimeout`, `test.slow`, and the same calls on `testInfo` and `test.info()`. They count toward the existing `allow` entries.
