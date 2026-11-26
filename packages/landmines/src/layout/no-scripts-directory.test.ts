import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lintLayout } from "./layout.test-utils";

const root = mkdtempSync(join(tmpdir(), "scripts-dir-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

const code = "export const value = 1;\n";

test("no-scripts-directory reports every file in an unlisted scripts folder", () => {
  const diagnostics = lintLayout(root, "no-scripts-directory", {
    "package/scripts/sync.ts": code,
    "package/scripts/nested/plan.ts": code,
    "package/src/scripts.ts": code,
    "package/src/value.ts": code,
  });

  expect(diagnostics.map(({ file }) => file).toSorted()).toStrictEqual([
    "package/scripts/nested/plan.ts",
    "package/scripts/sync.ts",
  ]);

  expect(diagnostics[0]?.message).toContain("is a scripts folder");
});

test("no-scripts-directory holds an allowlist entry to its exact file count", () => {
  const diagnostics = lintLayout(
    root,
    "no-scripts-directory",
    {
      "exact/scripts/a.ts": code,
      "exact/scripts/run.sh": "echo run\n",
      "grown/scripts/a.ts": code,
      "grown/scripts/b.ts": code,
      "stale/scripts/a.ts": code,
    },
    { "exact/scripts": 2, "grown/scripts": 1, "stale/scripts": 2 },
  );

  const message = (name: string) =>
    diagnostics.find(({ file }) => file.startsWith(`${name}/`))?.message;

  expect(diagnostics).toHaveLength(2);
  expect(message("exact")).toBeUndefined();
  expect(message("grown")).toContain("holds 2 files");

  expect(message("stale")).toContain(
    "lower its no-scripts-directory allowlist entry from 2 to 1",
  );
});
