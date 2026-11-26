---
"@interfere/landmines": patch
---

Stop treating `import { type Foo }` as a warm import, since TypeScript erases it.
