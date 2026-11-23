---
"@interfere/landmines": minor
---

`no-fixed-sleep` also reports Playwright's `waitForTimeout`, `waitForLoadState("networkidle")` and `waitUntil: "networkidle"` anywhere. `no-unsignaled-poll` also reports loops in test files that await until a clock deadline. The new `no-shared-signal` rule (suspicious) reports an `AbortSignal.timeout` stored at module or `describe` scope of a test file and a `const` `AbortController` shared by a file's tests.
