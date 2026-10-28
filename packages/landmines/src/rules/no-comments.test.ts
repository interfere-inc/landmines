import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

import { lintBatch } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "oxlint-comments-"));

function createConfig(options?: { publicApi: string[] }) {
  const config = join(directory, `${crypto.randomUUID()}.json`);

  writeFileSync(
    config,
    JSON.stringify({
      categories: { correctness: "off" },
      jsPlugins: [
        {
          name: "landmines-style",
          specifier: fileURLToPath(
            new URL("../plugins/style.ts", import.meta.url),
          ),
        },
      ],
      rules: {
        "landmines-style/no-comments": options ? ["error", options] : "error",
      },
    }),
  );

  return config;
}

const config = createConfig({ publicApi: ["/packages/public/"] });
const defaultConfig = createConfig();

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const functional = [
  "#!/usr/bin/env bun\nexport const count = 1;",
  "// oxlint-disable-next-line no-console\nconsole.log('ready');",
  "/* eslint-disable no-console */\nconsole.log('ready');\n/* eslint-enable no-console */",
  "// @ts-expect-error -- Invalid wire data\nconst count: number = 'bad';",
  "// @ts-ignore\nconst count: number = 'bad';",
  "// @ts-nocheck\nexport const count = 1;",
  "// prettier-ignore\nexport const count = 1;",
  "// nosemgrep: security.rule -- Input is escaped.\nexport const count = 1;",
  "/* v8 ignore next */\nexport const count = 1;",
  "/* c8 ignore start */\nexport const count = 1;\n/* c8 ignore stop */",
  "/* istanbul ignore file */\nexport const count = 1;",
  "export const count = /* @__PURE__ */ countItems();",
  "export const count = /* #__PURE__ */ countItems();",
  "export const count = /* #__INLINE__ */ countItems();",
  "/* @__NO_SIDE_EFFECTS__ */\nexport function count() { return 1; }",
  "import(/* webpackChunkName: 'sdk' */ './sdk');",
  "import(/* @vite-ignore */ path);",
  "/// <reference types='node' />\nexport const count = 1;",
  "/* @jsxImportSource react */\nexport const view = <div />;",
  "// SPDX-License-Identifier: MIT\nexport const count = 1;",
  "/**\n * @license MIT\n * Copyright 2026 Example\n */\nexport const count = 1;",
  "/*! @license MIT */\nexport const count = 1;",
  "/*\n * Copyright 2026 Example\n * SPDX-License-Identifier: MIT\n */\nexport const count = 1;",
  "export const count = 1;\n//# sourceMappingURL=sdk.js.map",
  "// WARNING: Retrying this operation charges the customer twice.\ncharge();",
  "const comment = '// ordinary comment';\nconst url = 'https://example.com';",
];

const forbidden = [
  "// Count the items\nexport const count = 1;",
  "/* Count the items */\nexport const count = 1;",
  "/** Count the items. */\nexport const count = 1;",
  "/*\n * Why this implementation exists.\n * More rationale.\n */\nexport const count = 1;",
  "// TODO: remove later\nexport const count = 1;",
  "// WARNING:\nexport const count = 1;",
  "// warning: retrying charges twice\ncharge();",
  "/* WARNING: Retrying charges twice. */\ncharge();",
  "/* WARNING: Retrying\ncharges twice. */\ncharge();",
  "// WARNING: Retrying charges twice.\n// More rationale\ncharge();",
  "// This mentions @ts-ignore but is prose.\nexport const count = 1;",
  "// prettier-ignore-this-explanation\nexport const count = 1;",
  "// webpack is the bundler\nexport const count = 1;",
  "export const view = <div>{/* Explain the view */}</div>;",
];

test.each(lintBatch(functional, true, "style", config))(
  "preserves functional comments and warnings: %s",
  (code, result) => {
    expect(result.status).toBe(0);
    expect(result.code).toBe(code);
  },
);

test.each(lintBatch(forbidden, true, "style", config))(
  "reports prohibited comments without deleting source: %s",
  (code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("Remove this comment");
    expect(result.code).toBe(code);
  },
);

const publicFile = "packages/public/sdk/src/subject.tsx";

