import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import {
  isGeneratedSource,
  isSourceFile,
  isTestFile,
  sizePolicy,
  sizeSchema,
} from "../lib/size-policy.ts";

function declarationNames(declaration: ESTree.ExportNamedDeclaration) {
  const { declaration: inner } = declaration;

  if (inner?.type === "VariableDeclaration") {
    return inner.declarations.length;
  }

  return inner ? 1 : declaration.specifiers.length;
}

export const maxExportsPerModule = defineRule({
  meta: {
    type: "suggestion",
    schema: sizeSchema,
    docs: {
      description:
        "Limit the number of names a module exports (tests and generated files excluded).",
    },
    messages: {
      many: "This module exports {{count}} names (limit {{max}}). Split it by responsibility.",
      grown:
        "This module now exports {{count}} names; its allowlist entry {{path}} permits {{allowed}}. Split the module instead of raising the entry.",
      stale:
        "This module exports {{count}} names, within the {{max}} limit; remove its max-exports-per-module allowlist entry {{path}}.",
    },
  },
  create(context) {
    let count = 0;

    return {
      ExportNamedDeclaration(node) {
        count += declarationNames(node);
      },
      ExportDefaultDeclaration() {
        count += 1;
      },
      ExportAllDeclaration() {
        count += 1;
      },
      "Program:exit"(program) {
        const filename = context.physicalFilename;

        if (
          !isSourceFile(filename) ||
          isTestFile(filename) ||
          isGeneratedSource(filename, context.sourceCode.text)
        ) {
          return;
        }

        const policy = sizePolicy(context, 6, "file");

        const data = {
          count: String(count),
          max: String(policy.max),
          path: String(policy.path),
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
        } else if (count <= policy.max) {
          context.report({ node: program, messageId: "stale", data });
        }
      },
    };
  },
});
