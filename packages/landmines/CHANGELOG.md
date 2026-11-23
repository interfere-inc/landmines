# @interfere/landmines

## 0.2.0

### Minor Changes

- [#46](https://github.com/interfere-inc/landmines/pull/46) [`b671898`](https://github.com/interfere-inc/landmines/commit/b671898fbdadc7f72c9acb25d50d5c565afaf074) Thanks [@skve](https://github.com/skve)! - Add 23 rules that Interfere ran in its monorepo: `no-conditional-expect`, `no-parameter-branch`, `no-imported-mutation`, `no-elapsed-time-bound`, `no-cold-start-in-test`, `no-cold-import-in-test`, `no-stale-render-assertion`, `no-styling-class-assertion`, `no-clipboard-read-text`, `no-project-max-workers`, `declared-test-inputs`, `no-silent-catch`, `no-inline-hex-encoding`, `no-self-container-query`, `padding-between-statements`, `no-scripts-directory`, `no-github-scripts`, `package-scripts`, `max-file-lines`, `max-exports-per-module`, `max-files-per-directory`, `no-prefix-cluster` and `test-dir-only-cross-functional`.
  
  `no-test-doubles` accepts `appFactories` to recognise your own Hono app factories, and `no-comments` keeps `@boundaries-ignore` directives.

- [#48](https://github.com/interfere-inc/landmines/pull/48) [`3a67b75`](https://github.com/interfere-inc/landmines/commit/3a67b756fa23b9ce635bb503296539648f707e39) Thanks [@skve](https://github.com/skve)! - Ship one `landmines` plugin and group its rules by Oxlint category.
  
  Breaking: the `landmines-testing`, `landmines-style`, `landmines-structure` and `landmines-types` plugins and their `@interfere/landmines/testing`, `/style`, `/structure` and `/types` entrypoints are gone. Register `{ "name": "landmines", "specifier": "@interfere/landmines" }` and rename rule keys to `landmines/<rule>`.
  
  Configurations now follow the categories: `recommended` (correctness and suspicious), `correctness`, `suspicious`, `pedantic`, `style`, `restriction` and `all`. Correctness, suspicious and restriction rules are errors; pedantic and style rules are warnings.

### Patch Changes

- [#46](https://github.com/interfere-inc/landmines/pull/46) [`b671898`](https://github.com/interfere-inc/landmines/commit/b671898fbdadc7f72c9acb25d50d5c565afaf074) Thanks [@skve](https://github.com/skve)! - Fix rule bugs reported in issues [#22](https://github.com/interfere-inc/landmines/issues/22) and [#37](https://github.com/interfere-inc/landmines/issues/37)–[#44](https://github.com/interfere-inc/landmines/issues/44): `no-test-doubles` recognises `vite-plus/test`; `strict-msw` requires every unhandled option to be strict; `no-flake-masking` ignores local bindings named like test functions and reports Playwright and Jest retries; `no-fixed-sleep` reports same-file sleep helpers and honours `jest.useFakeTimers()`; `package-exports` reports each manifest once; `colocated-tests` points at the `test/` directory that `test-file-names` accepts.

## 0.1.1

### Patch Changes

- [#18](https://github.com/interfere-inc/landmines/pull/18) [`2d8b03f`](https://github.com/interfere-inc/landmines/commit/2d8b03f2349c89eb6fe23003141259df2f8462fc) Thanks [@skve](https://github.com/skve)! - Add an `allow` option to `no-comments` listing the single-line comment prefixes to keep, defaulting to `["WARNING"]`, so `// SAFETY:` comments required by anti-slop can be allowed.

- [#12](https://github.com/interfere-inc/landmines/pull/12) [`e425043`](https://github.com/interfere-inc/landmines/commit/e425043a82afd73cb5600dd50eb3adb6536d0e75) Thanks [@skve](https://github.com/skve)! - Report `no-fixed-sleep` for timer callbacks with a block body or a function expression, such as `setTimeout(() => { resolve(); }, 100)`.

- [#19](https://github.com/interfere-inc/landmines/pull/19) [`2536897`](https://github.com/interfere-inc/landmines/commit/2536897dfd8cd57fb33b1eeadbb42b58a7f9de13) Thanks [@skve](https://github.com/skve)! - `no-fixed-sleep` now reports sleeps inside callbacks that run while a test or hook waits (`act`, `waitFor`, `then`, `catch`, `finally`, `step`), configurable with the `runNow` option.

- [#17](https://github.com/interfere-inc/landmines/pull/17) [`ef3e066`](https://github.com/interfere-inc/landmines/commit/ef3e066a3dbce65777d0a4d12e1a4f994ab26565) Thanks [@skve](https://github.com/skve)! - `no-flake-masking` now reports `testTimeout` and `hookTimeout` set in a Vitest config's `test` block, matching `vi.setConfig`.

- [#16](https://github.com/interfere-inc/landmines/pull/16) [`d9ef67b`](https://github.com/interfere-inc/landmines/commit/d9ef67bc1c7266d8927f1c4cc9d7490e6146166c) Thanks [@skve](https://github.com/skve)! - Report `no-unsignaled-poll` on `expect.poll` chains that end in a spy matcher such as `toHaveBeenCalledTimes`.

- [#13](https://github.com/interfere-inc/landmines/pull/13) [`67e447d`](https://github.com/interfere-inc/landmines/commit/67e447d702b5c7281e0f0888e971e35a638e70d3) Thanks [@skve](https://github.com/skve)! - `strict-msw` now accepts a quoted `"onUnhandledRequest"` key set to `"error"`.

- [#15](https://github.com/interfere-inc/landmines/pull/15) [`345c989`](https://github.com/interfere-inc/landmines/commit/345c9898485474cf56741fac6a4bc7bfe64a6ced) Thanks [@skve](https://github.com/skve)! - `strict-msw` accepts msw 3's `onUnhandledFrame` option and named handler functions declared in scope.

## 0.1.0

### Minor Changes

- [`d83cefe`](https://github.com/interfere-inc/landmines/commit/d83cefe0cc6ea79d21d16bf6c4b7e347f9b38e7e) Thanks [@skve](https://github.com/skve)! - Initial release: testing, style, structure and types plugins for Oxlint.
