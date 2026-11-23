import { defineRule } from "@oxlint/plugins";

import {
  isGeneratedSource,
  isSourceFile,
  isTestFile,
  sizePolicy,
  sizeSchema,
} from "../lib/size-policy.ts";

export const maxFileLines = defineRule({
  meta: {
    type: "suggestion",
    schema: sizeSchema,
    docs: {
      description:
        "Limit the length of a source file (tests and generated files excluded).",
    },
    messages: {
      long: "This file has {{count}} lines (limit {{max}}). Split it by responsibility.",
      grown:
        "This file grew to {{count}} lines; its allowlist entry {{path}} permits {{allowed}}. Split the file instead of raising the entry.",
      stale:
        "This file has {{count}} lines, within the {{max}} limit; remove its max-file-lines allowlist entry {{path}}.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const filename = context.physicalFilename;
        const { text } = context.sourceCode;

        if (
          !isSourceFile(filename) ||
          isTestFile(filename) ||
          isGeneratedSource(filename, text)
        ) {
          return;
        }

        const count = text.endsWith("\n")
          ? text.split("\n").length - 1
          : text.split("\n").length;

        const policy = sizePolicy(context, 500, "file");

        const data = {
          count: String(count),
          max: String(policy.max),
          path: String(policy.path),
          allowed: String(policy.allowed),
        };

        if (policy.allowed === undefined) {
          if (count > policy.max) {
            context.report({ node: program, messageId: "long", data });
          }

          return;
        }

        if (count > policy.allowed) {
          context.report({ node: program, messageId: "grown", data });
        } else if (count <= policy.max) {
          context.report({ node: program, messageId: "stale", data });
        }
      },
    };
  },
});
