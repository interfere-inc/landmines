import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lintLayout } from "./layout.test-utils";

const root = mkdtempSync(join(tmpdir(), "prefix-cluster-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

const module = "export const value = 1;\n";

function cluster(directory: string, stem: string, names: readonly string[]) {
  return Object.fromEntries(
    names.map((name) => [`${directory}/${stem}-${name}.ts`, module]),
  );
}

test("no-prefix-cluster reports three prefixed modules once, counting tests with their module", () => {
  const diagnostics = lintLayout(root, "no-prefix-cluster", {
    "flat/trace.ts": module,
    "flat/trace-row.test.ts": module,
    ...cluster("flat", "trace", ["row", "list", "header"]),
    ...cluster("pair", "trace", ["row", "list"]),
  });

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.file).toBe("flat/trace-header.ts");

  expect(diagnostics[0]?.message).toMatch(
    /^4 modules in .*\/flat share the trace- prefix\. Group them in a trace\/ folder\.$/u,
  );
});

test("no-prefix-cluster skips routes, verb stems, folder stutter and non-TypeScript clusters", () => {
  expect(
    lintLayout(root, "no-prefix-cluster", {
      ...cluster("app/src/routes", "settings", ["a", "b", "c"]),
      ...cluster("hooks", "use", ["a", "b", "c"]),
      ...cluster("components/traces", "trace", ["row", "list", "header"]),
      ...cluster("chart-card/test", "chart", ["a", "b", "c"]),
      "sql/index.ts": module,
      "sql/mv-a.sql": "",
      "sql/mv-b.sql": "",
      "sql/mv-c.sql": "",
    }),
  ).toStrictEqual([]);
});

test("no-prefix-cluster holds an allowlist entry to its exact count", () => {
  const diagnostics = lintLayout(
    root,
    "no-prefix-cluster",
    {
      ...cluster("exact", "span", ["a", "b", "c"]),
      ...cluster("grown", "span", ["a", "b", "c", "d"]),
      ...cluster("stale", "span", ["a", "b", "c"]),
      "resolved/index.ts": module,
      ...cluster("resolved/span", "span", ["a", "b", "c"]),
    },
    {
      "exact/span-*": 3,
      "grown/span-*": 3,
      "stale/span-*": 5,
      "resolved/span-*": 3,
    },
  );

  const message = (directory: string) =>
    diagnostics.find(({ file }) => file.startsWith(`${directory}/`))?.message;

  expect(diagnostics).toHaveLength(3);
  expect(message("exact")).toBeUndefined();
  expect(message("grown")).toContain("grew to 4 modules");

  expect(message("stale")).toContain(
    "lower its no-prefix-cluster allowlist entry from 5 to 3",
  );

  expect(message("resolved")).toContain(
    "remove its no-prefix-cluster allowlist entry",
  );
});
