import type { ESTree } from "@oxlint/plugins";

function callRoot(node: ESTree.Node) {
  let current = node;

  while (true) {
    if (current.type === "CallExpression") {
      current = current.callee;
    } else if (current.type === "MemberExpression") {
      current = current.object;
    } else if (current.type === "TaggedTemplateExpression") {
      current = current.tag;
    } else {
      return current.type === "Identifier" ? current.name : undefined;
    }
  }
}

function callbackKind(node: ESTree.Node) {
  const call = node.parent;

  if (
    (node.type !== "ArrowFunctionExpression" &&
      node.type !== "FunctionExpression") ||
    call?.type !== "CallExpression" ||
    !call.arguments.includes(node)
  ) {
    return;
  }

  return callRoot(call.callee);
}

export function isTestCallback(node: ESTree.Node) {
  const kind = callbackKind(node);

  return kind === "test" || kind === "it";
}

export function isTableCallback(node: ESTree.Node) {
  const kind = callbackKind(node);

  if (kind !== "test" && kind !== "it" && kind !== "describe") {
    return false;
  }

  let current = node.parent;

  while (current) {
    if (current.type === "MemberExpression") {
      if (
        !current.computed &&
        current.property.type === "Identifier" &&
        (current.property.name === "each" || current.property.name === "for")
      ) {
        return true;
      }

      current = current.object;
    } else if (current.type === "CallExpression") {
      current = current.callee;
    } else if (current.type === "TaggedTemplateExpression") {
      current = current.tag;
    } else {
      return false;
    }
  }

  return false;
}

export function isExpectRoot(node: ESTree.Node) {
  if (node.type !== "CallExpression") {
    return false;
  }

  const { callee } = node;

  return (
    (callee.type === "Identifier" && callee.name === "expect") ||
    (callee.type === "MemberExpression" &&
      callee.object.type === "Identifier" &&
      callee.object.name === "expect" &&
      !callee.computed &&
      callee.property.type === "Identifier" &&
      ["element", "poll", "soft"].includes(callee.property.name))
  );
}

export function isExpectChain(node: ESTree.Node) {
  let current = node;

  while (true) {
    if (isExpectRoot(current)) {
      return true;
    }

    if (current.type === "CallExpression") {
      current = current.callee;
    } else if (current.type === "MemberExpression") {
      current = current.object;
    } else {
      return false;
    }
  }
}
