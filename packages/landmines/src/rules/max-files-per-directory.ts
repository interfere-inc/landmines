import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { defineRule } from "@oxlint/plugins";

import {
  isCountedSource,
  isGeneratedPath,
  isTestFile,
  sizePolicy,
  sizeSchema,
} from "../lib/size-policy.ts";

export const maxFilesPerDirectory = defineRule({
  meta: {
    type: "suggestion",
    schema: sizeSchema,
    docs: {
      description:
        "Limit the source files that sit directly in one directory (tests and generated files excluded).",
    },
    messages: {
      many: "{{directory}} holds {{count}} source files directly (limit {{max}}). Group them into subdirectories by responsibility.",
      grown:
        "{{directory}} grew to {{count}} source files; its allowlist entry permits {{allowed}}. Split the directory instead of raising the entry.",
      stale:
        "{{directory}} now holds {{count}} source files; lower its max-files-per-directory entry from {{allowed}} to {{count}}, or remove it at or below {{max}}.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const filename = context.physicalFilename;

        if (!isCountedSource(filename)) {
          return;
        }

        const directory = dirname(filename);

        const siblings = readdirSync(directory, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isFile() &&
              isCountedSource(entry.name) &&
              !isTestFile(entry.name) &&
              !isGeneratedPath(entry.name),
          )
          .map((entry) => entry.name)
          .toSorted();

        if (siblings[0] !== basename(filename)) {
          return;
        }

        const count = siblings.length;

        const policy = sizePolicy(context, 20, "directory");

        const data = {
          directory: policy.path ?? directory,
          count: String(count),
          max: String(policy.max),
          allowed: String(policy.allowed),
        };

        if (policy.allowed === undefined) {
          if (count > policy.max) {
            context.report({ node: program, messageId: "many", data });
          }

          return;
        }

        if (count > policy.allowed) {
          context.report({ node: program, messageId: "grown", data });
        } else if (count < policy.allowed) {
          context.report({ node: program, messageId: "stale", data });
        }
      },
    };
  },
});
