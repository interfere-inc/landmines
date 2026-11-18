---
"@interfere/landmines": patch
---

Report `no-fixed-sleep` for timer callbacks with a block body or a function expression, such as `setTimeout(() => { resolve(); }, 100)`.
