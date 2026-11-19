import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lint, lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-fixed-sleep-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function configuration(allow?: Record<string, number>) {
  return ruleConfiguration(
    directory,
    "testing/no-fixed-sleep",
    allow && { allow },
  );
}

const sleeps = [
  "test('x', async () => { await new Promise((resolve) => { setTimeout(resolve, 250); }); });",
  "test('x', async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });",
  "test('x', async () => { await new Promise<void>((done) => globalThis.setTimeout(() => done(), 31_000)); });",
  "it('x', async () => { await new Promise((resolve) => window.setTimeout(resolve, 600)); });",
  'import { setTimeout as sleep } from "node:timers/promises"; test("x", async () => { await sleep(500); });',
  'import { setTimeout } from "timers/promises"; afterEach(async () => { await setTimeout(20); });',
  "beforeEach(async () => { await scheduler.wait(10); });",
  "test('x', async () => { await Bun.sleep(100); });",
  "test.each([1])('x %s', async () => { await scheduler.wait(1); });",
  "test.concurrent('x', async () => { await scheduler.wait(1); });",
  "it.skipIf(ci)('x', async function () { await scheduler.wait(1); });",
  "test('x', async () => { await new Promise((resolve) => setTimeout(() => { resolve(); }, 100)); });",
  "test('x', async () => { await new Promise((resolve) => setTimeout(function () { resolve(); }, 100)); });",
  "it('x', async () => { await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 50)); }); });",
  "it('x', () => act(async () => { await scheduler.wait(1); }));",
  "test('x', async () => { await React.act(async () => { await act(async () => { await scheduler.wait(1); }); }); });",
  "test('x', async () => { await waitFor(async () => { await scheduler.wait(1); expect(ready).toBe(true); }); });",
  "test('x', async () => { await load().then(async () => { await Bun.sleep(5); }); });",
  "beforeEach(() => load().catch(async () => { await scheduler.wait(1); }));",
  "afterEach(() => load().finally(async () => { await scheduler.wait(1); }));",
  "test('x', async () => { await act(() => load().then(async () => { await scheduler.wait(1); })); });",
  "test('x', async () => { await test.step('open', async () => { await scheduler.wait(1); }); });",
];

const signals = [
  "test('x', async () => { await operation(); });",
  "test('x', async () => { const ready = Promise.withResolvers(); await ready.promise; });",
  "test('x', async () => { vi.useFakeTimers(); await new Promise((resolve) => { setTimeout(resolve, 250); }); });",
  "test('x', async () => { serve(async () => { await scheduler.wait(10); return new Response(); }); });",
  "async function backoff(attempt) { await scheduler.wait(2 ** attempt); } test('x', async () => { await backoff(1); });",
  "test('x', async () => { await Promise.race([work, new Promise((resolve) => { setTimeout(() => resolve('pending'), 0); })]); });",
  "test('x', async () => { await new Promise((resolve) => { setTimeout(resolve, 10); queueMicrotask(resolve); }); });",
  "test('x', async () => { await new Promise((resolve) => { emitter.once('done', resolve); }); });",
  'import { setImmediate } from "node:timers/promises"; test("x", async () => { await setImmediate(); });',
  "test('x', async () => { const timer = setTimeout(cancel, 10); await work(); clearTimeout(timer); });",
  "test('x', async ({ page }) => { await page.route(url, async (route) => { await scheduler.wait(300); await route.fulfill({ status: 200 }); }); });",
  "test('x', async () => { await server.listen(async () => { await scheduler.wait(10); }); });",
  "beforeEach(async () => { await run(async () => { await scheduler.wait(10); }); });",
  "test('x', async () => { await act(async () => { serve(async () => { await scheduler.wait(10); return new Response(); }); }); });",
  "async function settle() { await act(async () => { await scheduler.wait(1); }); } test('x', async () => { await settle(); });",
  "act(async () => { await scheduler.wait(1); });",
];

test.each(
  lintBatch(sleeps, false, "testing", configuration(), "fixture.test.ts"),
)("rejects a fixed sleep in a test or hook body: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("landmines-testing(no-fixed-sleep)");
  expect(result.output).toContain("Replace this fixed sleep with a signal");
});

