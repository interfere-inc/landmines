import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lint, lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-conditional-expect-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function configuration(allow?: Record<string, number>) {
  return ruleConfiguration(
    directory,
    "testing/no-conditional-expect",
    allow && { allow },
  );
}

const invalid = [
  "import {test, expect} from 'bun:test'; test('x', () => { if (ready) expect(value).toBe(1); });",
  "test('x', () => { const fake = () => { if (ready) expect(value).not.toBe(0); }; });",
  "test('x', () => { const fake = function() { switch(kind) { case 1: expect(value).resolves.toBe(1); } }; });",
  "test('x', () => { const fake = { run() { ready ? expect.soft(value).toBe(1) : work(); } }; });",
  "it('x', () => { ready && expect.element(el).toBeVisible(); });",
  "it('x', () => { ready || expect.poll(() => value).toBe(1); });",
  "it('x', () => { ready ?? expect(value).toBe(1); });",
  "test('x', () => { try { work(); } catch { expect(value).toBe(1); } });",
  "test.for([true])('x', flag => { function fake() { if (flag) expect(value).toBe(1); } });",
  "test('x', () => { if (ready) { const fake = () => expect(value).toBe(1); } });",
];

const valid = [
  "test('x', () => { expect(value).toBe(1); });",
  "function helper() { if (ready) expect(value).toBe(1); } test('x', helper);",
  "const helper = () => { if (ready) expect(value).toBe(1); }; test('x', () => helper());",
  "if (ready) test('x', () => { expect(value).toBe(1); });",
  "describe('x', () => { if (ready) expect(value).toBe(1); });",
  "test('x', () => { if (ready) expect.assertions(1); expect(value).toBe(1); });",
  "test('x', () => { expect(value).toBe(ready ? 1 : 2); });",
  "test('x', () => { if (expect(value).toBe(1)) work(); });",
  "test('x', () => { expect(value).toBe(1) && work(); });",
  "test('x', () => { try { expect(value).toBe(1); } catch { work(); } });",
];

test.each(
  lintBatch(invalid, false, "testing", configuration(), "fixture.test.ts"),
)("rejects the prohibited assertion shape: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("An expect inside a branch of a fake");
});

test.each(
  lintBatch(valid, false, "testing", configuration(), "fixture.test.ts"),
)("allows independent expectations and out-of-scope code: %s", (_, result) => {
  expect(result.status).toBe(0);
});

const countedCode = "test('x', () => { if (ready) expect(value).toBe(1); });";

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
  expect(exceededCount.output).toContain("An expect inside a branch of a fake");
});

test("requires deleting a stale allowlist entry", () => {
  expect(staleCount.status).toBe(1);
  expect(staleCount.output).toContain("This file now has 0");
});
