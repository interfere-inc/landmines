import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

function isHexByte(node: ESTree.CallExpression) {
  const [width, fill] = node.arguments;
  const { callee } = node;

  if (
    callee.type !== "MemberExpression" ||
    callee.property.type !== "Identifier" ||
    callee.property.name !== "padStart" ||
    width?.type !== "Literal" ||
    width.value !== 2 ||
    fill?.type !== "Literal" ||
    fill.value !== "0"
  ) {
    return false;
  }

  const radix = callee.object;

  return (
    radix.type === "CallExpression" &&
    radix.callee.type === "MemberExpression" &&
    radix.callee.property.type === "Identifier" &&
    radix.callee.property.name === "toString" &&
    radix.arguments[0]?.type === "Literal" &&
    radix.arguments[0].value === 16
  );
}

const loops = new Set([
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "WhileStatement",
]);

function isByteMapper(node: ESTree.Node) {
  let child = node;
  let current: ESTree.Node | null = node.parent;

  while (current) {
    if (
      loops.has(current.type) &&
      "body" in current &&
      current.body === child
    ) {
      return true;
    }

    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression"
    ) {
      const call = current.parent;

      if (call.type !== "CallExpression") {
        return false;
      }

      const { callee } = call;

      return (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        (callee.property.name === "map" ||
          callee.property.name === "reduce" ||
          (callee.property.name === "from" &&
            callee.object.type === "Identifier" &&
            callee.object.name === "Array"))
      );
    }

    child = current;
    current = current.parent;
  }

  return false;
}

export const noInlineHexEncoding = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Disallow per-byte toString(16).padStart(2, '0') hex encoding; use Uint8Array.prototype.toHex() or one shared helper.",
    },
    messages: {
      inlineHex:
        "Inline byte hex encoding: use Uint8Array.prototype.toHex() or one shared helper instead of a per-byte toString(16).padStart(2, '0') loop.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isHexByte(node) && isByteMapper(node)) {
          context.report({ node, messageId: "inlineHex" });
        }
      },
    };
  },
});
