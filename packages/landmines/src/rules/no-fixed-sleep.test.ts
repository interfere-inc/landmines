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
