import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { ResolverFactory } from "oxc-resolver";
import { parse } from "@babel/parser";
import { traverseFast } from "@babel/types";

const companion = /\.(?:test|e2e|fixture|test-utils)\./u;
const testDirectories = new Set(["test", "tests", "__tests__"]);

const resolver = new ResolverFactory({
  tsconfig: "auto",
  symlinks: false,
  conditionNames: ["monorepo", "import", "node", "default"],
  extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  extensionAlias: {
    ".js": [".ts", ".tsx", ".js"],
    ".mjs": [".mts", ".mjs"],
    ".cjs": [".cts", ".cjs"],
  },
});

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

function companionImports(filename: string) {
  const imports: string[] = [];

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

  traverseFast(file, (node) => {
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
        imports.push(node.source.value);
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
        imports.push(node.source.value);
      }
    } else if (
      node.type === "ImportExpression" &&
      node.source.type === "StringLiteral"
    ) {
      imports.push(node.source.value);
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

export function testOwner(testFilename: string, imports: readonly string[]) {
  const filename = realpathSync(testFilename);
  const directory = packageDirectory(dirname(filename));
  const source = join(directory, "src");
  const visited = new Set<string>([filename]);
  const local = new Set<string>();
  const invalidCompanions = new Set<string>();
  const inferredOwners = new Set<string>();
  const ambiguousOwners = new Set<string>();

  function resolve(importer: string, specifiers: readonly string[]) {
    return specifiers.flatMap((specifier) => {
      const target = resolver.resolveFileSync(importer, specifier).path;

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

    const nested = companionImports(target);

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
