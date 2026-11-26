import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { afterAll, expect, test } from "vitest";

import landmines from "../plugin";
import { bespokeScripts } from "./package-scripts";

const plugin = landmines as unknown as ESLint.Plugin;

const root = mkdtempSync(join(tmpdir(), "package-scripts-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

function manifest(scripts: Record<string, string>) {
  return JSON.stringify({ name: "fixture", scripts });
}

test("bespokeScripts accepts standard task names that call a tool", () => {
  expect(
    bespokeScripts(
      manifest({
        build: "vite build",
        dev: "wrangler dev",
        "lint:oxlint": "oxlint .",
        test: "vitest run",
        typecheck: "tsgo --noEmit",
        typegen: "wrangler types",
      }),
    ),
  ).toStrictEqual([]);
});

test("bespokeScripts flags suffixed names and TypeScript files run with a runtime", () => {
  expect(
    bespokeScripts(
      manifest({
        "build:image": "docker build .",
        "deploy:wait": "bun run wait.ts",
        evals: "braintrust eval",
        test: "node ../test-config/src/cli.ts run",
        typegen: "bun --bun src/generate.mts && wrangler types",
        dev: "tsx watch.ts",
      }),
    ),
  ).toStrictEqual([
    "build:image",
    "deploy:wait",
    "dev",
    "evals",
    "test",
    "typegen",
  ]);
});

function lintPackage(
  name: string,
  scripts: Record<string, string>,
  options: { allow?: number; names?: string[] } = {},
) {
  const directory = join(root, name);

  mkdirSync(join(directory, "src"), { recursive: true });

  writeFileSync(join(directory, "package.json"), manifest(scripts));

  writeFileSync(join(directory, "src/value.ts"), "export const value = 1;\n");

  const linter = new Linter({ cwd: root });

  return linter
    .verify(
      "export const value = 1;\n",
      {
        files: ["**/*.ts"],
        plugins: { landmines: plugin },
        rules: {
          "landmines/package-scripts": [
            "error",
            {
              ...(options.allow !== undefined && {
                allow: { [`${name}/package.json`]: options.allow },
              }),
              ...(options.names && { names: options.names }),
            },
          ],
        },
      },
      { filename: join(directory, "src/value.ts") },
    )
    .map(({ message }) => message);
}

test("package-scripts reports bespoke scripts and holds allowlist entries to exact counts", () => {
  expect(lintPackage("clean", { build: "vite build" })).toStrictEqual([]);

  expect(
    lintPackage("unlisted", { "check:bundle": "bun check.ts" }),
  ).toStrictEqual([
    expect.stringContaining("defines bespoke scripts: check:bundle"),
  ]);

  expect(
    lintPackage("exact", { evals: "braintrust eval" }, { allow: 1 }),
  ).toStrictEqual([]);

  expect(
    lintPackage(
      "grown",
      { evals: "braintrust eval", bench: "bun bench.ts" },
      { allow: 1 },
    ),
  ).toStrictEqual([expect.stringContaining("defines 2 bespoke scripts")]);

  expect(
    lintPackage("stale", { build: "vite build" }, { allow: 1 }),
  ).toStrictEqual([
    expect.stringContaining("remove its package-scripts allowlist entry"),
  ]);
});

test("bespokeScripts accepts the task names it is given", () => {
  expect(
    bespokeScripts(
      manifest({ "build:js": "tsdown -F emit-js", evals: "braintrust eval" }),
      new Set(["build:js"]),
    ),
  ).toStrictEqual(["evals"]);
});

test("package-scripts accepts extra standard names from the names option", () => {
  const scripts = {
    "build:js": "tsdown -F emit-js",
    "build:types": "tsdown -F emit-dts",
  };

  expect(
    lintPackage("named", scripts, { names: ["build:js", "build:types"] }),
  ).toStrictEqual([]);

  expect(lintPackage("unnamed", scripts)).toStrictEqual([
    expect.stringContaining("defines bespoke scripts: build:js, build:types"),
  ]);

  expect(
    lintPackage(
      "still-runs-source",
      { "build:js": "bun build.ts" },
      {
        names: ["build:js"],
      },
    ),
  ).toStrictEqual([
    expect.stringContaining("defines bespoke scripts: build:js"),
  ]);
});
