---
"@interfere/landmines": patch
---

Cover `vi.waitUntil` in `no-unsignaled-poll`. It polls a condition the same way `vi.waitFor` polls an assertion, so a condition that reads request-recorder or spy state now reports instead of racing its timeout.
