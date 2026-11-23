---
"@interfere/landmines": patch
---

Fix rule bugs reported in issues #22 and #37–#44: `no-test-doubles` recognises `vite-plus/test`; `strict-msw` requires every unhandled option to be strict; `no-flake-masking` ignores local bindings named like test functions and reports Playwright and Jest retries; `no-fixed-sleep` reports same-file sleep helpers and honours `jest.useFakeTimers()`; `package-exports` reports each manifest once; `colocated-tests` points at the `test/` directory that `test-file-names` accepts.
