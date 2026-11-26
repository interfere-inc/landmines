import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";
import { z } from "zod";

export const unknownSegment = "\u2217";

export interface PathContext {
  readonly filename: string;
  readonly packageDirectory: string;
  readonly root: string;
  readonly source: SourceCode;
  readonly bindings?: ReadonlyMap<string, ESTree.Node> | undefined;
}

const pathCalls = new Set(["resolve", "join", "dirname"]);
const passThroughCalls = new Set(["trim", "trimEnd", "toString", "String"]);

const argvCalls = new Set([
  "execFile",
  "execFileSync",
  "spawn",
  "spawnSync",
  "execa",
  "execaSync",
]);

const shellCalls = new Set(["exec", "execSync"]);

export function callName(callee: ESTree.Node) {
  if (callee.type === "Identifier") {
    return callee.name;
  }

  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }

  return;
}

function constInitializer(source: SourceCode, node: ESTree.Node) {
  if (node.type !== "Identifier") {
    return;
  }

  for (
    let scope: Scope | null = source.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);

    if (!variable) {
      continue;
    }

    const [definition] = variable.defs;

    if (
      variable.defs.length !== 1 ||
      definition?.node.type !== "VariableDeclarator" ||
      definition.node.id.type !== "Identifier" ||
      variable.references.some(
        (reference) => reference.isWrite() && !reference.init,
      )
    ) {
      return;
    }

    return definition.node.init ?? undefined;
  }

  return;
}

function isImportMeta(node: ESTree.Node) {
  return (
    node.type === "MetaProperty" &&
    node.meta.name === "import" &&
    node.property.name === "meta"
  );
}

function argumentValues(
  nodes: readonly ESTree.Node[],
  context: PathContext,
  seen: Set<ESTree.Node>,
) {
  return nodes.map((node) =>
    node.type === "SpreadElement" ? undefined : evaluate(node, context, seen),
  );
}

export function commandArguments(
  node: ESTree.CallExpression,
  context: PathContext,
  seen = new Set<ESTree.Node>(),
) {
  const name = callName(node.callee);
  const [first, second, third] = node.arguments;

  if (name !== undefined && shellCalls.has(name) && first) {
    const command = evaluate(first, context, seen);

    return command === undefined
      ? undefined
      : { argv: command.trim().split(/\s+/u), options: second };
  }

  if (
    (name === "spawn" || name === "spawnSync") &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "Bun" &&
    first?.type === "ArrayExpression"
  ) {
    return {
      argv: argumentValues(
        first.elements.filter((element) => element !== null),
        context,
        seen,
      ).map((value) => value ?? unknownSegment),
      options: second,
    };
  }

  if (name === undefined || !argvCalls.has(name) || !first) {
    return;
  }

  const executable = evaluate(first, context, seen);

  if (executable === undefined) {
    return;
  }

  if (second?.type !== "ArrayExpression") {
    return { argv: [executable], options: second };
  }

  return {
    argv: [
      executable,
      ...argumentValues(
        second.elements.filter((element) => element !== null),
        context,
        seen,
      ).map((value) => value ?? unknownSegment),
    ],
    options: third,
  };
}

function isRepositoryRoot(argv: readonly string[]) {
  return (
    argv[0] === "git" &&
    argv.includes("rev-parse") &&
    argv.includes("--show-toplevel")
  );
}

function resolveValues(values: readonly (string | undefined)[], base: string) {
  let current: string | undefined = values[0] === undefined ? undefined : base;

  for (const value of values) {
    if (value !== undefined && isAbsolute(value)) {
      current = value;
    } else if (current !== undefined) {
      current = resolve(current, value ?? unknownSegment);
    }
  }

  return current;
}

function urlValue(
  node: ESTree.NewExpression,
  context: PathContext,
  seen: Set<ESTree.Node>,
) {
  const [relative, base] = argumentValues(node.arguments, context, seen);

  if (relative === undefined) {
    return;
  }

  try {
    return new URL(relative, base).href;
  } catch (error) {
    if (error instanceof TypeError) {
      return;
    }

    throw error;
  }
}

