import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { z } from "zod";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
let directory: string;

function write(path: string, content: string) {
  const filename = join(directory, path);

  mkdirSync(dirname(filename), { recursive: true });

  writeFileSync(filename, content);

  return filename;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "package-exports-"));

  symlinkSync(join(root, "node_modules"), join(directory, "node_modules"));
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

interface Manifest {
  exports?: z.infer<ReturnType<typeof z.json>>;
  imports?: Record<string, string>;
}

function lint(manifest: Manifest, repository = false, cwd = root) {
  write("package.json", JSON.stringify(manifest));

  const filename = write("src/nested/client.ts", "export {};\n");

  const result = spawnSync(
    join(root, "node_modules/.bin/oxlint"),
    [
      "--config",
      join(root, ".oxlintrc.jsonc"),
      ...(repository
        ? []
        : ["-A", "all", "-D", "landmines-structure/package-exports"]),
      "--threads",
      "1",
      filename,
    ],
    { cwd, encoding: "utf8", timeout: 15_000 },
  );

  if (result.error) {
    throw result.error;
  }

  expect(result.stderr).toBe("");

  return result;
}

test.each([
  "./src/*.ts",
  "./src/*.tsx",
  "./src/*",
  "./*.js",
  "./*",
  "./src/../src/*.mts",
])("rejects root source wildcard %s through nested conditions", (target) => {
  const result = lint({
    exports: {
      "./*": { import: { monorepo: target, default: "./dist/*.js" } },
    },
  });

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("landmines-structure(package-exports)");
  expect(result.stdout).toContain(target);
});

test.each([
  "./src/client.ts",
  "./src/schema/*.ts",
  "./src/*/index.ts",
  "./dist/*.js",
  "./*.json",
  "./src/*.css",
])("allows explicit entrypoints, namespaces and assets: %s", (target) => {
  expect(lint({ exports: { "./*": target } }).status).toBe(0);
});

test("checks fallback arrays while respecting null exclusions", () => {
  const result = lint({
    exports: { "./*": [null, "./src/*.ts"], "./private/*": null },
  });

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("./src/*.ts");
});

test("allows private aliases and packages without exports", () => {
  expect(lint({ imports: { "#*": "./src/*.ts" } }).status).toBe(0);
});

test("enforces the rule through global configuration without local options", () => {
  const result = lint({ exports: { "./*": "./src/*.ts" } }, true);

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("landmines-structure(package-exports)");
});

test("finds the owning package when lint runs from a nested directory", () => {
  mkdirSync(join(directory, "src/nested"), { recursive: true });

  const result = lint(
    { exports: { "./*": "./src/*.ts" } },
    false,
    join(directory, "src/nested"),
  );

  expect(result.status).toBe(1);

  expect(result.stdout).toContain(
    "package.json exposes arbitrary implementation",
  );
});
