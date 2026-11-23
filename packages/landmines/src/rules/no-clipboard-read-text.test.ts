import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-clipboard-read-text-"));

const configuration = ruleConfiguration(
  directory,
  "testing/no-clipboard-read-text",
);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const reads = [
  "await expect(navigator.clipboard.readText()).resolves.toBe('s_1');",
  "await expect.poll(async () => navigator.clipboard.readText()).toContain('checkout-api');",
  "const original = await navigator.clipboard.readText();",
  "await expect.poll(navigator.clipboard.readText).toBe('x');",
  "await globalThis.navigator.clipboard.readText();",
  "await window.navigator.clipboard.readText();",
  "await navigator['clipboard']['readText']();",
];

const spies = [
  "const clipboard = vi.spyOn(navigator.clipboard, 'writeText'); expect(clipboard).toHaveBeenCalledWith('s_1');",
  "await navigator.clipboard.writeText('example');",
  "await expect(clipboard.mock.results[0]?.value).resolves.toBeUndefined();",
  "await reader.readText();",
  "await navigator.readText();",
  "await other.clipboard.readText();",
];

test.each(
  lintBatch(reads, false, "testing", configuration, "fixture.browser.test.tsx"),
)("reports a shared clipboard read in a browser test: %s", (_, result) => {
  expect(result.status).toBe(1);

  expect(result.output).toContain("landmines-testing(no-clipboard-read-text)");

  expect(result.output).toContain("vi.spyOn(navigator.clipboard, 'writeText')");
});

test.each(
  lintBatch(spies, false, "testing", configuration, "fixture.browser.test.tsx"),
)("accepts writeText spies and unrelated reads: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test.each(lintBatch(reads, false, "testing", configuration, "fixture.test.ts"))(
  "leaves non-browser test files alone: %s",
  (_, result) => {
    expect(result.status).toBe(0);
  },
);
