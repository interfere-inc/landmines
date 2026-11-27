import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { ResolverFactory } from "oxc-resolver";
import type { NapiResolveOptions } from "oxc-resolver";
import { parse } from "@babel/parser";
import {
  getBindingIdentifiers,
  isFunction,
  isScopable,
  traverse,
} from "@babel/types";
import type { Node } from "@babel/types";

export interface ModuleImport {
  specifier: string;
  mode: "import" | "require";
}

const companion = /\.(?:test|e2e|fixture|test-utils)\./u;
const testDirectories = new Set(["test", "tests", "__tests__"]);

const resolverOptions = {
  tsconfig: "auto",
  symlinks: false,
  extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  extensionAlias: {
    ".js": [".ts", ".tsx", ".js"],
    ".mjs": [".mts", ".mjs"],
    ".cjs": [".cts", ".cjs"],
  },
} satisfies NapiResolveOptions;

const resolvers = {
  import: new ResolverFactory({
    ...resolverOptions,
    conditionNames: ["monorepo", "import", "node", "default"],
  }),
  require: new ResolverFactory({
    ...resolverOptions,
    conditionNames: ["monorepo", "require", "node", "default"],
  }),
};

function requireBindings(file: Node) {
  const scopes = new WeakSet<Node>();

  traverse(file, (node, ancestors) => {
    if (isFunction(node)) {
      if (
        node.params.some((parameter) =>
          Object.hasOwn(getBindingIdentifiers(parameter), "require"),
        ) ||
        (node.type === "FunctionExpression" && node.id?.name === "require")
      ) {
        scopes.add(node);
      }
    } else if (
      (node.type === "CatchClause" &&
        node.param &&
        Object.hasOwn(getBindingIdentifiers(node.param), "require")) ||
      (node.type === "ClassExpression" && node.id?.name === "require") ||
      node.type === "WithStatement"
    ) {
      scopes.add(node);
    }

    if (
      !(
        node.type === "VariableDeclaration" ||
        node.type === "FunctionDeclaration" ||
        node.type === "ClassDeclaration" ||
        (node.type === "ImportDeclaration" && node.importKind !== "type") ||
        (node.type === "TSImportEqualsDeclaration" &&
          node.importKind !== "type")
      ) ||
      !Object.hasOwn(getBindingIdentifiers(node, false, true), "require")
    ) {
      return;
    }

    const owner = ancestors.findLast(({ node: parent }) =>
      node.type === "VariableDeclaration" && node.kind === "var"
        ? isFunction(parent) ||
          parent.type === "Program" ||
          parent.type === "StaticBlock" ||
          parent.type === "TSModuleBlock"
        : isScopable(parent),
    );

    if (owner) {
      scopes.add(owner.node);
    }
  });

  return scopes;
}

export function packageDirectory(directory: string) {
  let current = directory;

  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current);

    if (parent === current) {
      return current;
    }

    current = parent;
  }

  return current;
}

