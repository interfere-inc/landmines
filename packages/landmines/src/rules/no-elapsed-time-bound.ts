import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

const rootName: (node: ESTree.Node) => string | undefined = (node) => {
  if (node.type === "CallExpression") {
    return rootName(node.callee);
  }

  if (node.type === "MemberExpression") {
    return rootName(node.object);
  }

  if (node.type === "TaggedTemplateExpression") {
    return rootName(node.tag);
  }

  return node.type === "Identifier" ? node.name : undefined;
};

function member(node: ESTree.Node, property: string) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier" &&
    node.property.name === property
  );
}

function enclosingCallback(node: ESTree.Node, names: readonly string[]) {
  for (
    let current: ESTree.Node | null = node.parent;
    current;
    current = current.parent
  ) {
    if (
      (current.type === "ArrowFunctionExpression" ||
        current.type === "FunctionExpression") &&
      current.parent.type === "CallExpression" &&
      names.includes(rootName(current.parent.callee) ?? "")
    ) {
      return current;
    }
  }

  return null;
}

function clock(node: ESTree.Node) {
  return (
    node.type === "CallExpression" &&
    member(node.callee, "now") &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    ["Date", "performance"].includes(node.callee.object.name)
  );
}

function subtraction(node: ESTree.Node | null | undefined) {
  return (
    node?.type === "BinaryExpression" &&
    node.operator === "-" &&
    (clock(node.left) || clock(node.right))
  );
}

function elapsed(source: SourceCode, node: ESTree.Node) {
  if (subtraction(node)) {
    return true;
  }

  if (node.type !== "Identifier") {
    return false;
  }

  const owner = enclosingCallback(node, ["test", "it"]);

  if (!owner) {
    return false;
  }

  for (
    let scope: Scope | null = source.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);

    if (variable) {
      return variable.defs.some(
        ({ node: definition }) =>
          definition.type === "VariableDeclarator" &&
          enclosingCallback(definition, ["test", "it"]) === owner &&
          subtraction(definition.init),
      );
    }
  }

  return false;
}

export const noElapsedTimeBound = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Assert deadline ordering instead of elapsed wall-clock upper bounds.",
    },
    messages: {
      elapsed:
        "An upper bound on elapsed wall-clock time measures how busy the CI host was, not whether the deadline fired. Assert the ordering that proves the deadline (the abort signal fired before the held response, the lock predicate resolved while the lock was held) instead of how long the whole call took.",
    },
  },
  create(context) {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(context.filename)) {
      return {};
    }

    const violations: ESTree.CallExpression[] = [];
    const fakeTimers = new Set<ESTree.Node | null>();

    return {
      CallExpression(node) {
        if (
          member(node.callee, "useFakeTimers") &&
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          ["vi", "jest"].includes(node.callee.object.name)
        ) {
          fakeTimers.add(enclosingCallback(node, ["test", "it", "describe"]));
        }

        const matcher = node.callee;

        if (
          matcher.type !== "MemberExpression" ||
          matcher.computed ||
          matcher.property.type !== "Identifier"
        ) {
          return;
        }

        let assertion = matcher.object;

        const negated = member(assertion, "not");

        if (negated && assertion.type === "MemberExpression") {
          assertion = assertion.object;
        }

        const matchers = negated
          ? ["toBeGreaterThan", "toBeGreaterThanOrEqual"]
          : ["toBeLessThan", "toBeLessThanOrEqual"];

        if (
          !matchers.includes(matcher.property.name) ||
          assertion.type !== "CallExpression" ||
          assertion.callee.type !== "Identifier" ||
          assertion.callee.name !== "expect"
        ) {
          return;
        }

        const [value] = assertion.arguments;

        if (value && elapsed(context.sourceCode, value)) {
          violations.push(node);
        }
      },
      "Program:exit"() {
        for (const node of violations) {
          let current = node.parent;
          let fake = fakeTimers.has(null);

          while (current.type !== "Program" && !fake) {
            fake = fakeTimers.has(current);

            current = current.parent;
          }

          if (!fake) {
            context.report({ node, messageId: "elapsed" });
          }
        }
      },
    };
  },
});
