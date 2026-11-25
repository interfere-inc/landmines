---
"@interfere/landmines": patch
---

Fix `declared-test-inputs` crashing with `EISDIR` when a package contains a directory named like a source file, such as a Next.js route segment `app/demo/embed.js/route.ts`. The package source scan now skips directories and reads regular files only.
