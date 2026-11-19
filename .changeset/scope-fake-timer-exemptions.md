---
"@interfere/landmines": patch
---

Keep no-fixed-sleep active for real timer waits when another test or sibling suite uses fake timers. Preserve fake timer setup in the current test and its shared setup hooks.
