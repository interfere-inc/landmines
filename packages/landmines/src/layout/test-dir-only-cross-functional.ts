import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { defineRule } from "@oxlint/plugins";

import { z } from "zod";

import { allowlistProperties } from "../lib/allowlist.ts";
import {
  fileImports,
  packageDirectory,
  packageSources,
} from "../lib/test-owner.ts";
import { allowances, isEntryFor } from "./allowance.ts";

const crossFunctionalOptions = z
  .tuple([z.looseObject({ crossFunctional: z.array(z.string()).optional() })])
  .or(z.tuple([]));

const directoryNames = new Set(["test", "tests", "__tests__"]);
const testName = /\.(?:test|spec|e2e)\.[cm]?[jt]sx?$/u;
const endToEndName = /\.e2e\.|playwright/u;
const integrationName = /\.(?:integration|sql|contract)\./u;

const crossFunctionalSource = [
  /["']@playwright\/test["']/u,
  /exports\.default\.(?:fetch|queue|scheduled)/u,
  /\bSELF\.(?:fetch|queue|scheduled)/u,
  /import\s*\{[^}]*\bexports\b[^}]*\}\s*from\s*["']cloudflare:workers["']/u,
];

const unitTests = new Map<string, boolean>();

function testDirectory(filename: string) {
  const root = packageDirectory(dirname(filename));
  const parts = relative(root, filename).split(sep);

  const index = parts.findIndex(
    (part, position) => position < parts.length - 1 && directoryNames.has(part),
  );

  return index === -1 ? undefined : join(root, ...parts.slice(0, index + 1));
}

function isCrossFunctional(filename: string, extra: readonly RegExp[]) {
  const name = basename(filename);

  const parts = relative(packageDirectory(dirname(filename)), filename).split(
    sep,
  );

  const text = readFileSync(filename, "utf8");

  return (
    parts.includes("e2e") ||
    parts.includes("integration") ||
    endToEndName.test(name) ||
    integrationName.test(name) ||
    (/["']cloudflare:test["']/u.test(text) && /\bSELF\b/u.test(text)) ||
    [...crossFunctionalSource, ...extra].some((pattern) => pattern.test(text))
  );
}

function isUnitTest(filename: string, extra: readonly RegExp[]) {
  const known = unitTests.get(filename);

  if (known !== undefined) {
    return known;
  }

  const imports = isCrossFunctional(filename, extra)
    ? undefined
    : fileImports(filename);

  const unit =
    imports !== undefined && packageSources(filename, imports).length > 0;

  unitTests.set(filename, unit);

  return unit;
}

export const testDirOnlyCrossFunctional = defineRule({
  meta: {
    type: "suggestion",
    schema: [
      {
        type: "object",
        properties: {
          ...allowlistProperties,
          crossFunctional: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    docs: {
      description:
        "Keep test directories for cross-functional suites: end-to-end, integration, Worker runtime and black-box tests.",
    },
    messages: {
      unit: "This test imports its package's source from {{directory}}. Move it beside the module it tests, or to the nearest folder that holds everything it tests; test directories hold only end-to-end, integration, Worker runtime and black-box suites.",
      grown:
        "{{directory}} holds {{count}} unit tests; its test-dir-only-cross-functional allowlist entry permits {{allowed}}. Colocate the new tests instead of raising the entry.",
      stale:
        "{{directory}} now holds {{count}} unit tests; lower its test-dir-only-cross-functional allowlist entry from {{allowed}} to {{count}}.",
      resolved:
        "{{directory}} holds no unit tests; remove its test-dir-only-cross-functional allowlist entry.",
    },
  },
  create(context) {
    const [options] = crossFunctionalOptions.parse(context.options);

    const extra = (options?.crossFunctional ?? []).map(
      (pattern) => new RegExp(pattern, "u"),
    );

    return {
      Program(program) {
        const filename = context.physicalFilename;

        if (!testName.test(basename(filename))) {
          return;
        }

        const directory = testDirectory(filename);

        if (directory === undefined) {
          return;
        }

        const [entry, allowed] =
          allowances(context).find(([candidate]) =>
            isEntryFor(context.cwd, directory, candidate),
          ) ?? [];

        if (allowed === undefined) {
          if (isUnitTest(filename, extra)) {
            context.report({
              node: program,
              messageId: "unit",
              data: { directory: relative(context.cwd, directory) },
            });
          }

          return;
        }

        const tests = readdirSync(directory, {
          recursive: true,
          withFileTypes: true,
        })
          .filter((file) => file.isFile() && testName.test(file.name))
          .map((file) => join(file.parentPath, file.name))
          .filter((file) => !file.split(sep).includes("node_modules"))
          .toSorted();

        if (tests[0] !== filename) {
          return;
        }

        const count = tests.filter((test) => isUnitTest(test, extra)).length;

        const data = {
          directory: entry,
          count: String(count),
          allowed: String(allowed),
        };

        if (count > allowed) {
          context.report({ node: program, messageId: "grown", data });
        } else if (count === 0) {
          context.report({ node: program, messageId: "resolved", data });
        } else if (count < allowed) {
          context.report({ node: program, messageId: "stale", data });
        }
      },
    };
  },
});
