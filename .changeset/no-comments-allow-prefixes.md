---
"@interfere/landmines": patch
---

Add an `allow` option to `no-comments` listing the single-line comment prefixes to keep, defaulting to `["WARNING"]`, so `// SAFETY:` comments required by anti-slop can be allowed.
