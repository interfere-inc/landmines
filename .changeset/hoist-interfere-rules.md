---
"@interfere/landmines": minor
---

Add 23 rules that Interfere ran in its monorepo.

- `landmines-testing`: `no-conditional-expect`, `no-parameter-branch`, `no-imported-mutation`, `no-elapsed-time-bound`, `no-cold-start-in-test`, `no-cold-import-in-test`, `no-stale-render-assertion`, `no-styling-class-assertion`, `no-clipboard-read-text`, `no-project-max-workers` and the opt-in `declared-test-inputs`.
- `landmines-style`: `no-silent-catch`, `no-inline-hex-encoding`, `no-self-container-query` and the opt-in `padding-between-statements`.
- `landmines-structure`: `no-scripts-directory`, `no-github-scripts`, `package-scripts`, `max-file-lines` and the opt-in `max-exports-per-module`, `max-files-per-directory`, `no-prefix-cluster` and `test-dir-only-cross-functional`.

The recommended configuration enables the non-opt-in rules, with `package-scripts` as a warning.

`no-test-doubles` accepts `appFactories` to recognise your own Hono app factories, and `no-comments` keeps `@boundaries-ignore` directives.
