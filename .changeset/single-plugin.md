---
"@interfere/landmines": minor
---

Ship one `landmines` plugin and group its rules by Oxlint category.

Breaking: the `landmines-testing`, `landmines-style`, `landmines-structure` and `landmines-types` plugins and their `@interfere/landmines/testing`, `/style`, `/structure` and `/types` entrypoints are gone. Register `{ "name": "landmines", "specifier": "@interfere/landmines" }` and rename rule keys to `landmines/<rule>`.

Configurations now follow the categories: `recommended` (correctness and suspicious), `correctness`, `suspicious`, `pedantic`, `style`, `restriction` and `all`. Correctness, suspicious and restriction rules are errors; pedantic and style rules are warnings.
