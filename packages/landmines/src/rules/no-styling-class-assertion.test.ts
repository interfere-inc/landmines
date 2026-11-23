import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lint, lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-styling-class-assertion-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function configuration(allow?: Record<string, number>) {
  return ruleConfiguration(
    directory,
    "testing/no-styling-class-assertion",
    allow && { allow },
  );
}

const invalid = [
  'expect(el).toHaveClass("text-disabled-foreground");',
  'await expect.element(el).toHaveClass("bg-disabled", "text-disabled-foreground");',
  "expect(el).toHaveClass(/text-secondary-foreground/u);",
  'expect(el).not.toHaveClass("bg-component");',
  'expect(el).toHaveClass("bg-transparent");',
  // oxlint-disable-next-line eslint/no-template-curly-in-string -- Fixture exercises a template literal argument.
  "expect(el).toHaveClass(`bg-(--${color}-a3)`);",
  'expect(el).toHaveClass("opacity-0");',
  'expect(el).toHaveClass("invisible");',
  'expect(el).toHaveClass("hidden", "dark:block");',
  'expect(el).toHaveClass("dark:hidden");',
  'expect(el).toHaveClass("sr-only");',
  'expect(el).toHaveClass("flex text-danger-foreground");',
];

const valid = [
  'expect(el).toHaveClass("rounded-full");',
  'expect(el).toHaveClass("absolute", "int-btn-pill");',
  'expect(el).toHaveClass("overflow-hidden");',
  "expect(el).toHaveClass(expectedClass);",
  'expect(el).toHaveClass("text-sm");',
  'expect(el).toHaveAttribute("class", "opacity-0");',
  'expect(el).toHaveTextContent("hidden");',
];

test.each(
  lintBatch(
    invalid,
    false,
    "testing",
    configuration(),
    "fixture.browser.test.tsx",
  ),
)("rejects the styling class assertion: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("Do not assert a styling class");
});

test.each(
  lintBatch(
    valid,
    false,
    "testing",
    configuration(),
    "fixture.browser.test.tsx",
  ),
)("allows layout classes and other assertions: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test.each(
  lintBatch(invalid, false, "testing", configuration(), "fixture.test.tsx"),
)("ignores files that are not browser tests: %s", (_, result) => {
  expect(result.status).toBe(0);
});

const countedCode = 'expect(el).toHaveClass("opacity-0");';

const exactCount = lint(
  countedCode,
  false,
  "testing",
  configuration({ "0/fixture.browser.test.tsx": 1 }),
  "fixture.browser.test.tsx",
);

const exceededCount = lint(
  countedCode + countedCode,
  false,
  "testing",
  configuration({ "0/fixture.browser.test.tsx": 1 }),
  "fixture.browser.test.tsx",
);

const staleCount = lint(
  'expect(el).toHaveClass("rounded-full");',
  false,
  "testing",
  configuration({ "0/fixture.browser.test.tsx": 1 }),
  "fixture.browser.test.tsx",
);

test("accepts the exact count and rejects additional assertions", () => {
  expect(exactCount.status).toBe(0);
  expect(exceededCount.status).toBe(1);
  expect(exceededCount.output).toContain("Do not assert a styling class");
});

test("requires deleting a stale allowlist entry", () => {
  expect(staleCount.status).toBe(1);
  expect(staleCount.output).toContain("This file now has 0");
});
