---
"@interfere/landmines": patch
---

Trace CommonJS requires and TypeScript import-equals declarations when identifying a test's implementation owner, including source-local companions and conditional package exports. Ignore locally shadowed require functions and type-only declarations.
