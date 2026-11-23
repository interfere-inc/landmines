import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";

function root(node: ESTree.Node) {
  let current = node;

  while (current.type === "MemberExpression") {
    current = current.object;
  }

  return current.type === "Identifier" ? current : undefined;
}

function imported(scope: Scope | null, name: string) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);

    if (variable) {
      return variable.defs.some(
        (definition) =>
          definition.type === "ImportBinding" ||
          definition.node.type === "ImportSpecifier" ||
          definition.node.type === "ImportDefaultSpecifier" ||
          definition.node.type === "ImportNamespaceSpecifier",
      );
    }
  }

  return false;
}

const mutators: Record<string, readonly string[]> = {
  Object: ["assign", "defineProperty", "defineProperties"],
  Reflect: ["set", "defineProperty", "deleteProperty"],
};

function mutatedArgument(node: ESTree.CallExpression) {
  const { callee } = node;

  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.object.type !== "Identifier" ||
    callee.property.type !== "Identifier"
  ) {
    return null;
  }

  if (!mutators[callee.object.name]?.includes(callee.property.name)) {
    return null;
  }

  const [target] = node.arguments;

  return target && target.type !== "SpreadElement" ? target : null;
}

export const noImportedMutation = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Inject test values through options or bindings instead of assigning to, defining or deleting properties of an imported module's object.",
    },
    messages: {
      mutation:
        "Assigning to, defining or deleting a property of an imported binding (including through Object.assign and Reflect) mutates shared module state that every other test in the isolate reads, and a failed restore leaks it. Inject the value through the function's options, the Worker's test binding or a declared test seam, and make the module value readonly.",
      stale:
        "This file now has {{count}} imported-binding mutations; lower its no-imported-mutation allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    if (
      !/\.(?:test|spec|fixture|test-utils)\.[cm]?[jt]sx?$/u.test(
        context.filename,
      )
    ) {
      return {};
    }

    const violations: ESTree.Node[] = [];

    function record(node: ESTree.Node, expression: ESTree.Node) {
      const target = root(expression);

      if (
        target &&
        imported(context.sourceCode.getScope(target), target.name)
      ) {
        violations.push(node);
      }
    }

    return {
      AssignmentExpression(node) {
        if (node.left.type === "MemberExpression") {
          record(node, node.left);
        }
      },
      CallExpression(node) {
        const target = mutatedArgument(node);

        if (target) {
          record(node, target);
        }
      },
      UnaryExpression(node) {
        if (
          node.operator === "delete" &&
          node.argument.type === "MemberExpression"
        ) {
          record(node, node.argument);
        }
      },
      "Program:exit"(program) {
        reportAllowed(context, program, violations, "mutation");
      },
    };
  },
});
