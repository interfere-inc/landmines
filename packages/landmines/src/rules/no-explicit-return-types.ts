import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { containsNode } from "../lib/ast-search.ts";

const lazyCallees = new Set(["suspend", "lazy"]);

function calleeName(node: ESTree.Expression) {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
  ) {
    return node.property.name;
  }

  return;
}

function isSuspendedThunk(
  node: ESTree.Function | ESTree.ArrowFunctionExpression,
) {
  if (node.params.length > 0) {
    return false;
  }

  const { parent } = node;

  if (
    parent.type !== "CallExpression" ||
    !parent.arguments.some((argument) => argument === node)
  ) {
    return false;
  }

  const name = calleeName(parent.callee);

  return name !== undefined && lazyCallees.has(name);
}

function isValueReference(node: ESTree.Node) {
  const { parent } = node;

  if (parent === null) {
    return false;
  }

  if (
    parent.type === "MemberExpression" &&
    !parent.computed &&
    parent.property === node
  ) {
    return false;
  }

  if (
    parent.type === "Property" &&
    !parent.computed &&
    !parent.shorthand &&
    parent.key === node
  ) {
    return false;
  }

  if (
    (parent.type === "MethodDefinition" ||
      parent.type === "PropertyDefinition" ||
      parent.type === "TSPropertySignature") &&
    !parent.computed &&
    parent.key === node
  ) {
    return false;
  }

  if (
    (parent.type === "VariableDeclarator" ||
      parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ClassDeclaration" ||
      parent.type === "ClassExpression") &&
    parent.id === node
  ) {
    return false;
  }

  if (
    parent.type === "LabeledStatement" ||
    parent.type === "BreakStatement" ||
    parent.type === "ContinueStatement" ||
    parent.type === "TSTypeReference"
  ) {
    return false;
  }

  return true;
}

function bindingNames(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
  const names: string[] = [];

  if (node.type !== "ArrowFunctionExpression" && node.id !== null) {
    names.push(node.id.name);
  }

  let current: ESTree.Node = node;

  while (
    current.parent.type === "CallExpression" &&
    current.parent.arguments.some((argument) => argument === current)
  ) {
    current = current.parent;
  }

  if (
    current.parent.type === "VariableDeclarator" &&
    current.parent.init === current &&
    current.parent.id.type === "Identifier"
  ) {
    names.push(current.parent.id.name);
  }

  return names;
}

function enclosingClassName(method: ESTree.MethodDefinition) {
  const body = method.parent;

  if (body.type !== "ClassBody") {
    return;
  }

  const declaration = body.parent;

  if (
    (declaration.type === "ClassDeclaration" ||
      declaration.type === "ClassExpression") &&
    declaration.id !== null
  ) {
    return declaration.id.name;
  }

  return;
}

function isSelfRecursive(
  node: ESTree.Function | ESTree.ArrowFunctionExpression,
) {
  const { body } = node;

  if (body === null) {
    return false;
  }

  const names = bindingNames(node);

  if (
    names.length > 0 &&
    containsNode(
      body,
      (candidate) =>
        candidate.type === "Identifier" &&
        names.includes(candidate.name) &&
        isValueReference(candidate),
    )
  ) {
    return true;
  }

  const { parent } = node;

  if (
    parent.type === "MethodDefinition" &&
    parent.value === node &&
    !parent.computed &&
    parent.key.type === "Identifier"
  ) {
    const methodName = parent.key.name;

    const className = parent.static ? enclosingClassName(parent) : undefined;

    return containsNode(
      body,
      (candidate) =>
        candidate.type === "MemberExpression" &&
        !candidate.computed &&
        candidate.property.type === "Identifier" &&
        candidate.property.name === methodName &&
        (candidate.object.type === "ThisExpression" ||
          (className !== undefined &&
            candidate.object.type === "Identifier" &&
            candidate.object.name === className)),
    );
  }

  return false;
}

export const noExplicitReturnTypes = defineRule({
  meta: {
    type: "suggestion",
    schema: [],
    docs: {
      description: "Infer return types on function implementations.",
    },
    messages: {
      noExplicitReturnType:
        "Remove the explicit return type and let it be inferred; pin a contract with a typed variable or `satisfies` at the return site instead.",
    },
  },
  create(context) {
    function check(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
      if (
        node.body !== null &&
        node.returnType !== undefined &&
        node.returnType !== null &&
        node.returnType.typeAnnotation.type !== "TSTypePredicate" &&
        node.returnType.typeAnnotation.type !== "TSNeverKeyword" &&
        !isSuspendedThunk(node) &&
        !isSelfRecursive(node)
      ) {
        context.report({
          node: node.returnType,
          messageId: "noExplicitReturnType",
        });
      }
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
});
