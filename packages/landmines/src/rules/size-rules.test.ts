import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

import { ruleConfiguration } from "./rule.test-utils";

const binary = fileURLToPath(
  new URL("../../node_modules/.bin/oxlint", import.meta.url),
);

const root = mkdtempSync(join(tmpdir(), "size-rules-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

function run(
  rule: string,
  files: Record<string, string>,
  options?: { allow?: Record<string, number>; max?: number },
) {
  const directory = mkdtempSync(join(root, "case-"));

  const allow =
    options?.allow &&
    Object.fromEntries(
      Object.entries(options.allow).map(([key, limit]) => [
        key === "." ? basename(directory) : key,
        limit,
      ]),
    );

  for (const [name, content] of Object.entries(files)) {
    const file = join(directory, name);

    mkdirSync(dirname(file), { recursive: true });

    writeFileSync(file, content);
  }

  const result = spawnSync(
    binary,
    [
      "--config",
      ruleConfiguration(
        directory,
        `structure/${rule}`,
        options && { ...options, ...(allow ? { allow } : {}) },
      ),
      "--threads",
      "1",
      "--format",
      "json",
      directory,
    ],
    { encoding: "utf8", timeout: 15_000 },
  );

  expect(result.stderr).toBe("");

  const { diagnostics } = JSON.parse(result.stdout) as {
    diagnostics: { message: string; filename: string }[];
  };

  return diagnostics;
}

function modules(count: number, prefix = "module") {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `${prefix}-${index}.ts`,
      "export const value = 1;\n",
    ]),
  );
}

const lines = (count: number) =>
  `${Array.from(
    { length: count },
    (_, index) => `export const v${index} = 1;`,
  ).join("\n")}\n`;

test("max-files-per-directory reports a flat directory once", () => {
  const diagnostics = run("max-files-per-directory", modules(21));

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.message).toContain("holds 21 source files");
});

test("max-files-per-directory accepts a clean directory and one split by subdirectory", () => {
  expect(run("max-files-per-directory", modules(20))).toStrictEqual([]);

  expect(
    run("max-files-per-directory", {
      ...modules(15, "a/module"),
      ...modules(15, "b/module"),
    }),
  ).toStrictEqual([]);
});

test("max-files-per-directory ignores tests, generated files and declaration files", () => {
  const extras = {
    ...Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [
        `case-${index}.test.ts`,
        "export const value = 1;\n",
      ]),
    ),
    "schema.generated.ts": "export const value = 1;\n",
    "types.d.ts": "export type Value = 1;\n",
  };

  expect(
    run("max-files-per-directory", { ...modules(20), ...extras }),
  ).toStrictEqual([]);
});

test("max-files-per-directory honours an allowlist entry exactly and asks to lower it", () => {
  const diagnostics = run(
    "max-files-per-directory",
    {
      ...modules(25, "unlisted/module"),
      ...modules(25, "exact/module"),
      ...modules(25, "grown/module"),
      ...modules(25, "stale/module"),
    },
    { allow: { exact: 25, grown: 24, stale: 30 } },
  );

  const message = (directory: string) =>
    diagnostics.find(
      ({ filename }) => basename(dirname(filename)) === directory,
    )?.message;

  expect(diagnostics).toHaveLength(3);
  expect(message("unlisted")).toContain("holds 25 source files");
  expect(message("exact")).toBeUndefined();
  expect(message("grown")).toContain("grew to 25");
  expect(message("stale")).toContain("lower its max-files-per-directory entry");
});

test("max-file-lines reports a long file and accepts a short one", () => {
  const diagnostics = run("max-file-lines", { "long.ts": lines(501) });

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.message).toContain("has 501 lines");

  expect(run("max-file-lines", { "short.ts": lines(500) })).toStrictEqual([]);
});

test("max-file-lines ignores tests and generated files", () => {
  expect(
    run("max-file-lines", {
      "long.test.ts": lines(900),
      "schema.generated.ts": lines(900),
      "marked.ts": `// @generated\n${lines(900)}`,
    }),
  ).toStrictEqual([]);
});

test("max-file-lines treats an allowlist entry as a ceiling and flags stale entries", () => {
  const file = { "long.ts": lines(600) };

  const messages = (allow: Record<string, number>) =>
    run("max-file-lines", file, { allow }).map(({ message }) => message);

  expect(messages({ "long.ts": 650 })).toStrictEqual([]);
  expect(messages({ "long.ts": 550 })[0]).toContain("grew to 600 lines");

  expect(
    run(
      "max-file-lines",
      { "long.ts": lines(400) },
      { allow: { "long.ts": 650 } },
    )[0]?.message,
  ).toContain("remove its max-file-lines allowlist entry");
});

test("max-exports-per-module counts declarations, specifiers, defaults and star exports", () => {
  const diagnostics = run(
    "max-exports-per-module",
    {
      "barrel.ts": [
        "export const a = 1, b = 2;",
        "export function c() {}",
        "export type D = 1;",
        "const e = 1;",
        "export { e, e as f };",
        'export * from "./other.ts";',
        "export default 1;",
      ].join("\n"),
    },
    { max: 7 },
  );

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.message).toContain("exports 8 names");
});

