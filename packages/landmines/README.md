# landmines

Oxlint rules that keep AI-written code honest.

Coding agents are fast, and they optimise for green checks. Left alone, they
mock the thing under test, sleep until a race usually goes their way, retry
the flake, raise the timeout, and narrate the diff in comments. Every one of
those passes CI. None of them is true.

`landmines` makes the honest path the only one that lints. Each rule fails
with a message that tells the agent (or the human) what to do instead, so the
fix lands in the same loop that tripped it.

Built and used in production at [Interfere](https://interfere.com).

## Install

```sh
bun add -d oxlint @interfere/landmines
```

Extend the recommended configuration in `.oxlintrc.json`:

```json
{
  "extends": ["./node_modules/@interfere/landmines/configs/recommended.json"]
}
```

Rules are grouped into Oxlint's categories, and each category ships as a
configuration you can layer:

| Configuration | Enables                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| `recommended` | `correctness` and `suspicious`                                                       |
| `correctness` | Code that is wrong: it does nothing, or it hides a failure. Errors.                  |
| `suspicious`  | Code that passes today and lies or flakes tomorrow. Errors.                          |
| `pedantic`    | Size and layout limits that pay off once a codebase is large. Warnings.              |
| `style`       | Formatting and idiom. Warnings.                                                      |
| `restriction` | Opinionated repository policy: comments, test placement, scripts and exports. Errors |
| `all`         | Every rule                                                                           |

```json
{
  "extends": [
    "./node_modules/@interfere/landmines/configs/recommended.json",
    "./node_modules/@interfere/landmines/configs/restriction.json"
  ]
}
```

Or register the plugin and pick rules yourself:

```json
{
  "jsPlugins": [{ "name": "landmines", "specifier": "@interfere/landmines" }],
  "rules": {
    "landmines/no-test-doubles": "error"
  }
}
```

Requires Oxlint 1.81 or later and Node 22.18 or later.

## Rules

### Correctness

| Rule                        | What it stops                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-conditional-expect`     | Assertions behind `if`, `&&`, `?:` or `catch`, including inside hand-written fakes, which pass silently when the branch is skipped.                                                                                                            |
| `no-silent-catch`           | A discarded promise with an empty rejection handler (`void p.catch(() => {})`), which makes failures disappear.                                                                                                                                |
| `strict-msw`                | Starting MSW without `onUnhandledFrame: "error"` (msw 3) or `onUnhandledRequest: "error"` (msw 2), or with either option lenient, so unmocked requests reach the network. msw 2 ignores `onUnhandledFrame`, so set `onUnhandledRequest` there. |
| `no-stale-render-assertion` | Reading a rendered hook value synchronously after polling other state. Poll the value itself.                                                                                                                                                  |
| `no-project-max-workers`    | `maxWorkers` inside a named Vitest project, which Vitest ignores for file scheduling. Use `fileParallelism: false`.                                                                                                                            |
| `no-self-container-query`   | Tailwind container-query variants (`@md:`) on the element that declares the container, which never match.                                                                                                                                      |

### Suspicious

| Rule                         | What it stops                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-test-doubles`            | Replacing dependency behaviour in tests: module mocks, `vi.fn(impl)`, stubbed globals, patched prototypes, hand-written bindings and fake responses. Use the real implementation and MSW for the network. Observation-only spies are allowed. |
| `no-fixed-sleep`             | Awaiting a fixed real-time delay in a test or hook, directly or through a same-file helper. Await the operation or a signal it emits.                                                                                                         |
| `no-unsignaled-poll`         | `expect.poll` and `vi.waitFor` on request recorders and spy state, which race a deadline instead of awaiting an event.                                                                                                                        |
| `no-flake-masking`           | Test retries and raised timeouts, per test, in Vitest and Playwright config, and through `jest.retryTimes`. A test that passes on rerun is a flake to fix.                                                                                    |
| `no-parameter-branch`        | Branching on a `test.each` parameter inside the test body. Put the expected value in the case table.                                                                                                                                          |
| `no-imported-mutation`       | Assigning to an imported module's object to inject test values. Pass them through options or bindings.                                                                                                                                        |
| `no-elapsed-time-bound`      | Upper bounds on elapsed wall-clock time (`expect(Date.now() - start).toBeLessThan(…)`), which fail on a loaded runner. Assert deadline ordering instead.                                                                                      |
| `no-cold-start-in-test`      | Spawning a process, browser, Miniflare or Wrangler runtime inside a test body, so the test timeout measures a cold start. Start it in `beforeAll`.                                                                                            |
| `no-cold-import-in-test`     | A dynamic `import()` only a test reaches, so the test timeout measures a cold module load. Import it once at module scope or in `beforeAll`.                                                                                                  |
| `no-styling-class-assertion` | Asserting Tailwind colour or visibility classes in `*.browser.test.tsx`. Assert the accessible state they encode.                                                                                                                             |
| `no-clipboard-read-text`     | `navigator.clipboard.readText()` in `*.browser.test.*` files, which share one clipboard across parallel files.                                                                                                                                |

`no-fixed-sleep` also reports sleeps in callbacks that run while the test
waits, such as `act(async () => …)` or `.then(async () => …)`. Callbacks passed
to other calls, like `page.route` handlers, are left alone. Pass `runNow` to
replace the default callee names (`act`, `waitFor`, `then`, `catch`, `finally`,
`step`), matched against a call's function or method name:

```json
{
  "landmines/no-fixed-sleep": [
    "error",
    {
      "runNow": ["act", "waitFor", "then", "catch", "finally", "step", "within"]
    }
  ]
}
```

`no-cold-start-in-test` recognises restarts of Wrangler's `createTestHarness`.
Pass `harnessModules` to also cover modules that re-export it:

```json
{
  "landmines/no-cold-start-in-test": [
    "error",
    { "harnessModules": ["@acme/test-utils/workers"] }
  ]
}
```

`no-test-doubles` recognises bindings passed to Hono apps built with `new Hono()`
or `new OpenAPIHono()`. Pass `appFactories` to name your own app factories:

```json
{
  "landmines/no-test-doubles": [
    "error",
    { "appFactories": [{ "name": "createApp", "from": "@acme/http" }] }
  ]
}
```

### Pedantic

| Rule                      | What it stops                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `max-file-lines`          | Source files over 500 lines (`max` to change), excluding tests and generated files.                                                                          |
| `max-exports-per-module`  | Modules exporting more than 6 names (`max` to change).                                                                                                       |
| `max-files-per-directory` | More than 20 source files directly in one directory (`max` to change).                                                                                       |
| `no-prefix-cluster`       | Sibling modules sharing a name prefix (`user-create.ts`, `user-delete.ts`, `user-list.ts`) instead of a folder.                                              |
| `declared-test-inputs`    | A package test reading files outside its package without declaring them as Turbo `test` inputs, so cached runs and `--changed` skip it. For Turbo monorepos. |

The rules that count files, lines or names accept an `allow` map from a path
(relative to the working directory) to its current count. An entry fails when
the count grows past it and when it shrinks, so the list only goes down:

```json
{
  "landmines/max-file-lines": [
    "warn",
    { "max": 400, "allow": { "src/legacy/parser.ts": 812 } }
  ]
}
```

### Style

| Rule                         | What it stops                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `padding-between-statements` | Statements packed without blank lines, outside compact declaration, assertion, assignment and import groups. Autofixes. |
| `no-inline-hex-encoding`     | Per-byte `toString(16).padStart(2, "0")` hex loops. Use `Uint8Array.prototype.toHex()` or one shared helper.            |
| `no-explicit-return-types`   | Annotated return types on implementations. Let them be inferred; pin a contract with `satisfies` where it matters.      |

### Restriction

| Rule                             | What it stops                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-comments`                    | Prose comments. Allowed: functional directives (`oxlint-disable`, `@ts-expect-error`, `/* @__PURE__ */`, licence headers…), single-line `// WARNING:` comments for dangerous recurring footguns (configurable with `allow`), and TSDoc on exported public API. Rationale belongs in the PR. |
| `colocated-tests`                | Tests detached from the implementation they import. Tests live beside their subject or in its local `test/` directory.                                                                                                                                                                      |
| `test-file-names`                | `.spec.ts`, `.tests.ts`, `helpers.ts`, `mocks.ts` and friends. Use `.test.ts`, `.fixture.ts` and `.test-utils.ts`.                                                                                                                                                                          |
| `test-dir-only-cross-functional` | Unit tests in `test/` directories. Those hold end-to-end, integration, runtime and black-box suites only.                                                                                                                                                                                   |
| `package-exports`                | Unrestricted source exports such as `"./*": "./src/*.ts"`. Declare explicit entrypoints or named public namespaces in `package.json`.                                                                                                                                                       |
| `no-scripts-directory`           | Code in `scripts/` folders. Use the framework, vendor CLI or maintained GitHub Action that owns the job, or put the code in the package that owns it.                                                                                                                                       |
| `no-github-scripts`              | `.ts`, `.sh` and `.py` files under `.github`. Use native tool features and maintained Actions.                                                                                                                                                                                              |
| `package-scripts`                | `package.json` scripts with bespoke names (`build:xyz`) or that run a TypeScript file with `bun`/`node`. Keep to standard task names that call a tool. A warning in the shipped configurations.                                                                                             |

Pass `publicApi` (regular expressions matched against the file path) to allow
TSDoc only in your published packages:

```json
{
  "landmines/no-comments": ["error", { "publicApi": ["/packages/sdk/"] }]
}
```

Pass `allow` to choose which single-line comment prefixes are kept. It defaults
to `["WARNING"]`; add `"SAFETY"` to keep the `// SAFETY:` comments that
[anti-slop](https://github.com/dmmulroy/anti-slop)'s
`require-safety-comment-for-type-assertion` requires:

```json
{
  "landmines/no-comments": ["error", { "allow": ["WARNING", "SAFETY"] }]
}
```

`test-dir-only-cross-functional` treats Playwright, `cloudflare:test` `SELF`
and Worker `exports.default` suites as cross-functional. Pass `crossFunctional`
(regular expressions matched against the test's source) to add your own
harnesses:

```json
{
  "landmines/test-dir-only-cross-functional": [
    "error",
    { "crossFunctional": ["[\"']@acme/test-harness[\"']"] }
  ]
}
```

### Allowlists

`no-fixed-sleep`, `strict-msw`, `no-flake-masking`, `no-unsignaled-poll`,
`no-conditional-expect`, `no-parameter-branch`, `no-imported-mutation`,
`no-cold-start-in-test`, `no-cold-import-in-test`,
`no-styling-class-assertion` and `declared-test-inputs` accept a per-file
allowlist with an exact count, so you can adopt them in an existing
codebase and ratchet down:

```json
{
  "landmines/no-flake-masking": [
    "error",
    { "allow": { "src/legacy/slow.test.ts": 2 } }
  ]
}
```

The rule reports when a file has fewer violations than its allowance, so the
list only shrinks.

## Pairs well with

- [anti-slop](https://github.com/dmmulroy/anti-slop) for type-level slop:
  chained assertions, unsafe dictionaries, `unknown` plumbing.

## Contributing

```sh
bun install
bun run lint && bun run typecheck && bun run test
```

Add a changeset with `bun changeset` for any user-facing change. Every rule
needs a category in `packages/landmines/src/categories.ts`; the configurations
in `packages/landmines/configs` must match it, which the tests check.

## License

MIT
