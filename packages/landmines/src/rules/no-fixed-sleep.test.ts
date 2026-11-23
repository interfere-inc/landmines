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
  'import * as timers from "node:timers/promises"; test("x", async () => { await timers.setTimeout(20); });',
  'import timers from "timers/promises"; test("x", async () => { await timers.setTimeout(20); });',
  'import * as timers from "timers/promises"; afterEach(async () => { await timers["setTimeout"](20); });',
  'import { scheduler as timerScheduler } from "node:timers/promises"; test("x", async () => { await timerScheduler.wait(20); });',
  'import * as timers from "node:timers/promises"; test("x", async () => { await timers.scheduler.wait(20); });',
  'import timers from "timers/promises"; test("x", async () => { await timers["scheduler"]["wait"](20); });',
  'import { "setTimeout" as sleep } from "node:timers/promises"; test("x", async () => { await sleep(20); });',
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
  "const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)); test('x', async () => { await sleep(200); });",
  "test('x', async () => { await pause(200); }); function pause(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); }",
  "const nap = function (ms) { return Bun.sleep(ms); }; beforeEach(async () => { await nap(5); });",
  'import { setTimeout as wait } from "node:timers/promises"; const sleep = (ms) => wait(ms); test("x", async () => { await sleep(5); });',
  "test('x', async () => { jest.useRealTimers(); await scheduler.wait(1); });",
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
  'import * as timers from "node:timers/promises"; test("x", async () => { await timers.setImmediate(); });',
  'import * as timers from "./timers"; test("x", async () => { await timers.setTimeout(20); });',
  'import { setTimeout as sleep } from "node:timers/promises"; test("x", async (sleep) => { await sleep(20); });',
  'import * as timers from "node:timers/promises"; test("x", async (timers) => { await timers.setTimeout(20); });',
  'const scheduler = { wait: operation }; test("x", async () => { await scheduler.wait(20); });',
  "test('x', async () => { const timer = setTimeout(cancel, 10); await work(); clearTimeout(timer); });",
  "test('x', async ({ page }) => { await page.route(url, async (route) => { await scheduler.wait(300); await route.fulfill({ status: 200 }); }); });",
  "test('x', async () => { await server.listen(async () => { await scheduler.wait(10); }); });",
  "beforeEach(async () => { await run(async () => { await scheduler.wait(10); }); });",
  "test('x', async () => { await act(async () => { serve(async () => { await scheduler.wait(10); return new Response(); }); }); });",
  "async function settle() { await act(async () => { await scheduler.wait(1); }); } test('x', async () => { await settle(); });",
  "act(async () => { await scheduler.wait(1); });",
  'import { expect, jest, test } from "@jest/globals"; test("x", async () => { jest.useFakeTimers({ advanceTimers: true }); await new Promise((resolve) => setTimeout(resolve, 200)); expect(1).toBe(1); });',
  'import { jest, test } from "bun:test"; test("x", async () => { jest.useFakeTimers(); await new Promise((resolve) => setTimeout(resolve, 200)); });',
  "const load = (id) => fetch(id); test('x', async () => { await load('a'); });",
  "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); export async function retry() { await sleep(5); }",
];

test.each(
  lintBatch(sleeps, false, "testing", configuration(), "fixture.test.ts"),
)("rejects a fixed sleep in a test or hook body: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("landmines(no-fixed-sleep)");
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

const timedWaits = [
  "test('x', async ({ page }) => { await page.waitForTimeout(5000); });",
  "export async function settle(page) { await page.waitForTimeout(SETTLE_MS); }",
  "export async function open(frame) { await frame.waitForLoadState('networkidle'); }",
  "test('x', async ({ page }) => { await page.goto(url, { waitUntil: 'networkidle' }); });",
  "await page.goto(url, { waitUntil: 'networkidle0' });",
  "test('x', async ({ page }) => { vi.useFakeTimers(); await page.waitForTimeout(1); });",
];

const signaledWaits = [
  "test('x', async ({ page }) => { await expect(page.getByText('Saved')).toBeVisible(); });",
  "test('x', async ({ page }) => { await page.waitForLoadState('domcontentloaded'); });",
  "test('x', async ({ page }) => { await page.goto(url, { waitUntil: 'load' }); });",
  "test('x', async ({ page }) => { await page.waitForResponse('**/api/save'); });",
  "const options = { waitUntil: idle };",
];

test.each(
  lintBatch(timedWaits, false, "testing", configuration(), "fixture.e2e.ts"),
)("rejects a timed Playwright wait anywhere: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("landmines(no-fixed-sleep)");
  expect(result.output).toContain("Replace this timed Playwright wait");
});

test.each(
  lintBatch(signaledWaits, false, "testing", configuration(), "fixture.e2e.ts"),
)("allows Playwright waits on page state: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test("counts timed waits toward the file's allowlist entry", () => {
  expect(
    lint(
      "test('x', async ({ page }) => { await scheduler.wait(1); await page.waitForTimeout(1); });",
      false,
      "testing",
      configuration({ "0/fixture.e2e.ts": 2 }),
      "fixture.e2e.ts",
    ).status,
  ).toBe(0);
});