test("max-exports-per-module accepts a module at the limit and ignores tests", () => {
  const exported = (count: number) =>
    Array.from(
      { length: count },
      (_, index) => `export const x${index} = 1;`,
    ).join("\n");

  expect(
    run("max-exports-per-module", { "ok.ts": exported(6) }, { max: 6 }),
  ).toStrictEqual([]);

  expect(
    run("max-exports-per-module", { "many.test.ts": exported(20) }, { max: 6 }),
  ).toStrictEqual([]);
});

test("max-exports-per-module allowlist is a ceiling", () => {
  const source = Array.from(
    { length: 10 },
    (_, index) => `export const x${index} = 1;`,
  ).join("\n");

  const messages = (allow: Record<string, number>) =>
    run("max-exports-per-module", { "many.ts": source }, { max: 6, allow }).map(
      ({ message }) => message,
    );

  expect(messages({ "many.ts": 12 })).toStrictEqual([]);
  expect(messages({ "many.ts": 8 })[0]).toContain("now exports 10 names");
});

const boundClasses = Array.from({ length: 9 }, (_, index) => `Lantern${index}`);

const workerSource = (helpers: number) =>
  [
    ...boundClasses.map((name) => `export class ${name} extends Object {}`),
    ...Array.from(
      { length: helpers },
      (_, index) => `export const helper${index} = ${index};`,
    ),
    "export default { fetch: () => new Response() };",
  ].join("\n");

const wrangler = (main: string, nested = false) => {
  const bindings = {
    durable_objects: {
      bindings: boundClasses
        .slice(0, 3)
        .map((name) => ({ name: name.toUpperCase(), class_name: name })),
    },
    workflows: [{ name: "flow", binding: "FLOW", class_name: boundClasses[3] }],
    migrations: [
      {
        tag: "v1",
        new_classes: [boundClasses[4]],
        new_sqlite_classes: [boundClasses[5]],
        renamed_classes: [{ from: "OldLantern", to: boundClasses[6] }],
      },
    ],
    services: [
      { binding: "SELF", service: "beacon", entrypoint: boundClasses[7] },
      { binding: "PEER", service: "beacon", entrypoint: boundClasses[8] },
    ],
  };

  return [
    "// Synthetic Worker configuration",
    JSON.stringify(
      nested
        ? { name: "beacon", main, env: { staging: bindings } }
        : { name: "beacon", main, ...bindings },
      undefined,
      2,
    ).replace(/\n\}$/u, ",\n}"),
    "",
  ].join("\n");
};

test("max-exports-per-module does not count the classes a Worker main's wrangler config binds", () => {
  expect(
    run("max-exports-per-module", {
      "package.json": "{}\n",
      "wrangler.jsonc": wrangler("./src/index.ts"),
      "src/index.ts": workerSource(0),
    }),
  ).toStrictEqual([]);

  expect(
    run("max-exports-per-module", {
      "package.json": "{}\n",
      "wrangler.jsonc": wrangler("./src/index.ts"),
      "src/index.ts": [
        ...boundClasses.map(
          (name) => `export { ${name} } from "./${name}.ts";`,
        ),
        "export default {};",
      ].join("\n"),
    }),
  ).toStrictEqual([]);
});

test("max-exports-per-module still counts a Worker main's default and unbound exports", () => {
  const diagnostics = run(
    "max-exports-per-module",
    {
      "package.json": "{}\n",
      "wrangler.jsonc": wrangler("./src/index.ts"),
      "src/index.ts": workerSource(7),
    },
    { max: 6 },
  );

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.message).toContain("exports 8 names");
});

test("max-exports-per-module counts bound class names in a module that is not the Worker main", () => {
  const diagnostics = run("max-exports-per-module", {
    "package.json": "{}\n",
    "wrangler.jsonc": wrangler("./src/index.ts"),
    "src/index.ts": "export default {};\n",
    "src/classes.ts": workerSource(0),
  });

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.message).toContain("exports 10 names");
});

test("max-exports-per-module reads bindings from env blocks", () => {
  expect(
    run("max-exports-per-module", {
      "package.json": "{}\n",
      "wrangler.json": wrangler("src/index.ts", true).replace(
        "// Synthetic Worker configuration\n",
        "",
      ),
      "src/index.ts": workerSource(0),
    }),
  ).toStrictEqual([]);
});

test("max-exports-per-module ignores a wrangler config whose main is another file or beyond the package root", () => {
  expect(
    run("max-exports-per-module", {
      "package.json": "{}\n",
      "wrangler.jsonc": wrangler("./src/worker.ts"),
      "src/index.ts": workerSource(0),
    }),
  ).toHaveLength(1);

  expect(
    run("max-exports-per-module", {
      "wrangler.jsonc": wrangler("./app/src/index.ts"),
      "app/package.json": "{}\n",
      "app/src/index.ts": workerSource(0),
    }),
  ).toHaveLength(1);
});

test("max-exports-per-module reports a Worker main's allowlist entry as stale once bound classes stop counting", () => {
  const diagnostics = run(
    "max-exports-per-module",
    {
      "package.json": "{}\n",
      "wrangler.jsonc": wrangler("./src/index.ts"),
      "src/index.ts": workerSource(0),
    },
    { allow: { "src/index.ts": 10 } },
  );

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.message).toContain(
    "exports 1 names, within the 6 limit; remove its max-exports-per-module allowlist entry src/index.ts",
  );
});
