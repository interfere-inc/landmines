import type { ESTree, SourceCode } from "@oxlint/plugins";

function declaration(node: ESTree.Program["body"][number]) {
  return node.type === "ExportNamedDeclaration" ||
    node.type === "ExportDefaultDeclaration"
    ? node.declaration
    : node;
}

function isImport(node: ESTree.Program["body"][number]) {
  return (
    node.type === "ImportDeclaration" ||
    node.type === "TSImportEqualsDeclaration"
  );
}

function isAssertion(node: ESTree.Program["body"][number]) {
  if (
    node.type !== "ExpressionStatement" ||
    node.expression.type !== "CallExpression"
  ) {
    return false;
  }

  let expression = node.expression.callee;

  while (
    expression.type === "MemberExpression" ||
    expression.type === "CallExpression"
  ) {
    if (expression.type === "MemberExpression") {
      if (
        expression.computed ||
        expression.property.type !== "Identifier" ||
        ["resolves", "rejects", "poll"].includes(expression.property.name)
      ) {
        return false;
      }

      expression = expression.object;
    } else {
      if (
        expression.callee.type === "Identifier" &&
        expression.callee.name === "expect"
      ) {
        return true;
      }

      expression = expression.callee;
    }
  }

  return false;
}

function assignedObject(node: ESTree.Program["body"][number]) {
  if (
    node.type !== "ExpressionStatement" ||
    node.expression.type !== "AssignmentExpression" ||
    node.expression.left.type !== "MemberExpression"
  ) {
    return;
  }

  let { object } = node.expression.left;
  const path = [];

  while (
    object.type === "MemberExpression" &&
    !object.computed &&
    object.property.type === "Identifier"
  ) {
    path.unshift(object.property.name);

    ({ object } = object);
  }

  if (object.type === "Identifier" || object.type === "ThisExpression") {
    path.unshift(object.type === "Identifier" ? object.name : "this");

    return path.join(".");
  }

  return;
}

export function sameStatementGroup(
  previous: ESTree.Program["body"][number],
  next: ESTree.Program["body"][number],
  source: SourceCode,
) {
  if (isImport(previous) && isImport(next)) {
    return true;
  }

  const previousDeclaration = declaration(previous);
  const nextDeclaration = declaration(next);

  if (
    previousDeclaration?.type === "TSDeclareFunction" &&
    (nextDeclaration?.type === "TSDeclareFunction" ||
      nextDeclaration?.type === "FunctionDeclaration") &&
    previousDeclaration.id?.name === nextDeclaration.id?.name
  ) {
    return true;
  }

  if (
    previous.loc.start.line !== previous.loc.end.line ||
    next.loc.start.line !== next.loc.end.line ||
    previous.loc.end.line === next.loc.start.line ||
    [...source.getTokens(previous), ...source.getTokens(next)].some(
      (token) =>
        (token.type === "Identifier" || token.type === "Keyword") &&
        token.value === "await",
    )
  ) {
    return false;
  }

  if (
    previousDeclaration?.type === "VariableDeclaration" &&
    nextDeclaration?.type === "VariableDeclaration"
  ) {
    return true;
  }

  if (isAssertion(previous) && isAssertion(next)) {
    return true;
  }

  const object = assignedObject(previous);

  return object !== undefined && object === assignedObject(next);
}
