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

export const noImportedMutation = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Inject test values through options or bindings instead of assigning to an imported module's object.",
    },
    messages: {
      mutation:
        "Assigning to a property of an imported binding mutates shared module state that every other test in the isolate reads, and a failed restore leaks it. Inject the value through the function's options, the Worker's test binding or a declared test seam, and make the module value readonly.",
      stale:
        "This file now has {{count}} imported-binding mutations; lower its no-imported-mutation allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(context.filename)) {
      return {};
    }

    const violations: ESTree.Node[] = [];

    return {
      AssignmentExpression(node) {
        if (node.left.type !== "MemberExpression") {
          return;
        }

        const target = root(node.left);

        if (
          target &&
          imported(context.sourceCode.getScope(target), target.name)
        ) {
          violations.push(node);
        }
      },
      "Program:exit"(program) {
        reportAllowed(context, program, violations, "mutation");
      },
    };
  },
});
