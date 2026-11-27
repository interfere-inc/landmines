import { relative } from "node:path";
import { defineRule } from "@oxlint/plugins";
import type { Scope } from "@oxlint/plugins";
import { z } from "zod";

import { isOwnedTest, testOwner } from "../lib/test-owner.ts";
import type { ModuleImport } from "../lib/test-owner.ts";

export const colocatedTests = defineRule({
  meta: {
    type: "suggestion",
    schema: [],
    docs: {
      description:
        "Keep module tests beside their implementation or in its local test/ directory.",
    },
    messages: {
      detached:
        "This test has an implementation owner in {{owner}}. Move it beside that implementation or into its local test/ directory, including any test-specific fixtures and snapshots.",
    },
  },
  create(context) {
    const filename = context.physicalFilename;
    const imports: ModuleImport[] = [];

    if (!/\.test\.[cm]?[jt]sx?$/u.test(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        const typeOnly =
          node.importKind === "type" ||
          (node.specifiers.length > 0 &&
            node.specifiers.every(
              (specifier) =>
                specifier.type === "ImportSpecifier" &&
                specifier.importKind === "type",
            ));

        if (!typeOnly) {
          imports.push({ specifier: node.source.value, mode: "import" });
        }
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") {
          const parsed = z.string().safeParse(node.source.value);

          if (parsed.success) {
            imports.push({ specifier: parsed.data, mode: "import" });
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "require" ||
          node.arguments.length !== 1 ||
          node.arguments[0]?.type !== "Literal"
        ) {
          return;
        }

        for (
          let scope: Scope | null = context.sourceCode.getScope(node);
          scope;
          scope = scope.upper
        ) {
          if ((scope.set.get("require")?.defs.length ?? 0) > 0) {
            return;
          }
        }

        const parsed = z.string().safeParse(node.arguments[0].value);

        if (parsed.success) {
          imports.push({ specifier: parsed.data, mode: "require" });
        }
      },
      TSImportEqualsDeclaration(node) {
        if (
          node.importKind !== "type" &&
          node.moduleReference.type === "TSExternalModuleReference"
        ) {
          imports.push({
            specifier: node.moduleReference.expression.value,
            mode: "require",
          });
        }
      },
      "Program:exit"(node) {
        const owner = testOwner(filename, imports);

        if (owner !== undefined && !isOwnedTest(filename, owner)) {
          context.report({
            node,
            messageId: "detached",
            data: { owner: relative(context.cwd, owner) },
          });
        }
      },
    };
  },
});
