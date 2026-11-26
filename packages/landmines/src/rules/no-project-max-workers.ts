import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

function keyName(node: ESTree.Node) {
  if (node.type !== "Property") {
    return null;
  }

  if (!node.computed && node.key.type === "Identifier") {
    return node.key.name;
  }

  return node.key.type === "Literal" ? node.key.value : null;
}

export const noProjectMaxWorkers = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Reject ignored maxWorkers settings inside named Vitest projects.",
    },
    messages: {
      workers:
        "Vitest 5 ignores project-level maxWorkers for file scheduling; files that must be serial need fileParallelism: false, otherwise delete this.",
    },
  },
  create(context) {
    if (
      !/(?:^|\/)vitest[^/]*\.config\.[cm]?[jt]s$/u.test(
        context.physicalFilename.replaceAll("\\", "/"),
      )
    ) {
      return {};
    }

    return {
      Property(node) {
        if (
          keyName(node) !== "test" ||
          node.value.type !== "ObjectExpression" ||
          !node.value.properties.some(
            (property) => keyName(property) === "name",
          )
        ) {
          return;
        }

        for (const property of node.value.properties) {
          if (keyName(property) === "maxWorkers") {
            context.report({ node: property, messageId: "workers" });
          }
        }
      },
    };
  },
});
