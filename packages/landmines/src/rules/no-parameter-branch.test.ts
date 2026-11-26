import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lint, lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-parameter-branch-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function configuration(allow?: Record<string, number>) {
  return ruleConfiguration(
    directory,
    "testing/no-parameter-branch",
    allow && { allow },
  );
}

const invalid = [
  "test.each([true])('x', flag => { expect(value).toBe(flag ? 1 : 2); });",
  "it.for([true])('x', ({flag}) => { expect(flag ? 1 : 2).not.toBe(0); });",
  "test.each([[true]])('x', ([flag]) => { expect(value).resolves.toEqual(flag ? a : b); });",
  "describe.each([true])('group', flag => { test('x', () => { expect.element(el).not.toHaveTextContent(flag ? 'a' : 'b'); }); });",
  "test.each([true])('x', flag => { expect.poll(() => { if (flag) return 1; return 2; }).toBe(1); });",
  "test.each([true])('x', flag => { expect((() => { switch(flag) { case true: return 1; default: return 2; } })()).toBe(1); });",
  "test.concurrent.each([true])('x', function(flag = true) { expect(value).rejects.toEqual(flag ? a : b); });",
  // oxlint-disable-next-line eslint/no-template-curly-in-string -- Fixture exercises tagged-template test.each syntax.
  "test.each`flag\n${true}`('x', ({flag}) => { expect.soft(value).toBe(flag ? 1 : 2); });",
];

const valid = [
  "test.each([{expected: 1}])('x', ({expected}) => { expect(value).toBe(expected); });",
  "test.each([true])('x', flag => { const value = flag ? 1 : 2; expect(value).toBe(1); });",
  "test.each([true])('x', flag => { if (flag) setup(); expect(value).toBe(1); });",
  "test.each([true])('x', flag => { const fake = (flag) => expect(value).toBe(flag ? 1 : 2); });",
  "test.each([true])('x', flag => { expect(value).toBe(other ? 1 : 2); });",
  "test.each([true])('x', flag => { expect(value).toBe(object.flag ? 1 : 2); });",
  "test('x', flag => { expect(value).toBe(flag ? 1 : 2); });",
  "describe.each([true])('x', flag => { expect(value).toBe(flag ? 1 : 2); });",
  "test.each([true])('x', flag => { expect.assertions(flag ? 1 : 2); });",
];

test.each(
  lintBatch(invalid, false, "testing", configuration(), "fixture.test.ts"),
)("rejects the prohibited assertion shape: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("The expected value for a case belongs");
});

test.each(
  lintBatch(valid, false, "testing", configuration(), "fixture.test.ts"),
)("allows independent expectations and out-of-scope code: %s", (_, result) => {
  expect(result.status).toBe(0);
});

const countedCode =
  "test.each([true])('x', flag => { expect(value).toBe(flag ? 1 : 2); });";

const exactCount = lint(
  countedCode,
  false,
  "testing",
  configuration({ "0/fixture.test.ts": 1 }),
  "fixture.test.ts",
);

const exceededCount = lint(
  countedCode + countedCode,
  false,
  "testing",
  configuration({ "0/fixture.test.ts": 1 }),
  "fixture.test.ts",
);

const staleCount = lint(
  "test('x', () => { expect(value).toBe(1); });",
  false,
  "testing",
  configuration({ "0/fixture.test.ts": 1 }),
  "fixture.test.ts",
);

test("accepts the exact count and rejects additional assertions", () => {
  expect(exactCount.status).toBe(0);
  expect(exceededCount.status).toBe(1);

  expect(exceededCount.output).toContain(
    "The expected value for a case belongs",
  );
});

test("requires deleting a stale allowlist entry", () => {
  expect(staleCount.status).toBe(1);
  expect(staleCount.output).toContain("This file now has 0");
});
