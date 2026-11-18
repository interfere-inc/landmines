---
"@interfere/landmines": minor
---

`no-test-doubles` now understands `bun:test`: `mock.module()` and `mock(implementation)` are reported, `vi`/`jest` imported from `bun:test` behave like their Vitest/Jest counterparts, and files importing `bun:test` count as test code. Observation-only `mock()` and `spyOn()` stay allowed.
