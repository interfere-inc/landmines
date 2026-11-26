import { resolve } from "node:path";
import type { ESTree } from "@oxlint/plugins";

import { evaluate } from "./path-value.ts";
import type { PathContext } from "./path-value.ts";

const scans = new Set(["grep", "ls-files"]);

const grepValueOptions = new Set(["-e", "-f", "-m", "-A", "-B", "-C"]);

function cleanPathspec(pathspec: string) {
  const magic = /^:\((?<magic>glob|literal|icase)\)/u.exec(pathspec)?.groups?.[
    "magic"
  ];

  const plain = pathspec.slice(magic === undefined ? 0 : magic.length + 3);

  if (magic !== undefined || !plain.includes("*")) {
    return plain;
  }

  const parts = plain.split("/");
  const wildcard = parts.findIndex((part) => part.includes("*"));

  if (parts[wildcard] === "**") {
    return plain;
  }

  return [...parts.slice(0, wildcard), "**", ...parts.slice(wildcard)].join(
    "/",
  );
}

function scanPathspecs(argv: readonly string[]) {
  const command = argv.findIndex((argument) => scans.has(argument));

  if (command === -1) {
    return;
  }

  const rest = argv.slice(command + 1);
  const separator = rest.indexOf("--");

  if (separator !== -1) {
    return rest.slice(separator + 1);
  }

  const positional: string[] = [];
  let pattern = argv[command] === "grep";

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? "";

    if (grepValueOptions.has(argument)) {
      pattern &&= argument !== "-e" && argument !== "-f";

      index += 1;
    } else if (!argument.startsWith("-")) {
      positional.push(argument);
    }
  }

  return pattern ? positional.slice(1) : positional;
}

export function optionsCwd(
  options: ESTree.Node | undefined,
  context: PathContext,
) {
  if (options?.type !== "ObjectExpression") {
    return context.packageDirectory;
  }

  for (const property of options.properties) {
    if (
      property.type === "Property" &&
      !property.computed &&
      property.key.type === "Identifier" &&
      property.key.name === "cwd"
    ) {
      return evaluate(property.value, context);
    }
  }

  return context.packageDirectory;
}

export function scanReads(
  node: ESTree.Node,
  argv: readonly string[],
  cwd: string | undefined,
) {
  if (argv[0] !== "git" || cwd === undefined) {
    return [];
  }

  const global = argv.indexOf("-C");

  const base =
    global !== -1 && argv[global + 1] !== undefined
      ? resolve(cwd, argv[global + 1] ?? "")
      : cwd;

  const pathspecs = scanPathspecs(argv);

  if (pathspecs === undefined) {
    return [];
  }

  return (pathspecs.length > 0 ? pathspecs : ["."])
    .filter((pathspec) => !/^:[!^]/u.test(pathspec))
    .map((pathspec) => cleanPathspec(pathspec))
    .map((pathspec) => ({
      node,
      path: resolve(base, pathspec),
      tree: !pathspec.includes("*"),
    }));
}
