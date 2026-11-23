import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect, test } from "vitest";

import landmines from "./plugin";

const linter = new Linter();

function config(rule: string, allow?: Record<string, number>) {
  return {
    files: ["**/*.{js,ts,mts}"],
    plugins: { landmines: landmines as unknown as ESLint.Plugin },
    rules: {
      [`landmines/${rule}`]: allow ? ["error", { allow }] : "error",
    },
  } satisfies Linter.Config;
}

function verify(
  code: string,
  rule: string,
  allow?: Record<string, number>,
  filename = "src/feature.test.js",
) {
  return linter
    .verify(code, config(rule, allow), {
      filename,
    })
    .map(({ ruleId, messageId }) => ({ ruleId, messageId }));
}

test.each([
  "export default { test: { name: 'worker', maxWorkers: 1 } };",
  "export default { ['test']: { ['name']: 'worker', ['maxWorkers']: 1 } };",
])("reports ignored project concurrency in process: %s", (code) => {
  expect(
    verify(
      code,
      "no-project-max-workers",
      undefined,
      "vitest.worker.config.mts",
    ),
  ).toStrictEqual([
    {
      ruleId: "landmines/no-project-max-workers",
      messageId: "workers",
    },
  ]);
});

test.each([
  "export default { test: { maxWorkers: 1 } };",
  "export default { test: { name: 'worker', fileParallelism: false } };",
  "export default { other: { name: 'worker', maxWorkers: 1 } };",
  "export default { test: other };",
])("accepts effective concurrency settings in process: %s", (code) => {
  expect(
    verify(code, "no-project-max-workers", undefined, "vitest.config.ts"),
  ).toStrictEqual([]);
});

test("ignores non-Vitest configuration in process", () => {
  expect(
    verify(
      "export default { test: { name: 'worker', maxWorkers: 1 } };",
      "no-project-max-workers",
      undefined,
      "vite.config.ts",
    ),
  ).toStrictEqual([]);
});

test("reports elapsed upper bounds through the registered plugin", () => {
  expect(
    verify(
      "test('deadline', () => { const elapsed = performance.now() - started; expect(elapsed).toBeLessThanOrEqual(1000); });",
      "no-elapsed-time-bound",
    ),
  ).toStrictEqual([
    { ruleId: "landmines/no-elapsed-time-bound", messageId: "elapsed" },
  ]);
});

test("allows elapsed lower bounds through the registered plugin", () => {
  expect(
    verify(
      "test('delay', () => { expect(Date.now() - started).toBeGreaterThanOrEqual(1000); });",
      "no-elapsed-time-bound",
    ),
  ).toStrictEqual([]);
});

test.each([
  "await expect(navigator.clipboard.readText()).resolves.toBe('s_1');",
  "await expect.poll(async () => navigator.clipboard.readText()).toContain('x');",
  "const original = await window.navigator.clipboard.readText();",
])(
  "reports a shared clipboard read in a browser test in process: %s",
  (code) => {
    expect(
      verify(
        code,
        "no-clipboard-read-text",
        undefined,
        "src/feature.browser.test.ts",
      ),
    ).toStrictEqual([
      { ruleId: "landmines/no-clipboard-read-text", messageId: "read" },
    ]);
  },
);

test.each([
  "const clipboard = vi.spyOn(navigator.clipboard, 'writeText'); await expect(clipboard.mock.results[0]?.value).resolves.toBeUndefined();",
  "await navigator.clipboard.writeText('example');",
  "await reader.readText();",
])("accepts writeText spies in a browser test in process: %s", (code) => {
  expect(
    verify(
      code,
      "no-clipboard-read-text",
      undefined,
      "src/feature.browser.test.ts",
    ),
  ).toStrictEqual([]);
});

test("leaves clipboard reads outside browser tests in process", () => {
  expect(
    verify(
      "await expect(navigator.clipboard.readText()).resolves.toBe('s_1');",
      "no-clipboard-read-text",
    ),
  ).toStrictEqual([]);
});
