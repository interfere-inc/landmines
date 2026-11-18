---
"@interfere/landmines": patch
---

`no-fixed-sleep` now reports sleeps inside callbacks that run while a test or hook waits (`act`, `waitFor`, `then`, `catch`, `finally`, `step`), configurable with the `runNow` option.