export function pathFromUrl(value: string | undefined) {
  if (value === undefined || !value.startsWith("file:")) {
    return value;
  }

  try {
    return fileURLToPath(value);
  } catch (error) {
    if (error instanceof TypeError) {
      return;
    }

    throw error;
  }
}

function memberValue(
  node: ESTree.MemberExpression,
  context: PathContext,
  seen: Set<ESTree.Node>,
) {
  if (node.computed || node.property.type !== "Identifier") {
    return;
  }

  const property = node.property.name;

  if (isImportMeta(node.object)) {
    if (property === "dirname" || property === "dir") {
      return dirname(context.filename);
    }

    if (property === "filename" || property === "path") {
      return context.filename;
    }

    return property === "url"
      ? pathToFileURL(context.filename).href
      : undefined;
  }

  if (property === "pathname") {
    return pathFromUrl(evaluate(node.object, context, seen));
  }

  return property === "href" ? evaluate(node.object, context, seen) : undefined;
}

function callValue(
  node: ESTree.CallExpression,
  context: PathContext,
  seen: Set<ESTree.Node>,
) {
  const name = callName(node.callee);

  if (name === undefined) {
    return;
  }

  if (
    name === "cwd" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "process"
  ) {
    return context.packageDirectory;
  }

  if (passThroughCalls.has(name)) {
    const [target] = node.arguments;

    if (name === "String" && target) {
      return evaluate(target, context, seen);
    }

    return node.callee.type === "MemberExpression"
      ? evaluate(node.callee.object, context, seen)
      : undefined;
  }

  if (name === "fileURLToPath") {
    const [target] = node.arguments;

    return target ? pathFromUrl(evaluate(target, context, seen)) : undefined;
  }

  if (pathCalls.has(name)) {
    const values = argumentValues(node.arguments, context, seen);

    if (name === "dirname") {
      return values[0] === undefined ? undefined : dirname(values[0]);
    }

    if (name === "join") {
      return values[0] === undefined
        ? undefined
        : join(...values.map((value) => value ?? unknownSegment));
    }

    return resolveValues(values, context.packageDirectory);
  }

  const command = commandArguments(node, context, seen);

  return command && isRepositoryRoot(command.argv) ? context.root : undefined;
}

export const evaluate: (
  node: ESTree.Node,
  context: PathContext,
  seen?: Set<ESTree.Node>,
) => string | undefined = (node, context, seen = new Set()) => {
  if (seen.has(node)) {
    return;
  }

  seen.add(node);

  try {
    if (
      node.type === "TSAsExpression" ||
      node.type === "TSNonNullExpression" ||
      node.type === "TSSatisfiesExpression" ||
      node.type === "ParenthesizedExpression"
    ) {
      return evaluate(node.expression, context, seen);
    }

    switch (node.type) {
      case "Literal": {
        const value = z.string().safeParse(node.value);

        return value.success ? value.data : undefined;
      }
      case "TemplateLiteral": {
        return node.quasis
          .map((quasi, index) => {
            const expression = node.expressions[index];

            return `${quasi.value.cooked ?? quasi.value.raw}${
              expression
                ? (evaluate(expression, context, seen) ?? unknownSegment)
                : ""
            }`;
          })
          .join("");
      }
      case "Identifier": {
        const bound = context.bindings?.get(node.name);

        if (bound) {
          return evaluate(
            bound,
            {
              ...context,
              bindings: new Map(
                [...(context.bindings ?? [])].filter(
                  ([name]) => name !== node.name,
                ),
              ),
            },
            seen,
          );
        }

        if (node.name === "__dirname") {
          return dirname(context.filename);
        }

        if (node.name === "__filename") {
          return context.filename;
        }

        const initializer = constInitializer(context.source, node);

        return initializer ? evaluate(initializer, context, seen) : undefined;
      }
      case "MemberExpression": {
        return memberValue(node, context, seen);
      }
      case "NewExpression": {
        return callName(node.callee) === "URL"
          ? urlValue(node, context, seen)
          : undefined;
      }
      case "CallExpression": {
        return callValue(node, context, seen);
      }
      case "AwaitExpression": {
        return evaluate(node.argument, context, seen);
      }
      default: {
        return;
      }
    }
  } finally {
    seen.delete(node);
  }
};
