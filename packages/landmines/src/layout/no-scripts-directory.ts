import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineRule } from "@oxlint/plugins";

import { allowlistSchema } from "../lib/allowlist.ts";
import { allowances, isEntryFor } from "./allowance.ts";

const lintedFile = /\.[cm]?[jt]sx?$/u;

export function scriptsDirectory(root: string, filename: string) {
  const parts = relative(root, filename).split(sep);

  if (parts[0] === ".." || parts.includes("node_modules")) {
    return;
  }

  const index = parts.findIndex(
    (part, position) => position < parts.length - 1 && part === "scripts",
  );

  return index === -1 ? undefined : join(root, ...parts.slice(0, index + 1));
}

function scriptsDirectoryFiles(directory: string) {
  const files: string[] = [];
  const pending = [directory];

  for (let current = pending.pop(); current; current = pending.pop()) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      const path = join(current, entry.name);

      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  return files.toSorted();
}

export const noScriptsDirectory = defineRule({
  meta: {
    type: "suggestion",
    schema: allowlistSchema,
    docs: {
      description:
        "Keep code out of scripts folders: use the framework, vendor CLI or maintained GitHub Action that owns the job, or put the code in the package that owns it.",
    },
    messages: {
      forbidden:
        "{{directory}} is a scripts folder. Use the native feature of the framework, vendor CLI or maintained GitHub Action that owns this job; when none covers it, put the code in the package that owns the behaviour.",
      grown:
        "{{directory}} holds {{count}} files; its no-scripts-directory allowlist entry permits {{allowed}}. Remove files from scripts folders instead of raising the entry.",
      stale:
        "{{directory}} now holds {{count}} files; lower its no-scripts-directory allowlist entry from {{allowed}} to {{count}}.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const filename = context.physicalFilename;
        const directory = scriptsDirectory(context.cwd, filename);

        if (directory === undefined) {
          return;
        }

        const [entry, allowed] =
          allowances(context).find(([candidate]) =>
            isEntryFor(context.cwd, directory, candidate),
          ) ?? [];

        if (allowed === undefined) {
          context.report({
            node: program,
            messageId: "forbidden",
            data: { directory: relative(context.cwd, directory) },
          });

          return;
        }

        const files = scriptsDirectoryFiles(directory);

        if (files.find((file) => lintedFile.test(file)) !== filename) {
          return;
        }

        const data = {
          directory: entry,
          count: String(files.length),
          allowed: String(allowed),
        };

        if (files.length > allowed) {
          context.report({ node: program, messageId: "grown", data });
        } else if (files.length < allowed) {
          context.report({ node: program, messageId: "stale", data });
        }
      },
    };
  },
});
