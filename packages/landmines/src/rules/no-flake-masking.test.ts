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
          name: "landmines-testing",
          specifier: fileURLToPath(
            new URL("../plugins/testing.ts", import.meta.url),
          ),
        },
      ],
      rules: {
        "landmines-testing/no-flake-masking": options
          ? ["error", options]
          : "error",
      },
    }),
  );

  return config;
}

const config = createConfig("strict");

const allowed = createConfig("allowed", {
  allow: { "src/slow/build.test.ts": 1 },
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const retries = [
  'test("loads", { retry: 2 }, async () => {});',
  'it("loads", { retry: 2 }, async () => {});',
  'describe("loader", { retry: 3 }, () => {});',
  'test.concurrent("loads", { retry: 1 }, async () => {});',
  'test.each([1, 2])("loads %i", { retry: 1 }, async () => {});',
  'test("loads", async () => {}, { retry: 2 });',
  "vi.setConfig({ retry: 2 });",
  "export default defineConfig({ test: { retry: 2 } });",
  "export default defineConfig({ test: { retry: process.env.CI ? 2 : 0 } });",
  "export default defineConfig({ test: { projects: [{ test: { name: 'node', retry: 1 } }] } });",
];

const timeouts = [
  'test("loads", async () => {}, 60_000);',
  'it("loads", async () => {}, 30000);',
  'test("loads", async () => {}, LONG_TIMEOUT);',
  'test("loads", async () => {}, 2 * 60_000);',
  'test("loads", { timeout: 60_000 }, async () => {});',
  'test("loads", async () => {}, { timeout: 60_000 });',
  'test.each([1])("loads %i", async () => {}, 20_000);',
  'test.skipIf(ci)("loads", async () => {}, 20_000);',
  'describe("loader", { timeout: 60_000 }, () => {});',
  "vi.setConfig({ testTimeout: 45_000 });",
  "vi.setConfig({ hookTimeout: 45_000 });",
];

const valid = [
  'test("loads", async () => {});',
  'test("loads", { tags: ["slow"] }, async () => {});',
  'test("loads", { concurrent: true }, function load() {});',
  'test.each([1, 2])("loads %i", async () => {});',
  "beforeAll(async () => { await server.listen(); }, 60_000);",
  "afterAll(() => server.close(), 30_000);",
  "await expect.poll(() => count(), { timeout: 5_000 }).toBe(1);",
  "await vi.waitFor(() => expect(count()).toBe(1), { timeout: 5_000 });",
  "const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });",
  "queue.retry({ delaySeconds: 30 });",
  "const policy = { retry: { maxAttempts: 1 } };",
  "export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 60_000 } });",
  "vi.setConfig({ fakeTimers: { now: 0 } });",
];

test.each(lintBatch(retries, false, "testing", config))(
  "rejects test retries: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("Do not retry tests");
  },
);

test.each(lintBatch(timeouts, false, "testing", config))(
  "rejects per-test timeout bumps: %s",
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