test.each(
  lintBatch(
    [
      "/** Counts items. */\nexport function count() { return 1; }",
      "/** Counts items. */\n// oxlint-disable-next-line no-unused-vars\nexport function count() { return 1; }",
      "/** Counts items. */\n/* eslint-disable no-unused-vars */\n// prettier-ignore\nexport function count() { return 1; }",
      "/** Counts items. */\nexport const count = () => 1;",
      "/** Counts items. */\nfunction count() { return 1; }\nexport { count };",
      "/** Counts items. */\nconst count = () => 1;\nexport { count as total };",
      "/** Counts items. */\nfunction count() { return 1; }\nexport default count;",
      "/** Counts items. */\nexport default function count() { return 1; }",
      "/** Options. */\nexport interface Options { /** Retry limit. */ retries: number; }",
      "export type Options = { /** Retry limit. */ retries: number; };",
      "interface Options { /** @deprecated Use attempts. */ retries: number; }\nexport function count(options: Options) { return options.retries; }",
      "interface Result { /** Number of items. */ count: number; }\nexport function count(): Result { return { count: 1 }; }",
      "interface Options { /** Retry limit. */ retries: number; }\ntype Settings = Options;\nexport const count = (options: Settings) => options.retries;",
      "interface Options { /** Retry limit. */ retries: number; }\nexport interface Settings { options: Options; }",
      "export const options = { /** Retry limit. */ retries: 1 };",
      "export class Counter { /** Counts items. */ count() { return 1; } }",
      "export enum Mode { /** Enables capture. */ Capture }",
      "/** Options. */\ninterface Options { /** Retry limit. */ retries: number; }\nexport type { Options };",
      "/**\n * Counts items.\n * @param items Items to count.\n * @returns Number of items.\n */\nexport function count(items: string[]) { return items.length; }",
    ],
    true,
    "style",
    config,
    publicFile,
  ),
)("preserves exported public API documentation: %s", (code, result) => {
  expect(result.status).toBe(0);
  expect(result.code).toBe(code);
});

test.each(
  lintBatch(
    [
      "/** Internal helper. */\nfunction count() { return 1; }",
      "/** Internal options. */\ninterface Options { retries: number; }",
      "export function count() { /** Internal step. */ const value = 1; return value; }",
      "export function count() { interface Local { /** Internal field. */ value: number; } return 1; }",
      "interface Local { /** Internal field. */ value: number; }\nexport function count() { const local: Local = { value: 1 }; return local.value; }",
      "interface Local { /** Internal field. */ value: number; }\nexport const count = () => ({ value: 1 } as Local);",
      "interface Options { /** Internal field. */ value: number; }\nexport function count<Options>(options: Options) { return options; }",
      "/** Counts items. */\nconst internal = 1;\nexport function count() { return internal; }",
      "export class Counter { /** Internal method. */ private count() { return 1; } }",
      "export class Counter { /** Internal field. */ #count = 1; }",
      "/** @internal Implementation detail. */\nexport const count = 1;",
      "// Counts items.\nexport function count() { return 1; }",
      "/* Counts items. */\nexport function count() { return 1; }",
      "/** Orphaned documentation. */",
    ],
    true,
    "style",
    config,
    publicFile,
  ),
)("rejects internal documentation in public packages: %s", (code, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("Remove this comment");
  expect(result.code).toBe(code);
});

test.each(
  lintBatch(
    [
      "/** SDK environment. */\ninterface ImportMetaEnv { /** Enables tracing. */ readonly VITE_TRACING?: string; }",
      "export {};\ndeclare global { /** SDK environment. */ interface ImportMetaEnv { /** Enables tracing. */ readonly VITE_TRACING?: string; } }",
    ],
    true,
    "style",
    config,
    "packages/public/sdk/src/environment.d.ts",
  ),
)("preserves ambient public contracts: %s", (code, result) => {
  expect(result.status).toBe(0);
  expect(result.code).toBe(code);
});

test.each(
  lintBatch(
    [
      "/** Counts items. */\nexport function count() { return 1; }",
      "/** Options. */\nexport interface Options { /** Retry limit. */ retries: number; }",
    ],
    true,
    "style",
    defaultConfig,
    "src/count.ts",
  ),
)("treats every file as public API without publicApi: %s", (code, result) => {
  expect(result.status).toBe(0);
  expect(result.code).toBe(code);
});

test.each(
  lintBatch(
    ["/** Counts items. */\nexport function count() { return 1; }"],
    true,
    "style",
    config,
    "src/internal/count.ts",
  ),
)("rejects exported documentation outside publicApi: %s", (_code, result) => {
  expect(result.status).toBe(1);
});