test.each(
  lintBatch(signals, false, "testing", configuration(), "fixture.test.ts"),
)("allows signals, fake timers, and simulated latency: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test("reports sleeps in callbacks of configured run-now callees", () => {
  const result = lint(
    "test('x', async () => { await within(async () => { await scheduler.wait(1); }); });",
    false,
    "testing",
    ruleConfiguration(directory, "testing/no-fixed-sleep", {
      runNow: ["within"],
    }),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("Replace this fixed sleep with a signal");
});

test("replaces the default run-now callees when configured", () => {
  expect(
    lint(
      "test('x', async () => { await act(async () => { await scheduler.wait(1); }); });",
      false,
      "testing",
      ruleConfiguration(directory, "testing/no-fixed-sleep", {
        runNow: ["within"],
      }),
      "fixture.test.ts",
    ).status,
  ).toBe(0);
});

const twoSleeps =
  "test('x', async () => { await scheduler.wait(1); await scheduler.wait(2); });";

const mixedTimers =
  "test('fake', async () => { vi.useFakeTimers(); await new Promise((resolve) => setTimeout(resolve, 1)); vi.useRealTimers(); }); test('real', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });";

test.each([
  mixedTimers,
  "it('real', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); }); it('fake', () => { vi.useFakeTimers(); vi.useRealTimers(); });",
  "test.skip('fake', () => { vi.useFakeTimers(); }); test.each([1])('real %s', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "afterEach(() => { vi.useFakeTimers(); }); test('real', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "afterAll(() => { vi.useFakeTimers(); }); test('real', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "describe('fake', () => { beforeEach(() => { vi.useFakeTimers(); }); afterEach(() => { vi.useRealTimers(); }); test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); }); }); describe('real', () => { test('real', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); }); });",
  "suite.each([1])('fake %s', () => { beforeAll(() => { vi.useFakeTimers(); }); afterAll(() => { vi.useRealTimers(); }); test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); }); }); test('real', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "test('fake', () => { vi.useFakeTimers(); vi.useRealTimers(); }); test('real', () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 1)); }));",
])("reports only the real sleep in a mixed timer file: %s", (code) => {
  const result = lint(
    code,
    false,
    "testing",
    configuration(),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(
    result.output.match(/Replace this fixed sleep with a signal/gu),
  ).toHaveLength(1);
});

test.each([
  "beforeEach(() => { vi.useFakeTimers(); }); test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "beforeAll(() => { vi.useFakeTimers(); }); test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "describe('outer', () => { beforeEach(() => { vi.useFakeTimers(); }); describe('inner', () => { test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); }); }); });",
  "beforeEach(() => { vi.useFakeTimers(); }); suite('nested', () => { test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); }); });",
  "test('fake', async () => { await act(() => { vi.useFakeTimers(); }); await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "afterEach(async () => { vi.useFakeTimers(); await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "vi.useFakeTimers(); test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "function prepare() { vi.useFakeTimers(); } beforeEach(prepare); test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
  "describe('setup', () => { vi.useFakeTimers(); }); test('fake', async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });",
])("preserves the applicable fake timer setup: %s", (code) => {
  const result = lint(
    code,
    false,
    "testing",
    configuration(),
    "fixture.test.ts",
  );

  expect(result.status).toBe(0);
});

test("counts only real sleeps against a mixed file's allowance", () => {
  expect(
    lint(
      mixedTimers,
      false,
      "testing",
      configuration({ "0/fixture.test.ts": 1 }),
      "fixture.test.ts",
    ).status,
  ).toBe(0);
});

test("reports the real sleep count when a mixed file's allowance is stale", () => {
  const result = lint(
    mixedTimers,
    false,
    "testing",
    configuration({ "0/fixture.test.ts": 2 }),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("This file now has 1 fixed sleeps");
});

test("accepts a file exactly at its allowlisted count", () => {
  expect(
    lint(
      twoSleeps,
      false,
      "testing",
      configuration({ "0/fixture.test.ts": 2 }),
      "fixture.test.ts",
    ).status,
  ).toBe(0);
});

test("rejects sleeps beyond a file's allowlisted count", () => {
  const result = lint(
    twoSleeps,
    false,
    "testing",
    configuration({ "0/fixture.test.ts": 1 }),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("Replace this fixed sleep with a signal");
});

test("asks to lower an allowlist entry once its file has fewer sleeps", () => {
  const result = lint(
    "test('x', async () => { await operation(); });",
    false,
    "testing",
    configuration({ "0/fixture.test.ts": 1 }),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("This file now has 0 fixed sleeps");
});
