import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect, test } from "vitest";
import { noElapsedTimeBound } from "./no-elapsed-time-bound";

const linter = new Linter();

const config: Linter.Config = {
  plugins: {
    testing: {
      rules: { elapsed: noElapsedTimeBound },
    } as unknown as ESLint.Plugin,
  },
  rules: { "testing/elapsed": "error" },
};

test.each([
  "expect(Date.now() - started).toBeLessThan(1500);",
  "expect(performance.now() - started).toBeLessThanOrEqual(1500);",
  "const elapsed = Date.now() - started; expect(elapsed).toBeLessThan(1500);",
  "const elapsed = performance.now() - started; expect(elapsed).not.toBeGreaterThan(1500);",
  "expect(started - Date.now()).not.toBeGreaterThanOrEqual(0);",
])("reports an elapsed-time upper bound: %s", (body) => {
  expect(
    linter
      .verify(`test('deadline', () => { ${body} });`, config, {
        filename: "fixture.test.js",
      })
      .map(({ messageId }) => messageId),
  ).toStrictEqual(["elapsed"]);
});

test.each([
  "test('delay', () => { expect(Date.now() - started).toBeGreaterThan(10); });",
  "test('delay', () => { expect(Date.now() - started).toBeGreaterThanOrEqual(10); });",
  "test('delay', () => { expect(Date.now() - started).not.toBeLessThan(10); });",
  "test('size', () => { expect(total - used).toBeLessThan(10); });",
  "test('clock', () => { vi.useFakeTimers(); expect(Date.now() - started).toBeLessThan(10); });",
  "beforeEach(() => vi.useFakeTimers()); test('clock', () => { expect(Date.now() - started).toBeLessThan(10); });",
  "describe('clock', () => { beforeEach(() => vi.useFakeTimers()); test('x', () => { expect(Date.now() - started).toBeLessThan(10); }); });",
  "const elapsed = Date.now() - started; test('x', () => { expect(elapsed).toBeLessThan(10); });",
  "test('scope', () => { const elapsed = Date.now() - started; { const elapsed = 1; expect(elapsed).toBeLessThan(10); } });",
])("allows lower bounds, other values, and fake timers: %s", (code) => {
  expect(
    linter.verify(code, config, { filename: "fixture.test.js" }),
  ).toStrictEqual([]);
});

test("a sibling fake-clock test does not hide a real-clock bound", () => {
  expect(
    linter
      .verify(
        "test('fake', () => { vi.useFakeTimers(); }); test('real', () => { expect(Date.now() - started).toBeLessThan(10); });",
        config,
        { filename: "fixture.test.js" },
      )
      .map(({ messageId }) => messageId),
  ).toStrictEqual(["elapsed"]);
});

test("ignores production files", () => {
  expect(
    linter.verify("expect(Date.now() - started).toBeLessThan(10);", config, {
      filename: "fixture.js",
    }),
  ).toStrictEqual([]);
});
