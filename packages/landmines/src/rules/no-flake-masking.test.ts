import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

import { lintBatch } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "oxlint-flake-masking-"));

function createConfig(
  name: string,
  options?: { allow: Record<string, number> },
) {
  const config = join(directory, `${name}.json`);

  writeFileSync(
    config,
    JSON.stringify({
      categories: { correctness: "off" },
      jsPlugins: [
        {
          name: "landmines",
          specifier: fileURLToPath(new URL("../plugin.ts", import.meta.url)),
        },
      ],
      rules: {
        "landmines/no-flake-masking": options ? ["error", options] : "error",
      },
    }),
  );

  return config;
}

const config = createConfig("strict");

const allowed = createConfig("allowed", {
  allow: { "src/slow/build.test.ts": 1, "vitest.config.ts": 2 },
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const retries = [
  'test("loads", { retry: 2 }, async () => {});',
  'it("loads", { retry: 2 }, async () => {});',
  'describe("loader", { retry: 3 }, () => {});',
  'test.concurrent("loads", { retry: 1 }, async () => {});',
  'test.each([1, 2])("loads %i", { retry: 1 }, async () => {});',
  `test.each\`value\n\${1}\`("loads $value", { retry: 1 }, async () => {});`,
  `it.concurrent.each\`value\n\${1}\`("loads $value", async () => {}, { retry: 2 });`,
  `describe.each\`value\n\${1}\`("loader $value", { retry: 3 }, () => {});`,
  'test("loads", async () => {}, { retry: 2 });',
  "vi.setConfig({ retry: 2 });",
  "export default defineConfig({ test: { retry: 2 } });",
  "export default defineConfig({ test: { retry: process.env.CI ? 2 : 0 } });",
  "export default defineConfig({ test: { projects: [{ test: { name: 'node', retry: 1 } }] } });",
  'import { defineConfig } from "@playwright/test";\nexport default defineConfig({ retries: 2 });',
  'import { defineConfig } from "@playwright/test";\nexport default defineConfig({ projects: [{ name: "chromium", retries: 3 }] });',
  'import { test } from "@playwright/test";\ntest.describe.configure({ retries: 2 });',
  'import { jest } from "@jest/globals";\njest.retryTimes(3);',
  "jest.retryTimes(1);",
];

const timeouts = [
  'test("loads", async () => {}, 60_000);',
  'it("loads", async () => {}, 30000);',
  'test("loads", async () => {}, LONG_TIMEOUT);',
  'test("loads", async () => {}, 2 * 60_000);',
  'test("loads", { timeout: 60_000 }, async () => {});',
  'test("loads", async () => {}, { timeout: 60_000 });',
  'test.each([1])("loads %i", async () => {}, 20_000);',
  `test.each\`value\n\${1}\`("loads $value", async () => {}, 20_000);`,
  `it.each\`value\n\${1}\`("loads $value", { timeout: 20_000 }, async () => {});`,
  `describe.each\`value\n\${1}\`("loader $value", () => {}, { timeout: 20_000 });`,
  'test.skipIf(ci)("loads", async () => {}, 20_000);',
  'describe("loader", { timeout: 60_000 }, () => {});',
  'import { test } from "bun:test";\ntest("loads", async () => {}, 60_000);',
  'import { test as base } from "@playwright/test";\nconst test = base.extend({});\ntest("loads", async () => {}, 60_000);',
  'import { test } from "./fixtures";\ntest("loads", async () => {}, 60_000);',
  "vi.setConfig({ testTimeout: 45_000 });",
  "vi.setConfig({ hookTimeout: 45_000 });",
  "export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 60_000 } });",
  "export default defineConfig({ test: { testTimeout: 60000, hookTimeout: 60000 } });",
  "export default defineConfig({ test: { projects: [{ test: { name: 'e2e', testTimeout: 60_000 } }] } });",
  'import { test } from "@playwright/test";\ntest.describe.configure({ timeout: 60_000 });',
  'import { test } from "@playwright/test";\ntest.describe.configure({ timeout: 0 });',
  'import { test } from "@playwright/test";\ntest.describe.configure({ mode: "serial", timeout: 60_000 });',
  'import { test as base } from "./fixtures";\nconst test = base.extend({});\ntest.describe.configure({ timeout });',
  'import { test } from "@playwright/test";\ntest.setTimeout(60_000);',
  'import { test } from "@playwright/test";\ntest.setTimeout(0);',
  'import { test } from "@playwright/test";\ntest.slow();',
  'import { test } from "@playwright/test";\ntest.slow(browserName === "firefox", "firefox is slow");',
  'import { test } from "@playwright/test";\ntest.slow(({ browserName }) => browserName === "firefox", "firefox is slow");',
  'import { test } from "@playwright/test";\ntest.info().setTimeout(60_000);',
  'import { test } from "@playwright/test";\ntest.info().slow();',
  'import { test } from "./fixtures";\ntest.setTimeout(60_000);',
  'import { test as base } from "./fixtures";\nconst test = base.extend({});\ntest("x", async () => { test.slow(); });',
  'import { test as it } from "./fixtures";\nit.setTimeout(60_000);',
  'import { test } from "@playwright/test";\ntest("x", async ({ page }, testInfo) => { testInfo.setTimeout(60_000); });',
  'import { test } from "@playwright/test";\ntest("x", async ({ page }, testInfo) => { testInfo.slow(); });',
  'import { test } from "@playwright/test";\ntest.beforeEach(async ({ page }, testInfo) => { testInfo.setTimeout(60_000); });',
  'import { test } from "@playwright/test";\ntest.only("x", async ({ page }, testInfo) => { testInfo.slow(); });',
  'import { test } from "@playwright/test";\ntest("x", async ({ page }, testInfo) => { await test.step("y", async () => { testInfo.setTimeout(60_000); }); });',
];

const valid = [
  'test("loads", async () => {});',
  'test("loads", { tags: ["slow"] }, async () => {});',
  'test("loads", { concurrent: true }, function load() {});',
  'test.each([1, 2])("loads %i", async () => {});',
  `test.each\`value\n\${1}\`("loads $value", async () => {});`,
  `it.concurrent.each\`value\n\${1}\`("loads $value", { tags: ["slow"] }, async () => {});`,
  `test.each\`input\n\${{ retry: 2, timeout: 30_000 }}\`("loads $input", async () => {});`,
  "beforeAll(async () => { await server.listen(); }, 60_000);",
  "afterAll(() => server.close(), 30_000);",
  "await expect.poll(() => count(), { timeout: 5_000 }).toBe(1);",
  "await vi.waitFor(() => expect(count()).toBe(1), { timeout: 5_000 });",
  "const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });",
  "queue.retry({ delaySeconds: 30 });",
  "const policy = { retry: { maxAttempts: 1 } };",
  "vi.setConfig({ fakeTimers: { now: 0 } });",
  'function describe(value: string, suffix: string, options: { separator: string }) { return value + options.separator + suffix; }\nconst options = { separator: " " };\nexport const label = describe("first", "second", options);',
  'const suite = { add(name: string, input: string, expected: number) {} };\nsuite.add("parses dates", "2026-01-01", 3);',
  "const test = (name: string, input: string, at: Date) => name;\ntest('recording', 'r1', new Date());",
  'import { defineConfig } from "@playwright/test";\nexport default defineConfig({ retries: 0 });',
  "jest.retryTimes(0);",
  "export default defineConfig({ retries: 2 });",
  "const flaky = { describe: { configure() {} } };\nflaky.describe.configure({ retries: 2 });",
  "setTimeout(resolve, 100);",
  "window.setTimeout(resolve, 100);",
  "globalThis.setTimeout(resolve, 100);",
  "const test = { setTimeout() {}, slow() {} };\ntest.setTimeout(5_000);\ntest.slow();",
  "function run(test) { test.setTimeout(5_000); test.slow(); }",
  'import { clock } from "./clock";\nclock.setTimeout(resolve, 100);',
  'import { page } from "./page";\npage.setDefaultTimeout(5_000);',
  "const flaky = { describe: { configure() {} } };\nflaky.describe.configure({ timeout: 1 });",
  'import { test } from "@playwright/test";\ntest.describe.configure({ mode: "parallel" });',
  'import { test } from "@playwright/test";\ntest("x", async ({ page }, testInfo) => { const inner = (testInfo) => { testInfo.setTimeout(5); }; });',
  "function wait(page, testInfo) { testInfo.setTimeout(5); }",
  'test.each(rows)("x", (row, clock) => clock.setTimeout(5));',
  'test("x", (clock) => { clock.setTimeout(5); });',
  'import { test } from "./fixtures";\ntest.slow("loads", async () => {});',
  `import { test } from "./fixtures";\ntest.slow(\`loads \${name}\`, async () => {});`,
];

test.each(lintBatch(retries, false, "testing", config))(
  "rejects test retries: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("Do not retry tests");
  },
);

test.each(lintBatch(timeouts, false, "testing", config))(
  "rejects timeout bumps: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("Do not raise a test's timeout");
  },
);

