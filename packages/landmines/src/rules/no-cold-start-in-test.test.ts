import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect, test } from "vitest";
import { noColdStartInTest } from "./no-cold-start-in-test";

const linter = new Linter();

const config: Linter.Config = {
  plugins: {
    testing: { rules: { cold: noColdStartInTest } } as unknown as ESLint.Plugin,
  },
  rules: { "testing/cold": "error" },
};

const harnessConfig: Linter.Config = {
  ...config,
  rules: {
    "testing/cold": ["error", { harnessModules: ["./harness", "./database"] }],
  },
};

const starts = [
  ['import { spawn as start } from "node:child_process";', 'start("bun")'],
  ['import * as child from "child_process";', 'child.execFile("bun")'],
  ['import { execa } from "execa";', 'execa("bun")'],
  ['import { $ } from "execa";', "$`bun --version`"],
  ["", 'Bun.spawn(["bun"])'],
  ['import { createVitest } from "vitest/node";', "createVitest({})"],
  ['import { chromium as engine } from "@playwright/test";', "engine.launch()"],
  ['import { Miniflare } from "miniflare";', "new Miniflare({})"],
  ['import { unstable_dev } from "wrangler";', 'unstable_dev("worker.ts")'],
  ["", "postgresContainer.start()"],
  ['import { generateProject } from "./project";', "generateProject()"],
];

test.each(starts)(
  "reports cold starts through nested callbacks: %s %s",
  (imports, call) => {
    expect(
      linter
        .verify(
          `${imports} test.each([1])('case', async () => { await Promise.all([1].map(async () => ${call})); });`,
          config,
        )
        .map(({ messageId }) => messageId),
    ).toStrictEqual(["cold"]);
  },
);

test.each([
  "test.beforeAll(async () => { await chromium.launch(); });",
  "beforeAll(async () => { await chromium.launch(); });",
  'test("x", () => { onTestFinished(async () => { await chromium.launch(); }); });',
  'test("x", () => { beforeEach(async () => { await chromium.launch(); }); });',
  "test.extend({ browser: async ({}, use) => { await use(await chromium.launch()); } });",
  'test("x", () => { const chromium = { launch() {} }; chromium.launch(); });',
  "async function fixture() { return chromium.launch(); }",
])("allows hooks, fixtures and shadowed imports: %s", (code) => {
  expect(
    linter.verify(`import { chromium } from "playwright"; ${code}`, config),
  ).toStrictEqual([]);
});

test("enforces the exact lifecycle exception count", () => {
  const code = 'test("x", () => { Bun.spawn(["bun"]); });';

  const options = {
    ...config,
    rules: { "testing/cold": ["error", { allow: { "fixture.js": 1 } }] },
  } satisfies Linter.Config;

  expect(
    linter.verify(code, options, { filename: "fixture.js" }),
  ).toStrictEqual([]);

  expect(
    linter
      .verify("", options, { filename: "fixture.js" })
      .map(({ messageId }) => messageId),
  ).toStrictEqual(["stale"]);
});

test.each([
  ['import { execSync } from "node:child_process";', 'execSync("ls")'],
  [
    'import { execFileSync as run } from "child_process";',
    'run("git", ["init"])',
  ],
  ['import * as child from "node:child_process";', 'child.execSync("ls")'],
])("reports synchronous process starts in a test: %s %s", (imports, call) => {
  expect(
    linter
      .verify(`${imports} test("x", () => { ${call}; });`, config)
      .map(({ messageId }) => messageId),
  ).toStrictEqual(["cold"]);
});

test.each([
  'function start() { return spawnSync("bun"); } test("x", () => { start(); });',
  'const start = () => spawnSync("bun"); test("x", () => { start(); });',
  'const start = function () { spawnSync("bun"); }; test("x", async () => { await start(); });',
  'function boot() { spawnSync("bun"); } function start() { boot(); } test("x", () => { start(); });',
  'test("x", () => { start(); }); function start() { spawnSync("bun"); }',
  'async function start() { await Promise.all([1].map(() => spawnSync("bun"))); } test.each([1])("x", async () => { await start(); });',
])("reports a local helper that starts a process: %s", (code) => {
  expect(
    linter
      .verify(`import { spawnSync } from "node:child_process"; ${code}`, config)
      .map(({ messageId }) => messageId),
  ).toStrictEqual(["cold"]);
});

test.each([
  'function start() { spawnSync("bun"); } beforeAll(() => { start(); });',
  'function start() { spawnSync("bun"); } test("x", () => { onTestFinished(() => start()); });',
  'function start() { return 1; } test("x", () => { start(); });',
  'function start() { spawnSync("bun"); } const started = start(); test("x", () => { expect(started).toBe(1); });',
  'function start() { other(); } function other() { return 1; } test("x", () => { start(); });',
])(
  "allows helpers outside tests and helpers that stay in process: %s",
  (code) => {
    expect(
      linter.verify(
        `import { spawnSync } from "node:child_process"; ${code}`,
        config,
      ),
    ).toStrictEqual([]);
  },
);

test.each([
  'import { execFile } from "node:child_process"; import { promisify } from "node:util"; const execute = promisify(execFile); test("x", async () => { await execute("bun"); });',
  'import { execFile } from "child_process"; import util from "util"; test("x", async () => { await util.promisify(execFile)("bun"); });',
  'import { createTestHarness } from "wrangler"; const server = createTestHarness(); test("x", async () => { await server.listen(); });',
])("reports promisified processes and Worker harness restarts: %s", (code) => {
  expect(
    linter.verify(code, config).map(({ messageId }) => messageId),
  ).toStrictEqual(["cold"]);
});

test.each([
  'import { createTestHarness } from "./harness"; const server = createTestHarness(); test("x", async () => { await server.update({ workers: [] }); });',
  'import { createTestHarness } from "./database"; const server = createTestHarness(); test("x", async () => { await server.reset(); });',
])("reports restarts of configured harness modules: %s", (code) => {
  expect(
    linter.verify(code, harnessConfig).map(({ messageId }) => messageId),
  ).toStrictEqual(["cold"]);

  expect(linter.verify(code, config)).toStrictEqual([]);
});

test.each([
  'import { execFile } from "node:child_process"; import { promisify } from "node:util"; const execute = promisify(execFile); beforeAll(async () => { await execute("bun"); });',
  'import { promisify } from "node:util"; const wait = promisify(setTimeout); test("x", async () => { await wait(1); });',
  'import { createTestHarness } from "wrangler"; const server = createTestHarness(); beforeAll(async () => { await server.listen(); }); test("x", async () => { await server.fetch("/"); });',
  'import { setupServer } from "msw/node"; const network = setupServer(); test("x", () => { network.listen(); });',
])(
  "allows in-process promisify, harness hooks and other servers: %s",
  (code) => {
    expect(linter.verify(code, config)).toStrictEqual([]);
  },
);
