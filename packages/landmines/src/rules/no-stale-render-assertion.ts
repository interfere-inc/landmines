import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { enclosingStatement } from "../lib/ast-search.ts";

const browserTest = /\.browser\.test\.[cm]?[jt]sx?$/u;

const renders =
  /(?:\brenderHook\s*\(|\.rerender\s*\(|\bact\s*\(|\bexpect\s*\.\s*element\s*\()/u;

function propertyName(node: ESTree.MemberExpression) {
  return node.property.type === "Identifier" && !node.computed
    ? node.property.name
    : undefined;
}

function renderedHook(node: ESTree.Node) {
  let current: ESTree.Node =
    node.type === "ChainExpression" ? node.expression : node;

  while (current.type === "MemberExpression") {
    if (
      propertyName(current) === "current" &&
      current.object.type === "MemberExpression" &&
      propertyName(current.object) === "result" &&
      current.object.object.type === "Identifier"
    ) {
      return current.object.object.name;
    }

    current = current.object;
  }

  return null;
}

function assertedHook(node: ESTree.CallExpression) {
  const [argument] = node.arguments;

  return node.callee.type === "Identifier" &&
    node.callee.name === "expect" &&
    argument
    ? renderedHook(argument)
    : null;
}

function awaited(node: ESTree.Node) {
  for (let current = node; current.parent; current = current.parent) {
    if (current.parent.type === "AwaitExpression") {
      return true;
    }

    if (
      current.parent.type !== "MemberExpression" &&
      current.parent.type !== "CallExpression"
    ) {
      return false;
    }
  }

  return false;
}

function awaitedExpression(statement: ESTree.Node) {
  if (
    statement.type === "ExpressionStatement" &&
    statement.expression.type === "AwaitExpression"
  ) {
    return statement.expression.argument;
  }

  if (statement.type === "VariableDeclaration") {
    const expression = statement.declarations.find(
      ({ init }) => init?.type === "AwaitExpression",
    )?.init;

    return expression?.type === "AwaitExpression" ? expression.argument : null;
  }

  return null;
}

function polledCallback(expression: ESTree.Node) {
  let current = expression;

  while (current.type === "CallExpression") {
    const { callee } = current;

    if (callee.type !== "MemberExpression") {
      return null;
    }

    if (callee.object.type === "Identifier") {
      const method = propertyName(callee);

      if (
        (callee.object.name === "expect" && method === "poll") ||
        (callee.object.name === "vi" &&
          (method === "waitFor" || method === "waitUntil"))
      ) {
        return current.arguments[0] ?? null;
      }

      return null;
    }

    current = callee.object;
  }

  return null;
}

export const noStaleRenderAssertion = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Require a rendered hook value to be polled, not read synchronously after a poll on other state.",
    },
    messages: {
      stale:
        "{{hook}}.result.current is the last React render, and the awaited poll before it watched {{polled}}, which updates a macrotask before the component re-renders (query cache, store, recorder). The sample that satisfied the poll can land inside that window, so this synchronous read sees the previous render. Poll the rendered value instead: await expect.poll(() => {{hook}}.result.current).toStrictEqual(expected).",
    },
  },
  create(context) {
    if (!browserTest.test(context.physicalFilename)) {
      return {};
    }

    const { text } = context.sourceCode;

    function slice(node: ESTree.Node) {
      return text.slice(node.range[0], node.range[1]);
    }

    return {
      CallExpression(node) {
        const hook = assertedHook(node);

        if (!hook || awaited(node)) {
          return;
        }

        const location = enclosingStatement(node);

        if (!location) {
          return;
        }

        const { block, statement } = location;
        const reads = new RegExp(`\\b${hook}\\s*\\.\\s*result\\b`, "u");
        const preceding: ESTree.Node[] = [];

        for (const candidate of block.body) {
          if (candidate === statement) {
            break;
          }

          preceding.push(candidate);
        }

        for (const candidate of preceding.toReversed()) {
          const expression = awaitedExpression(candidate);

          if (!expression) {
            continue;
          }

          const callback = polledCallback(expression);

          if (!callback) {
            if (renders.test(slice(expression))) {
              return;
            }

            continue;
          }

          const polled = slice(callback);

          if (reads.test(polled)) {
            return;
          }

          context.report({
            node,
            messageId: "stale",
            data: { hook, polled: polled.replaceAll(/\s+/gu, " ") },
          });

          return;
        }
      },
    };
  },
});
