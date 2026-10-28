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

Or register only the plugins you want:

```json
{
  "jsPlugins": [
    { "name": "landmines-testing", "specifier": "@interfere/landmines/testing" }
  ],
  "rules": {
    "landmines-testing/no-test-doubles": "error"
  }
}
```

Requires Oxlint 1.81 or later and Node 22.18 or later.

## Rules

### `landmines-testing`

Tests that can't lie.

| Rule                 | What it stops                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-test-doubles`    | Replacing dependency behaviour in tests: module mocks, `vi.fn(impl)`, stubbed globals, patched prototypes, hand-written bindings and fake responses. Use the real implementation and MSW for the network. Observation-only spies are allowed. |
| `strict-msw`         | Starting MSW without `onUnhandledRequest: "error"`, so unmocked requests silently reach the network.                                                                                                                                          |
| `no-fixed-sleep`     | Awaiting a fixed real-time delay in a test or hook. Await the operation or a signal it emits.                                                                                                                                                 |
| `no-unsignaled-poll` | `expect.poll` and `vi.waitFor` on request recorders and spy state, which race a deadline instead of awaiting an event.                                                                                                                        |
| `no-flake-masking`   | Test retries and raised timeouts. A test that passes on rerun is a flake to fix.                                                                                                                                                              |

`no-fixed-sleep`, `strict-msw` and `no-flake-masking` accept a per-file
allowlist with an exact count, so you can adopt them in an existing codebase
and ratchet down:

```json
{
  "landmines-testing/no-flake-masking": [
    "error",
    { "allow": { "src/legacy/slow.test.ts": 2 } }
  ]
}
```

The rule reports when a file has fewer violations than its allowance, so the
list only shrinks.

### `landmines-style`

| Rule          | What it stops                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-comments` | Prose comments. Allowed: functional directives (`oxlint-disable`, `@ts-expect-error`, `/* @__PURE__ */`, licence headers…), single-line `// WARNING:` comments for dangerous recurring footguns, and TSDoc on exported public API. Rationale belongs in the PR. |

Pass `publicApi` (regular expressions matched against the file path) to allow
TSDoc only in your published packages:

```json
{
  "landmines-style/no-comments": ["error", { "publicApi": ["/packages/sdk/"] }]
}
```

### `landmines-structure`

| Rule              | What it stops                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `colocated-tests` | Tests detached from the implementation they import. Tests live beside their subject or in its local `tests/` directory.               |
| `test-file-names` | `.spec.ts`, `.tests.ts`, `helpers.ts`, `mocks.ts` and friends. Use `.test.ts`, `.fixture.ts` and `.test-utils.ts`.                    |
| `package-exports` | Unrestricted source exports such as `"./*": "./src/*.ts"`. Declare explicit entrypoints or named public namespaces in `package.json`. |

### `landmines-types`

| Rule                       | What it stops                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `no-explicit-return-types` | Annotated return types on implementations. Let them be inferred; pin a contract with `satisfies` where it matters. |

## Pairs well with

- [anti-slop](https://github.com/dmmulroy/anti-slop) for type-level slop:
  chained assertions, unsafe dictionaries, `unknown` plumbing.

## Contributing

```sh
bun install
bun run lint && bun run typecheck && bun run test
```

Add a changeset with `bun changeset` for any user-facing change.

## License

MIT
