import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { afterAll, beforeAll, expect, test } from "vitest";
import { declaredTestInputs } from "./declared-inputs";

const root = mkdtempSync(join(tmpdir(), "declared-inputs-"));

const files = {
  "package.json": { workspaces: { packages: ["pkgs/*"] } },
  "turbo.json": {
    tasks: { test: { inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/shared/**"] } },
  },
  "pkgs/app/package.json": {
    name: "@fixture/app",
    scripts: { test: "vitest run" },
    devDependencies: { "@fixture/lib": "workspace:*" },
  },
  "pkgs/app/turbo.json": {
    extends: ["//"],
    tasks: {
      test: {
        inputs: [
          "$TURBO_EXTENDS$",
          "$TURBO_ROOT$/iac/declared/**",
          "$TURBO_ROOT$/workers/*/wrangler.jsonc",
        ],
      },
    },
  },
  "pkgs/lib/package.json": { name: "@fixture/lib" },
  "pkgs/other/package.json": { name: "@fixture/other" },
  "pkgs/routes/package.json": {
    name: "@fixture/routes",
    scripts: { test: "vitest run" },
  },
};

beforeAll(() => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });

    writeFileSync(join(root, path), JSON.stringify(content));
  }

  mkdirSync(join(root, ".git"));

  mkdirSync(join(root, "pkgs/app/src"), { recursive: true });

  writeFileSync(
    join(root, "pkgs/app/src/data.contract.test.js"),
    'import "./contract-data.fixture.js";',
  );

  writeFileSync(
    join(root, "pkgs/app/src/unit.test.js"),
    'import "./unit-data.fixture.js";',
  );

  mkdirSync(join(root, "pkgs/routes/app/demo/embed.js"), { recursive: true });

  writeFileSync(
    join(root, "pkgs/routes/app/demo/embed.js/route.ts"),
    "export const GET = 1;",
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const linter = new Linter({ cwd: root });

const plugin = {
  testing: {
    rules: { inputs: declaredTestInputs },
  } as unknown as ESLint.Plugin,
};

const imports = `import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
`;

const test_file = "pkgs/app/src/route.test.js";

function lint(code: string, file = test_file, allow?: Record<string, number>) {
  const filename = join(root, file);

  writeFileSync(filename, "");

  const config: Linter.Config = {
    plugins: plugin,
    rules: { "testing/inputs": allow ? ["error", { allow }] : "error" },
  };

  return linter
    .verify(`${imports}${code}`, config, { filename })
    .map(
      ({ message }) =>
        /Add "\$TURBO_ROOT\$\/(?<input>[^"]+)"/u.exec(message)?.groups?.[
          "input"
        ] ??
        /reads (?<path>.+?), outside/u.exec(message)?.groups?.["path"] ??
        message,
    );
}

test.each([
  [
    'readFileSync(resolve(import.meta.dirname, "../../../iac/other/state.json"));',
    ["iac/other/state.json"],
  ],
  [
    'readFileSync(new URL("../../../iac/other/state.json", import.meta.url));',
    ["iac/other/state.json"],
  ],
  [
    'const root = resolve(import.meta.dirname, "../../.."); readFileSync(resolve(root, "pkgs/other/src/index.js"));',
    ["pkgs/other/src/index.js"],
  ],
  ['readFileSync("../../iac/other/state.json");', ["iac/other/state.json"]],
  [
    'const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(); execFileSync("git", ["grep", "-l", "createTestHarness", "--", "src"], { cwd: root });',
    ["src"],
  ],
  [
    'const root = execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim(); execFileSync("git", ["ls-files", "**/package.json"], { cwd: root });',
    ["**/package.json"],
  ],
  [
    'const repository = (path) => readFileSync(resolve(import.meta.dirname, "../../..", path)); repository("iac/other/b.json");',
    ["iac/other/b.json"],
  ],
  [
    'readFileSync(resolve(import.meta.dirname, "../../../iac/declared/state.json"));',
    ["iac/declared/state.json"],
  ],
  [
    'readFileSync(resolve(import.meta.dirname, "../../lib/src/index.js"));',
    ["pkgs/lib/src/index.js"],
  ],
  [
    'const root = resolve(import.meta.dirname, "../../.."); for (const name of ["a"]) readFileSync(resolve(root, "workers", name, "wrangler.jsonc"));',
    ["workers/a/wrangler.jsonc"],
  ],
])("reports a read outside the package: %s", (code, paths) => {
  expect(lint(code)).toStrictEqual(paths);
});

test.each([
  'const root = resolve(import.meta.dirname, "../../.."); const units = ["iac/a.hcl", "iac/b.hcl"]; const read = (unit) => readFileSync(join(root, unit)); for (const unit of units) read(unit);',
  'const root = resolve(import.meta.dirname, "../../.."); const read = (unit) => readFileSync(join(root, unit)); ["iac/a.hcl", "iac/b.hcl"].flatMap((unit) => read(unit));',
])(
  "reports each element of a literal array a helper reads in a loop: %s",
  (code) => {
    expect(lint(code)).toStrictEqual(["iac/a.hcl, iac/b.hcl"]);
  },
);