test.each(lintBatch(valid, false, "testing", config))(
  "accepts tests that do not mask flakes: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test.each(
  lintBatch(
    [
      'test("builds", async () => {}, 120_000);',
      'test("builds", { timeout: 120_000 }, async () => {});',
    ],
    false,
    "testing",
    allowed,
    "src/slow/build.test.ts",
  ),
)("accepts timeouts in allowlisted files: %s", (_code, result) => {
  expect(result.status).toBe(0);
});

test.each(
  lintBatch(
    [
      "export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });",
    ],
    false,
    "testing",
    allowed,
    "vitest.config.ts",
  ),
)("accepts config timeouts in allowlisted files: %s", (_code, result) => {
  expect(result.status).toBe(0);
});

test.each(
  lintBatch(
    ['test("builds", { retry: 2 }, async () => {});'],
    false,
    "testing",
    allowed,
    "src/slow/build.test.ts",
  ),
)("still rejects retries in allowlisted files: %s", (_code, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("Do not retry tests");
});

test.each(
  lintBatch(
    ['test("builds", async () => {}, 120_000);'],
    false,
    "testing",
    allowed,
    "src/fast/build.test.ts",
  ),
)("rejects timeouts outside the allowlist: %s", (_code, result) => {
  expect(result.status).toBe(1);
});

