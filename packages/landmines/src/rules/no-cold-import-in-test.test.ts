import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect, test } from "vitest";
import { noColdImportInTest } from "./no-cold-import-in-test";

const linter = new Linter();

const config: Linter.Config = {
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: {
    testing: {
      rules: { cold: noColdImportInTest },
    } as unknown as ESLint.Plugin,
  },
  rules: { "testing/cold": "error" },
};

function messages(code: string) {
  return linter.verify(code, config).map(({ messageId }) => messageId);
}

test.each([
  'test("x", async () => { await import("./instrumentation.js"); });',
  'test.each([1])("x", async () => { await Promise.all([1].map(async () => import("./server.js"))); });',
  'it("x", async () => { await import(`./client.js`); });',
  'async function load() { vi.resetModules(); return import("./instrumentation.js"); } test("x", async () => { await load(); });',
  'const load = async () => import("./instrumentation.js"); test("x", async () => { await load(); });',
  'async function boot() { return import("./a.js"); } async function load() { return boot(); } test("x", async () => { await load(); });',
  'test("x", async () => { await load(); }); async function load() { return import("./a.js"); }',
  'describe("d", () => { test("x", async () => { await import("./a.js"); }); });',
])("reports a cold dynamic import only a test reaches: %s", (code) => {
  expect(messages(code)).toStrictEqual(["cold"]);
});

test.each([
  'beforeAll(async () => { await import("./instrumentation.js"); }); test("x", async () => { await import("./instrumentation.js"); });',
  'describe("d", () => { beforeAll(async () => { await import("./a.js"); }); test("x", async () => { await import("./a.js"); }); });',
  'test.beforeAll(async () => { await import("./a.js"); }); test("x", async () => { await import("./a.js"); });',
  'beforeEach(async () => { await import("./a.js"); }); test("x", () => { expect(1).toBe(1); });',
  'afterEach(async () => { await import("./a.js"); });',
  'test("x", async () => { onTestFinished(async () => { await import("./a.js"); }); });',
])(
  "reports the first cold import a hook makes directly, under its own message: %s",
  (code) => {
    expect(messages(code)).toStrictEqual(["coldHook"]);
  },
);

test("reports a hook's own cold import and a different one a test reaches", () => {
  const code =
    'beforeAll(async () => { await import("./b.js"); }); test("x", async () => { await import("./a.js"); });';

  expect(messages(code)).toStrictEqual(["coldHook", "cold"]);
});

test.each([
  'await import("./instrumentation.js"); test("x", async () => { await import("./instrumentation.js"); });',
  'import { register } from "./instrumentation.js"; test("x", async () => { await import("./instrumentation.js"); });',
  'import "./instrumentation"; test("x", async () => { await import("./instrumentation.js"); });',
  'async function load() { vi.resetModules(); return import("./a.js"); } beforeAll(async () => { await load(); }); test("x", async () => { await load(); });',
  'async function load() { return import("./a.js"); } await load(); test("x", async () => { await load(); });',
  'test("x", async ({ name }) => { await import(name); });',
  'async function load() { return import("./a.js"); } export const loaded = load;',
])("allows warm, hook and non-test imports: %s", (code) => {
  expect(messages(code)).toStrictEqual([]);
});

test("enforces the exact allowlisted count", () => {
  const code = 'test("x", async () => { await import("./a.js"); });';

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
