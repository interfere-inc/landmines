import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lintLayout } from "./layout.test-utils";

const root = mkdtempSync(join(tmpdir(), "test-dir-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

const unit =
  'import { expect, test } from "vitest";\nimport { value } from "../src/value";\ntest("value", () => { expect(value).toBe(1); });\n';

function workspace(name: string, tests: Record<string, string>) {
  return {
    [`${name}/package.json`]: JSON.stringify({ name, type: "module" }),
    [`${name}/src/value.ts`]: "export const value = 1;\n",
    ...Object.fromEntries(
      Object.entries(tests).map(([file, code]) => [`${name}/${file}`, code]),
    ),
  };
}

test("test-dir-only-cross-functional reports unit tests in test directories", () => {
  const diagnostics = lintLayout(root, "test-dir-only-cross-functional", {
    ...workspace("package", {
      "test/value.test.ts": unit,
      "src/area/area.ts": "export const area = 1;\n",
      "src/area/test/area.test.ts":
        'import { area } from "../area";\nexport const checked = area;\n',
    }),
  });

  expect(diagnostics.map(({ file }) => file).toSorted()).toStrictEqual([
    "package/src/area/test/area.test.ts",
    "package/test/value.test.ts",
  ]);

  expect(diagnostics[0]?.message).toContain(
    "test directories hold only end-to-end, integration, Worker runtime and black-box suites",
  );
});

test("test-dir-only-cross-functional accepts colocated, black-box and cross-functional suites", () => {
  expect(
    lintLayout(root, "test-dir-only-cross-functional", {
      ...workspace("package", {
        "src/value.test.ts": unit.replace("../src/value", "./value"),
        "test/black-box.test.ts":
          'import { expect, test } from "vitest";\ntest("runs", () => { expect(1).toBe(1); });\n',
        "test/value.integration.test.ts": unit,
        "test/e2e/value.test.ts": unit.replaceAll("../src", "../../src"),
        "test/worker.test.ts": `import { SELF } from "cloudflare:test";\n${unit}await SELF.fetch("https://example.com");\n`,
      }),
    }),
  ).toStrictEqual([]);
});

test("test-dir-only-cross-functional accepts suites matching configured cross-functional patterns", () => {
  const files = workspace("package", {
    "test/harness.test.ts": `import { startHarness } from "@acme/harness";\n${unit}`,
  });

  expect(
    lintLayout(root, "test-dir-only-cross-functional", files, undefined, {
      crossFunctional: ["[\"']@acme/harness[\"']"],
    }),
  ).toStrictEqual([]);

  expect(
    lintLayout(root, "test-dir-only-cross-functional", files).map(
      ({ file }) => file,
    ),
  ).toStrictEqual(["package/test/harness.test.ts"]);
});

test("test-dir-only-cross-functional holds an allowlist entry to its exact count", () => {
  const diagnostics = lintLayout(
    root,
    "test-dir-only-cross-functional",
    {
      ...workspace("exact", { "test/a.test.ts": unit, "test/b.test.ts": unit }),
      ...workspace("grown", { "test/a.test.ts": unit, "test/b.test.ts": unit }),
      ...workspace("stale", { "test/a.test.ts": unit }),
      ...workspace("resolved", {
        "test/a.integration.test.ts": unit,
        "src/value.test.ts": unit.replace("../src/value", "./value"),
      }),
    },
    {
      "exact/test": 2,
      "grown/test": 1,
      "stale/test": 2,
      "resolved/test": 1,
    },
  );

  const message = (name: string) =>
    diagnostics.find(({ file }) => file.startsWith(`${name}/`))?.message;

  expect(diagnostics).toHaveLength(3);
  expect(message("exact")).toBeUndefined();
  expect(message("grown")).toContain("holds 2 unit tests");

  expect(message("stale")).toContain(
    "lower its test-dir-only-cross-functional allowlist entry from 2 to 1",
  );

  expect(message("resolved")).toContain(
    "remove its test-dir-only-cross-functional allowlist entry",
  );
});