test.each(
  lintBatch(
    ['test("builds", async () => {});'],
    false,
    "testing",
    allowed,
    "src/slow/build.test.ts",
  ),
)("rejects allowlisted files without timeouts: %s", (_code, result) => {
  expect(result.status).toBe(1);

  expect(result.output).toContain("lower its no-flake-masking allowlist entry");
});

test.each(
  lintBatch(
    [
      'test("builds", async () => {}, 120_000);\ntest("links", async () => {}, 120_000);',
    ],
    false,
    "testing",
    allowed,
    "src/slow/build.test.ts",
  ),
)("rejects timeouts beyond the allowlisted count: %s", (_code, result) => {
  expect(result.status).toBe(1);

  expect(result.output).toContain("Do not raise a test's timeout");
});

test.each(
  lintBatch(
    ['import { test } from "@playwright/test";\ntest.setTimeout(120_000);'],
    false,
    "testing",
    allowed,
    "src/slow/build.test.ts",
  ),
)(
  "accepts one Playwright timeout in allowlisted files: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test.each(
  lintBatch(
    [
      'import { test } from "@playwright/test";\ntest.slow();\ntest.setTimeout(1);',
    ],
    false,
    "testing",
    allowed,
    "src/slow/build.test.ts",
  ),
)(
  "rejects Playwright timeouts beyond the allowlisted count: %s",
  (_code, result) => {
    expect(result.status).toBe(1);

    expect(result.output).toContain("Do not raise a test's timeout");

    expect(result.output.match(/Do not raise a test's timeout/gu)).toHaveLength(
      2,
    );
  },
);

test.each(
  lintBatch(
    [
      'import { test } from "@playwright/test";\ntest.slow(cond, "why");',
      'import { test } from "@playwright/test";\ntest.setTimeout(60_000);',
    ],
    false,
    "testing",
    config,
  ),
)("reports a Playwright timeout call once: %s", (_code, result) => {
  expect(JSON.parse(result.output)).toHaveLength(1);
});
