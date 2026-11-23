import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lintBatch, ruleConfiguration } from "./rule.test-utils";

function fixtureResult(
  results: ReadonlyMap<string, ReturnType<typeof lintBatch>[number][1]>,
  code: string,
) {
  const result = results.get(code);

  if (!result) {
    throw new Error(`Missing lint fixture: ${code}`);
  }

  return result;
}

const directory = mkdtempSync(join(tmpdir(), "no-project-max-workers-"));

const configuration = ruleConfiguration(
  directory,
  "testing/no-project-max-workers",
);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const results = new Map(
  lintBatch(
    ["export default { test: { name: 'worker', maxWorkers: 1 } };"],
    false,
    "testing",
    configuration,
    "vite.config.ts",
  ),
);

test.each(
  lintBatch(
    [
      "export default { test: { name: 'worker', maxWorkers: 1 } };",
      "export default defineConfig({ test: { maxWorkers: 2, name: 'worker' } });",
      "export default { test: { 'name': 'worker', 'maxWorkers': 1 } };",
      "export default { ['test']: { ['name']: 'worker', ['maxWorkers']: 1 } };",
      "export default { test: { projects: [{ test: { name: 'worker', maxWorkers: 1 } }] } };",
    ],
    false,
    "testing",
    configuration,
    "vitest.worker.config.mts",
  ),
)("rejects ineffective project-level file concurrency: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("landmines(no-project-max-workers)");
  expect(result.output).toContain("fileParallelism: false");
});

test.each(
  lintBatch(
    [
      "export default { test: { maxWorkers: 1 } };",
      "export default { test: { name: 'worker', fileParallelism: false } };",
      "export default { test: { name: 'worker' } };",
      "export default { other: { name: 'worker', maxWorkers: 1 } };",
      "export default { test: config };",
      "export default { test: { name: 'worker', ...options } };",
      "export default { test: { [name]: 'worker', maxWorkers: 1 } };",
    ],
    false,
    "testing",
    configuration,
    "vitest.config.ts",
  ),
)("allows root concurrency and explicit serial projects: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test("does not constrain unrelated configuration", () => {
  expect(
    fixtureResult(
      results,
      "export default { test: { name: 'worker', maxWorkers: 1 } };",
    ).status,
  ).toBe(0);
});
