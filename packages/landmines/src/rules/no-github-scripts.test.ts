import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { afterAll, expect, test } from "vitest";

import { noGithubScripts } from "./no-github-scripts";

const root = mkdtempSync(join(tmpdir(), "no-github-scripts-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

function lintRepository(files: readonly string[]) {
  const directory = mkdtempSync(join(root, "repository-"));

  mkdirSync(join(directory, ".git"));

  for (const file of files) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });

    writeFileSync(join(directory, file), "");
  }

  return new Linter({ cwd: directory })
    .verify(
      "export const value = 1;",
      {
        files: ["**/*.ts"],
        plugins: {
          structure: {
            rules: { scripts: noGithubScripts },
          } as unknown as ESLint.Plugin,
        },
        rules: { "structure/scripts": "error" },
      },
      { filename: join(directory, "src/index.ts") },
    )
    .map(({ message }) => message);
}

test("reports script files anywhere under .github", () => {
  expect(
    lintRepository([
      ".github/workflows/ci.yml",
      ".github/scripts/release.ts",
      ".github/actions/setup/run.sh",
      ".github/tools/report.py",
    ]),
  ).toStrictEqual([
    "Forbidden files in .github: .github/actions/setup/run.sh, .github/scripts/release.ts, .github/tools/report.py. Use native tool features and maintained GitHub Actions instead of repository-owned CI scripts.",
  ]);
});

test("accepts workflow and action metadata", () => {
  expect(
    lintRepository([
      ".github/workflows/ci.yml",
      ".github/actions/setup/action.yml",
      ".github/CODEOWNERS",
    ]),
  ).toStrictEqual([]);
});

test("accepts a repository without .github", () => {
  expect(lintRepository([])).toStrictEqual([]);
});
