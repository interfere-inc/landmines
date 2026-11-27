# @interfere/landmines

## 0.4.0

### Minor Changes

- [#66](https://github.com/interfere-inc/landmines/pull/66) [`888d8aa`](https://github.com/interfere-inc/landmines/commit/888d8aac0d5bfa848b42a247f33138ffa5a083eb) Thanks [@shlomsh](https://github.com/shlomsh)! - `no-flake-masking` also reports Playwright's raised timeouts: `test.describe.configure({ timeout })`, `test.setTimeout`, `test.slow`, and the same calls on `testInfo` and `test.info()`. They count toward the existing `allow` entries.

### Patch Changes

- [#32](https://github.com/interfere-inc/landmines/pull/32) [`d437971`](https://github.com/interfere-inc/landmines/commit/d437971b59b9555a877829f9e943639120172f20) Thanks [@Afloat16](https://github.com/Afloat16)! - Resolve named polling imports from Vitest, Vite+ and Playwright while ignoring shadowed or unrelated bindings.

- [#26](https://github.com/interfere-inc/landmines/pull/26) [`374c98f`](https://github.com/interfere-inc/landmines/commit/374c98f9516e418d8e2ab54909595e07bbeab75f) Thanks [@Afloat16](https://github.com/Afloat16)! - Report fixed sleep promises returned from test, hook, and run-now callbacks, including concise arrow functions.

- [#28](https://github.com/interfere-inc/landmines/pull/28) [`2aeff9e`](https://github.com/interfere-inc/landmines/commit/2aeff9e7cedc6e73fc5dd4caabaf8291c2850d4c) Thanks [@Afloat16](https://github.com/Afloat16)! - Check effective MSW options after duplicate properties and object spreads so a later lenient setting cannot hide behind an earlier strict value.

- [#63](https://github.com/interfere-inc/landmines/pull/63) [`a5f80f0`](https://github.com/interfere-inc/landmines/commit/a5f80f06a8f9657c8a488f5d1f482656d85faff8) Thanks [@vanshb03](https://github.com/vanshb03)! - Stop treating `import { type Foo }` as a warm import, since TypeScript erases it.

- [#74](https://github.com/interfere-inc/landmines/pull/74) [`d340b45`](https://github.com/interfere-inc/landmines/commit/d340b45276b36b712632b82e8c9d76491044f64a) Thanks [@voiys](https://github.com/voiys)! - Allow explicit return types on self-recursive functions/methods and zero-argument `suspend`/`lazy` thunks (such as Effect `Schema.suspend` and Zod `z.lazy`), where TypeScript requires an explicit return annotation (`TS7022`/`TS7023`/`TS7024`).

- [#35](https://github.com/interfere-inc/landmines/pull/35) [`fb131b5`](https://github.com/interfere-inc/landmines/commit/fb131b5db2f4f2e1225044c9d6c5f0358c734aef) Thanks [@Afloat16](https://github.com/Afloat16)! - Preserve Vitest and Jest environment directives and their options so no-comments does not ask users to remove comments that select a test file's runtime environment.

- [#36](https://github.com/interfere-inc/landmines/pull/36) [`cb41ccd`](https://github.com/interfere-inc/landmines/commit/cb41ccdbb76da9f910a4ff8ab438fe21267a468f) Thanks [@Afloat16](https://github.com/Afloat16)! - Keep no-fixed-sleep active for real timer waits when another test or sibling suite uses fake timers. Preserve fake timer setup in the current test and its shared setup hooks.

- [#29](https://github.com/interfere-inc/landmines/pull/29) [`b7eff44`](https://github.com/interfere-inc/landmines/commit/b7eff4482cfb8cc38149777559326b85aaeccadd) Thanks [@Afloat16](https://github.com/Afloat16)! - Trace CommonJS requires and TypeScript import-equals declarations when identifying a test's implementation owner, including source-local companions and conditional package exports. Ignore locally shadowed require functions and type-only declarations.

## 0.3.2

### Patch Changes

- [#67](https://github.com/interfere-inc/landmines/pull/67) [`7bf9fe0`](https://github.com/interfere-inc/landmines/commit/7bf9fe0f1168674487be3743c4d2818324869b3b) Thanks [@Abhishek-B-R](https://github.com/Abhishek-B-R)! - Report per-byte hex encoding written as a `for`, `for...of` or `while` loop, or as a `reduce` callback, not only inside `map` and `Array.from`.

- [#62](https://github.com/interfere-inc/landmines/pull/62) [`7332482`](https://github.com/interfere-inc/landmines/commit/7332482789149b0d571743d2d8507de3a5ac6632) Thanks [@vanshb03](https://github.com/vanshb03)! - Report `++` and `--` on a property of an imported binding.

- [#69](https://github.com/interfere-inc/landmines/pull/69) [`9666c8e`](https://github.com/interfere-inc/landmines/commit/9666c8e7349b5ac325bc08cb3bb3a2a7ac0c516c) Thanks [@voiys](https://github.com/voiys)! - Report `Bun.sleepSync` calls in tests and hooks, and check Storybook `play` functions in `*.stories.*` files in `no-fixed-sleep`.

- [#64](https://github.com/interfere-inc/landmines/pull/64) [`4c385fe`](https://github.com/interfere-inc/landmines/commit/4c385fedc1bc4d657a9db84d8c482c261d456410) Thanks [@vanshb03](https://github.com/vanshb03)! - Stop reporting a container and a query that sit in opposite branches of a ternary.

- [#61](https://github.com/interfere-inc/landmines/pull/61) [`a022868`](https://github.com/interfere-inc/landmines/commit/a022868ef744845be8ab0ec9d2cd9ce9e6ea0668) Thanks [@mccalpink](https://github.com/mccalpink)! - Fix `declared-test-inputs` crashing with `EISDIR` when a package contains a directory named like a source file, such as a Next.js route segment `app/demo/embed.js/route.ts`. The package source scan now skips directories and reads regular files only.

- [#68](https://github.com/interfere-inc/landmines/pull/68) [`865ba83`](https://github.com/interfere-inc/landmines/commit/865ba830def002cc48344557560d7930b6cbdb44) Thanks [@skve](https://github.com/skve)! - Stop `max-exports-per-module` counting the Durable Object, Workflow and entrypoint classes a Cloudflare Worker's wrangler `main` exports because its wrangler config binds them.

## 0.3.1

### Patch Changes

- [#27](https://github.com/interfere-inc/landmines/pull/27) [`0763986`](https://github.com/interfere-inc/landmines/commit/07639861c438becbec97d537f1fda0ce117721b2) Thanks [@Afloat16](https://github.com/Afloat16)! - Report unsignaled recorder and spy polling through negated `expect.poll` matcher chains.

- [#31](https://github.com/interfere-inc/landmines/pull/31) [`2f61c6c`](https://github.com/interfere-inc/landmines/commit/2f61c6ccf7c0d4fa5d74dee82c0a4589c3780ed2) Thanks [@Afloat16](https://github.com/Afloat16)! - Check MSW namespace imports in strict-msw so setupServer and setupWorker cannot silently bypass unhandled-request enforcement.

- [#34](https://github.com/interfere-inc/landmines/pull/34) [`b66e626`](https://github.com/interfere-inc/landmines/commit/b66e626ee7a0625e10640bc5366198c804097c8f) Thanks [@Afloat16](https://github.com/Afloat16)! - Preserve public API TSDoc on local interfaces and type aliases reached through interface inheritance or class implementation clauses. Continue resolving lexical bindings and rejecting documentation on internal contracts.

- [#24](https://github.com/interfere-inc/landmines/pull/24) [`5ef684a`](https://github.com/interfere-inc/landmines/commit/5ef684a6d6d8bfc674b86af39762d8968e0eda50) Thanks [@Afloat16](https://github.com/Afloat16)! - Recognize namespace, default, and scheduler imports from timers/promises in no-fixed-sleep, and avoid treating shadowed timer bindings as real sleeps.

- [#25](https://github.com/interfere-inc/landmines/pull/25) [`f028349`](https://github.com/interfere-inc/landmines/commit/f02834932f842f9e14f0d0ba3608782fbe89cfcf) Thanks [@Afloat16](https://github.com/Afloat16)! - Detect retries and timeout overrides in test.each tagged-template tables as well as array tables.

- [#8](https://github.com/interfere-inc/landmines/pull/8) [`a577a08`](https://github.com/interfere-inc/landmines/commit/a577a08771dc4ccbfa488673055912806725c280) Thanks [@wra-sol](https://github.com/wra-sol)! - Cover `vi.waitUntil` in `no-unsignaled-poll`. It polls a condition the same way `vi.waitFor` polls an assertion, so a condition that reads request-recorder or spy state now reports instead of racing its timeout.

## 0.3.0

### Minor Changes

- [#55](https://github.com/interfere-inc/landmines/pull/55) [`087882c`](https://github.com/interfere-inc/landmines/commit/087882cea60032a34af31b7b33f5097d9f8a7830) Thanks [@skve](https://github.com/skve)! - `no-fixed-sleep` also reports Playwright's `waitForTimeout`, `waitForLoadState("networkidle")` and `waitUntil: "networkidle"` anywhere. `no-unsignaled-poll` also reports loops in test files that await until a clock deadline. The new `no-shared-signal` rule (suspicious) reports an `AbortSignal.timeout` stored at module or `describe` scope of a test file and a `const` `AbortController` shared by a file's tests.

## 0.2.2

### Patch Changes

- [#52](https://github.com/interfere-inc/landmines/pull/52) [`c91bac1`](https://github.com/interfere-inc/landmines/commit/c91bac19dda49178b7674265fdbaf112e1baa0c6) Thanks [@skve](https://github.com/skve)! - `no-imported-mutation` also reports `Object.assign`, `Object.defineProperty`, `Object.defineProperties`, `Reflect.set`, `Reflect.defineProperty`, `Reflect.deleteProperty` and `delete` on an imported binding, and checks `*.fixture.*` and `*.test-utils.*` files as well as `*.test.*` and `*.spec.*`.

## 0.2.1

### Patch Changes

- [#49](https://github.com/interfere-inc/landmines/pull/49) [`2e4767a`](https://github.com/interfere-inc/landmines/commit/2e4767a97a8b74becb488193488401e6dd1564cd) Thanks [@skve](https://github.com/skve)! - `package-scripts` accepts a `names` option to treat more task names, such as `build:js` and `build:types`, as standard.

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
