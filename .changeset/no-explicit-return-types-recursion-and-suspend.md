---
"@interfere/landmines": patch
---

Allow explicit return types on self-recursive functions/methods and zero-argument `suspend`/`lazy` thunks (such as Effect `Schema.suspend` and Zod `z.lazy`), where TypeScript requires an explicit return annotation (`TS7022`/`TS7023`/`TS7024`).
