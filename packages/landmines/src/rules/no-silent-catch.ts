import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";
import { isTestFile } from "../lib/size-policy.ts";

function isEmptyValue(node: ESTree.Node) {
  return (
    (node.type === "Identifier" && node.name === "undefined") ||
    (node.type === "Literal" && node.value === null) ||
    (node.type === "UnaryExpression" &&
      node.operator === "void" &&
      node.argument.type === "Literal")
  );
}

function isSilentHandler(node: ESTree.Node | undefined) {
  if (
    node?.type !== "ArrowFunctionExpression" &&
    node?.type !== "FunctionExpression"
  ) {
    return false;
  }

  const { body } = node;

  if (body?.type === "BlockStatement") {
    return body.body.length === 0;
  }

  return body !== null && isEmptyValue(body);
}

function methodName(node: ESTree.Node | null) {
  if (
    node?.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression" ||
    node.callee.property.type !== "Identifier"
  ) {
    return;
  }

  return node.callee.property.name;
}

function silencesRejection(node: ESTree.CallExpression) {
  const method = methodName(node);

  return (
    (method === "catch" && isSilentHandler(node.arguments[0])) ||
    (method === "then" && isSilentHandler(node.arguments[1]))
  );
}

function chainedCall(node: ESTree.Node) {
  const { parent } = node;

  if (parent?.type === "ChainExpression") {
    return parent;
  }

  if (parent?.type !== "MemberExpression" || parent.object !== node) {
    return;
  }

  const call = parent.parent;

  return call.type === "CallExpression" &&
    call.callee === parent &&
    ["catch", "finally", "then"].includes(methodName(call) ?? "")
    ? call
    : undefined;
}

function isDiscarded(node: ESTree.Node) {
  let current = node;

  for (let next = chainedCall(current); next; next = chainedCall(current)) {
    current = next;
  }

  const { parent } = current;

  return (
    parent?.type === "ExpressionStatement" ||
    (parent?.type === "UnaryExpression" && parent.operator === "void")
  );
}

export const noSilentCatch = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Disallow an empty rejection handler on a discarded promise; handle or record the rejection.",
    },
    messages: {
      silentCatch:
        "Discarded promise with an empty rejection handler: the failure disappears. Await it, or record the error in the handler (and hand the promise to waitUntil where the runtime offers one).",
      stale:
        "This file now has {{count}} discarded silent catches; lower its no-silent-catch allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    if (isTestFile(context.physicalFilename)) {
      return {};
    }

    const violations: ESTree.Node[] = [];

    return {
      CallExpression(node) {
        if (silencesRejection(node) && isDiscarded(node)) {
          violations.push(node);
        }
      },
      "Program:exit"(program) {
        reportAllowed(context, program, violations, "silentCatch");
      },
    };
  },
});
