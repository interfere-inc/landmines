import type { Definition, ESTree, Scope, SourceCode } from "@oxlint/plugins";

const iterators = new Set([
  "every",
  "filter",
  "find",
  "flatMap",
  "forEach",
  "map",
  "some",
]);

const maxBindings = 64;

export interface Reference {
  readonly node: ESTree.Node;
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

function variableOf(source: SourceCode, node: ESTree.Node, name: string) {
  for (
    let scope: Scope | null = source.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(name);

    if (variable) {
      return variable;
    }
  }

  return;
}

function unwrap(node: ESTree.Node) {
  let value: ESTree.Node = node;

  while (
    value.type === "TSAsExpression" ||
    value.type === "TSSatisfiesExpression" ||
    value.type === "TSNonNullExpression"
  ) {
    value = value.expression;
  }

  return value;
}

function constArray(source: SourceCode, node: ESTree.Node) {
  let value = unwrap(node);

  for (let depth = 0; value.type === "Identifier" && depth < 8; depth += 1) {
    const variable = variableOf(source, value, value.name);
    const [definition] = variable?.defs ?? [];

    if (
      variable?.defs.length !== 1 ||
      definition?.node.type !== "VariableDeclarator" ||
      definition.parent?.type !== "VariableDeclaration" ||
      definition.parent.kind !== "const" ||
      !definition.node.init
    ) {
      return;
    }

    value = unwrap(definition.node.init);
  }

  return value.type === "ArrayExpression" ? value : undefined;
}

function literalElements(source: SourceCode, node: ESTree.Node) {
  const array = constArray(source, node);

  if (!array) {
    return;
  }

  const elements = array.elements.flatMap((element) =>
    element?.type === "Literal" || element?.type === "TemplateLiteral"
      ? [element]
      : [],
  );

  return elements.length === array.elements.length ? elements : undefined;
}

function loopElements(source: SourceCode, definition: Definition) {
  const declaration = definition.parent;
  const loop = declaration?.parent;

  return loop?.type === "ForOfStatement" && loop.left === declaration
    ? literalElements(source, loop.right)
    : undefined;
}

function callbackElements(
  source: SourceCode,
  definition: Definition,
  name: string,
) {
  const callback = definition.node;
  const call = callback.parent;

  if (
    (callback.type !== "ArrowFunctionExpression" &&
      callback.type !== "FunctionExpression") ||
    call?.type !== "CallExpression" ||
    call.arguments[0] !== callback ||
    callback.params[0]?.type !== "Identifier" ||
    callback.params[0].name !== name ||
    call.callee.type !== "MemberExpression" ||
    call.callee.computed ||
    call.callee.property.type !== "Identifier" ||
    !iterators.has(call.callee.property.name)
  ) {
    return;
  }

  return literalElements(source, call.callee.object);
}

function elementsOf(
  source: SourceCode,
  identifier: { node: ESTree.Node; name: string },
) {
  const variable = variableOf(source, identifier.node, identifier.name);
  const [definition] = variable?.defs ?? [];

  if (variable?.defs.length !== 1 || !definition) {
    return;
  }

  if (definition.type === "Variable") {
    return loopElements(source, definition);
  }

  return definition.type === "Parameter"
    ? callbackElements(source, definition, identifier.name)
    : undefined;
}

export function iterationBindings(
  source: SourceCode,
  node: ESTree.Node,
  references: readonly Reference[],
) {
  const bindings = [new Map<string, ESTree.Node>()];

  const inside = references.filter(
    (reference) => reference.start >= node.start && reference.end <= node.end,
  );

  for (const identifier of new Map(
    inside.map((reference) => [reference.name, reference]),
  ).values()) {
    const elements = elementsOf(source, identifier);

    if (!elements) {
      continue;
    }

    const expanded = bindings.flatMap((binding) =>
      elements.map((element) =>
        new Map<string, ESTree.Node>(binding).set(identifier.name, element),
      ),
    );

    if (expanded.length > maxBindings) {
      return [];
    }

    bindings.splice(0, bindings.length, ...expanded);
  }

  return bindings.length === 1 && bindings[0]?.size === 0 ? [] : bindings;
}
