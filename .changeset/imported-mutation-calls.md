---
"@interfere/landmines": minor
---

`no-imported-mutation` also reports `Object.assign`, `Object.defineProperty`, `Object.defineProperties`, `Reflect.set`, `Reflect.defineProperty`, `Reflect.deleteProperty` and `delete` on an imported binding, and checks `*.fixture.*` and `*.test-utils.*` files as well as `*.test.*` and `*.spec.*`.
