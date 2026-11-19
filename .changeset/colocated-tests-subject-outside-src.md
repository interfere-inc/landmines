---
"@interfere/landmines": patch
---

`colocated-tests` no longer assigns an owner inside `src` to a test that also imports a production module outside `src`, such as an API handler or a script; it treats that test like any other cross-boundary test.
