import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { defineRule } from "@oxlint/plugins";
import { z } from "zod";

import { allowances, isEntryFor } from "../layout/allowance.ts";
import { allowlistSchema } from "../lib/allowlist.ts";
import { packageDirectory } from "../lib/test-owner.ts";

const standardNames = new Set([
  "build",
  "clean",
  "deploy",
  "dev",
  "format",
  "lint",
  "lint:oxlint",
  "postinstall",
  "preinstall",
  "prepare",
  "preview",
  "release",
  "rollback",
  "start",
  "test",
  "typecheck",
  "typegen",
]);

const sourceRunner =
  /(?:^|[\s;&|(])(?:bun|node|tsx|ts-node)(?:\s+run)?(?:\s+-{1,2}[\w-]+(?:=\S+)?)*\s+["']?[^\s"';&|]+\.(?:[cm]?[jt]s|tsx)\b/u;

const manifestSchema = z.object({
  scripts: z.record(z.string(), z.string()).optional(),
});

export function bespokeScripts(manifest: string) {
  const { scripts = {} } = manifestSchema.parse(JSON.parse(manifest));

  return Object.entries(scripts)
    .filter(
      ([name, command]) =>
        !standardNames.has(name) || sourceRunner.test(command),
    )
    .map(([name]) => name)
    .toSorted();
}

const claimed = new Map<string, string>();

export const packageScriptsRule = defineRule({
  meta: {
    type: "suggestion",
    schema: allowlistSchema,
    docs: {
      description:
        "Keep package.json scripts to standard task names that call a tool, not bespoke names or TypeScript files run with bun or node.",
    },
    messages: {
      bespoke:
        "{{manifest}} defines bespoke scripts: {{scripts}}. Use a standard task name ({{standard}}) that calls the framework or vendor CLI, or replace the script with that tool's native feature or a maintained GitHub Action.",
      grown:
        "{{manifest}} defines {{count}} bespoke scripts ({{scripts}}); its package-scripts allowlist entry permits {{allowed}}. Remove a script instead of raising the entry.",
      stale:
        "{{manifest}} now defines {{count}} bespoke scripts; lower its package-scripts allowlist entry from {{allowed}} to {{count}}.",
      resolved:
        "{{manifest}} defines no bespoke scripts; remove its package-scripts allowlist entry.",
    },
  },
  create(context) {
    const filename = context.physicalFilename;
    const path = join(packageDirectory(dirname(filename)), "package.json");

    if (!existsSync(path)) {
      return {};
    }

    const owner = claimed.get(path) ?? filename;

    claimed.set(path, owner);

    if (owner !== filename) {
      return {};
    }

    const scripts = bespokeScripts(readFileSync(path, "utf8"));
    const manifest = relative(context.cwd, path);

    const [, allowed = 0] =
      allowances(context).find(([candidate]) =>
        isEntryFor(context.cwd, path, candidate),
      ) ?? [];

    const data = {
      manifest,
      scripts: scripts.join(", "),
      standard: [...standardNames].join(", "),
      count: String(scripts.length),
      allowed: String(allowed),
    };

    return {
      Program(program) {
        if (scripts.length > allowed) {
          context.report({
            node: program,
            messageId: allowed === 0 ? "bespoke" : "grown",
            data,
          });
        } else if (scripts.length < allowed) {
          context.report({
            node: program,
            messageId: scripts.length === 0 ? "resolved" : "stale",
            data,
          });
        }
      },
    };
  },
});