export function fileImports(filename: string) {
  const imports: ModuleImport[] = [];

  let file;

  try {
    file = parse(readFileSync(filename, "utf8"), {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"],
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return;
    }

    throw error;
  }

  const bindings = requireBindings(file);

  traverse(file, (node, ancestors) => {
    if (node.type === "ImportDeclaration") {
      const typeOnly =
        node.importKind === "type" ||
        (node.specifiers.length > 0 &&
          node.specifiers.every(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              specifier.importKind === "type",
          ));

      if (!typeOnly) {
        imports.push({ specifier: node.source.value, mode: "import" });
      }
    } else if (
      (node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
      node.exportKind !== "type" &&
      node.source
    ) {
      const typeOnly =
        node.type === "ExportNamedDeclaration" &&
        node.specifiers.length > 0 &&
        node.specifiers.every(
          (specifier) =>
            specifier.type === "ExportSpecifier" &&
            specifier.exportKind === "type",
        );

      if (!typeOnly) {
        imports.push({ specifier: node.source.value, mode: "import" });
      }
    } else if (
      node.type === "ImportExpression" &&
      node.source.type === "StringLiteral"
    ) {
      imports.push({ specifier: node.source.value, mode: "import" });
    } else if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "require" &&
      node.arguments.length === 1 &&
      node.arguments[0]?.type === "StringLiteral" &&
      !ancestors.some(({ node: parent }) => bindings.has(parent))
    ) {
      imports.push({ specifier: node.arguments[0].value, mode: "require" });
    } else if (
      node.type === "TSImportEqualsDeclaration" &&
      node.importKind !== "type" &&
      node.moduleReference.type === "TSExternalModuleReference"
    ) {
      imports.push({
        specifier: node.moduleReference.expression.value,
        mode: "require",
      });
    }
  });

  return imports;
}

function companionDirectory(filename: string, source: string) {
  const parts = relative(source, dirname(filename)).split(sep);
  const support = parts.findIndex((part) => testDirectories.has(part));

  return support === -1
    ? dirname(filename)
    : join(source, ...parts.slice(0, support));
}

function localModules(
  importer: string,
  directory: string,
  specifiers: readonly ModuleImport[],
) {
  return specifiers.flatMap(({ specifier, mode }) => {
    const target = resolvers[mode].resolveFileSync(importer, specifier).path;

    if (
      !target?.startsWith(`${directory}${sep}`) ||
      !/\.[cm]?[jt]sx?$/u.test(target) ||
      /\.d\.[cm]?ts$/u.test(target) ||
      packageDirectory(dirname(target)) !== directory
    ) {
      return [];
    }

    return [target];
  });
}

export function packageSources(
  testFilename: string,
  imports: readonly ModuleImport[],
) {
  const filename = realpathSync(testFilename);
  const directory = packageDirectory(dirname(filename));

  return localModules(filename, directory, imports).filter(
    (target) =>
      !companion.test(target) &&
      !relative(directory, target)
        .split(sep)
        .slice(0, -1)
        .some((part) => testDirectories.has(part)),
  );
}

export function testOwner(
  testFilename: string,
  imports: readonly ModuleImport[],
) {
  const filename = realpathSync(testFilename);
  const directory = packageDirectory(dirname(filename));
  const source = join(directory, "src");
  const visited = new Set<string>([filename]);
  const local = new Set<string>();
  const invalidCompanions = new Set<string>();
  const inferredOwners = new Set<string>();
  const ambiguousOwners = new Set<string>();

  function resolve(importer: string, specifiers: readonly ModuleImport[]) {
    return localModules(importer, directory, specifiers);
  }

  function isCompanion(target: string) {
    return (
      companion.test(target) ||
      relative(source, target)
        .split(sep)
        .slice(0, -1)
        .some((part) => testDirectories.has(part))
    );
  }

  function addSubject(target: string) {
    if (
      !["index", "app", "worker"].some(
        (entry) =>
          dirname(target) === source &&
          basename(target, extname(target)) === entry,
      )
    ) {
      local.add(dirname(target));
    }
  }

  function collectCompanion(target: string, owner: string) {
    if (visited.has(target)) {
      return;
    }

    visited.add(target);

    const nested = fileImports(target);

    if (nested === undefined) {
      invalidCompanions.add(target);

      return;
    }

    for (const imported of resolve(target, nested)) {
      if (isCompanion(imported)) {
        if (companionDirectory(imported, source) === owner) {
          collectCompanion(imported, owner);
        } else {
          ambiguousOwners.add(owner);
        }
      } else if (dirname(imported) === owner) {
        inferredOwners.add(owner);
      } else {
        ambiguousOwners.add(owner);
      }

      if (!isCompanion(imported) && isOwnedTest(filename, dirname(imported))) {
        addSubject(imported);
      }
    }
  }

  const resolved = resolve(filename, imports);

  if (
    resolved.some(
      (target) => !target.startsWith(`${source}${sep}`) && !isCompanion(target),
    )
  ) {
    return;
  }

  const companions = resolved.filter(
    (target) => target.startsWith(`${source}${sep}`) && isCompanion(target),
  );

  const packageHarness = resolved.some(
    (target) => !target.startsWith(`${source}${sep}`) && isCompanion(target),
  );

  const ownedCompanions = companions.filter((target) =>
    isOwnedTest(filename, companionDirectory(target, source)),
  );

  for (const target of resolved.filter(
    (candidate) =>
      candidate.startsWith(`${source}${sep}`) && !isCompanion(candidate),
  )) {
    addSubject(target);
  }

  for (const target of ownedCompanions.length > 0
    ? ownedCompanions
    : companions) {
    collectCompanion(target, companionDirectory(target, source));
  }

  if (invalidCompanions.size > 0) {
    return;
  }

  for (const owner of inferredOwners) {
    if (
      isOwnedTest(filename, owner) ||
      (!ambiguousOwners.has(owner) && !packageHarness)
    ) {
      local.add(owner);
    }
  }

  const owned = [...local].find((owner) => isOwnedTest(filename, owner));

  if (owned !== undefined) {
    return owned;
  }

  const [first] = local;

  if (first === undefined) {
    return;
  }

  let owner = first;

  for (const target of local) {
    while (target !== owner && !target.startsWith(`${owner}${sep}`)) {
      owner = dirname(owner);
    }
  }

  return owner !== source && local.has(owner) ? owner : undefined;
}

export function isOwnedTest(filename: string, owner: string) {
  const location = relative(owner, dirname(realpathSync(filename))).split(sep);

  return location[0] === "" || testDirectories.has(location[0] ?? "");
}
