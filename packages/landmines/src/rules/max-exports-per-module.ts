import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import {
  isGeneratedSource,
  isSourceFile,
  isTestFile,
  sizePolicy,
  sizeSchema,
} from "../lib/size-policy.ts";
import { workerBoundExports } from "../lib/worker-main.ts";

function exportedName(node: ESTree.ModuleExportName) {
  return node.type === "Identifier" ? node.name : node.value;
}

function declarationNames(node: ESTree.ExportNamedDeclaration) {
  const { declaration } = node;

  if (declaration?.type === "VariableDeclaration") {
    return declaration.declarations.map(({ id }) =>
      id.type === "Identifier" ? id.name : undefined,
    );
  }

  if (declaration?.type === "ClassDeclaration") {
    return [declaration.id?.name];
  }

  if (declaration) {
    return [undefined];
  }

  return node.specifiers.map(({ exported, exportKind }) =>
    exportKind === "type" || node.exportKind === "type"
      ? undefined
      : exportedName(exported),
  );
}

export const maxExportsPerModule = defineRule({
  meta: {
    type: "suggestion",
    schema: sizeSchema,
    docs: {
      description:
        "Limit the number of names a module exports (tests and generated files excluded). A Cloudflare Worker's wrangler main does not count the classes and entrypoints its wrangler config binds.",
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
    const names: (string | undefined)[] = [];

    return {
      ExportNamedDeclaration(node) {
        names.push(...declarationNames(node));
      },
      ExportDefaultDeclaration() {
        names.push(undefined);
      },
      ExportAllDeclaration() {
        names.push(undefined);
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

        const bound =
          names.length > policy.max || policy.allowed !== undefined
            ? workerBoundExports(filename)
            : new Set<string>();

        const count = names.filter(
          (name) => name === undefined || !bound.has(name),
        ).length;

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
