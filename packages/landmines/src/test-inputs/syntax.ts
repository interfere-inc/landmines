import type { ESTree } from "@oxlint/plugins";

import { callName } from "./path-value.ts";
import {
  consumingParents,
  memberProducers,
  pathProducers,
  writes,
} from "./read-calls.ts";

export type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

export function isProducer(node: ESTree.Node) {
  const { parent } = node;

  if (!parent) {
    return false;
  }

  if (consumingParents.has(parent.type)) {
    return true;
  }

  if (parent.type === "MemberExpression") {
    return (
      parent.object === node &&
      !parent.computed &&
      parent.property.type === "Identifier" &&
      memberProducers.has(parent.property.name)
    );
  }

  if (parent.type === "CallExpression" || parent.type === "NewExpression") {
    const name = callName(parent.callee);

    return (
      name !== undefined &&
      pathProducers.has(name) &&
      parent.arguments.some((argument) => argument === node)
    );
  }

  return false;
}

export function functionName(node: FunctionNode) {
  if (node.type === "FunctionDeclaration") {
    return node.id?.name;
  }

  const { parent } = node;

  return parent.type === "VariableDeclarator" && parent.id.type === "Identifier"
    ? parent.id.name
    : undefined;
}

export function enclosingHelper(node: ESTree.Node) {
  for (
    let current: ESTree.Node | null = node.parent;
    current;
    current = current.parent
  ) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression" ||
      current.type === "FunctionDeclaration"
    ) {
      return functionName(current) === undefined ? undefined : current;
    }
  }

  return;
}

export function isWrite(node: ESTree.Node) {
  const { parent } = node;

  if (parent?.type !== "CallExpression" || parent.arguments[0] !== node) {
    return false;
  }

  const name = callName(parent.callee);

  return name !== undefined && writes.has(name);
}