test.each([
  'readFileSync(resolve(import.meta.dirname, "fixture.json"));',
  'const root = resolve(import.meta.dirname, "../../.."); export const all = (file) => readFileSync(resolve(root, file));',
  'mkdtempSync(resolve(import.meta.dirname, "../../../.tmp-"));',
  'execFileSync("git", ["grep", "-l", "needle", "--", "src"]);',
])("allows own, unresolvable and write paths: %s", (code) => {
  expect(lint(code)).toStrictEqual([]);
});

test("checks only test code", () => {
  expect(
    lint(
      'readFileSync(resolve(import.meta.dirname, "../../../iac/other/state.json"));',
      "pkgs/app/src/route.js",
    ),
  ).toStrictEqual([]);
});

const twoReads =
  'readFileSync(resolve(import.meta.dirname, "../../../iac/declared/a.json")); readFileSync(resolve(import.meta.dirname, "../../../iac/other/b.json"));';

test("an allowlisted file still declares each read as a Turbo test input", () => {
  expect(lint(twoReads, test_file, { [test_file]: 2 })).toStrictEqual([
    "iac/other/b.json",
  ]);
});

test("an allowlisted file with fully declared reads passes", () => {
  expect(
    lint(
      'readFileSync(resolve(import.meta.dirname, "../../../iac/declared/a.json"));',
      test_file,
      { [test_file]: 1 },
    ),
  ).toStrictEqual([]);
});

test("the allowlist only shrinks: a new read past the count is reported", () => {
  expect(lint(twoReads, test_file, { [test_file]: 1 })).toStrictEqual([
    "iac/declared/a.json",
    "iac/other/b.json",
  ]);
});

test("an allowlist entry above the file's reads is stale", () => {
  expect(lint(twoReads, test_file, { [test_file]: 3 })).toStrictEqual([
    `${test_file} now makes 2 out-of-package reads; lower its declared-test-inputs allowlist entry to 2, or remove it at 0.`,
  ]);
});

test("a repository-wide git scan from the root is a read outside the package", () => {
  expect(
    lint(
      'const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(); execFileSync("git", ["ls-files"], { cwd: root });',
    ),
  ).toHaveLength(1);
});

test("a loop variable inside a template argument expands per element", () => {
  expect(
    lint(
      'const root = resolve(import.meta.dirname, "../../.."); const read = (file) => readFileSync(join(root, file)); for (const unit of ["a", "b"]) read(`iac/$' +
        "{unit}.hcl`);",
    ),
  ).toStrictEqual(["iac/a.hcl, iac/b.hcl"]);
});

const loopReads =
  'const root = resolve(import.meta.dirname, "../../.."); for (const name of ["a", "b"]) readFileSync(resolve(root, "services", name, "wrangler.jsonc"));';

test("the allowlist counts each path a loop reads, not the read call", () => {
  expect(lint(loopReads, test_file, { [test_file]: 1 })).toStrictEqual([
    "services/a/wrangler.jsonc, services/b/wrangler.jsonc",
  ]);
});

test("an allowlisted loop reports every undeclared path", () => {
  expect(lint(loopReads, test_file, { [test_file]: 2 })).toStrictEqual([
    "services/a/wrangler.jsonc",
    "services/b/wrangler.jsonc",
  ]);
});

test("an allowlist entry for a file the rule no longer checks is stale", () => {
  expect(
    lint("export const value = 1;", "pkgs/app/src/route.js", {
      "pkgs/app/src/route.js": 1,
    }),
  ).toStrictEqual([
    "pkgs/app/src/route.js now makes 0 out-of-package reads; lower its declared-test-inputs allowlist entry to 0, or remove it at 0.",
  ]);
});

const outsideRead =
  'readFileSync(resolve(import.meta.dirname, "../../../iac/other/state.json"));';

test.each([
  ["pkgs/app/src/contract-data.fixture.js", []],
  ["pkgs/app/src/unit-data.fixture.js", ["iac/other/state.json"]],
])(
  "a helper that only contract tests import is skipped, other helpers are checked: %s",
  (file, paths) => {
    expect(lint(outsideRead, file)).toStrictEqual(paths);
  },
);

test("a second lint of a helper gives the same result", () => {
  const file = "pkgs/app/src/contract-data.fixture.js";

  expect(lint(outsideRead, file)).toStrictEqual(lint(outsideRead, file));
});

test("a directory named like a source file is not read as a source", () => {
  expect(lint(outsideRead, "pkgs/routes/app/helper.fixture.js")).toStrictEqual([
    "iac/other/state.json",
  ]);
});
