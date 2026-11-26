import { readdirSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import { defineRule } from "@oxlint/plugins";

import { allowlistSchema } from "../lib/allowlist.ts";
import { isGeneratedPath } from "../lib/size-policy.ts";
import { allowances, isEntryFor } from "./allowance.ts";

const minimum = 3;
const moduleFile = /\.(?:[cm]?[jt]sx?|tf|hcl|go|rs|py|php|sql|sh)$/u;
const lintedFile = /\.[cm]?[jt]sx?$/u;
const routes = /\/src\/routes(?:\/|$)/u;
const testDirectories = new Set(["test", "tests", "__tests__"]);

const verbs = new Set([
  "add",
  "apply",
  "archive",
  "assert",
  "authenticate",
  "build",
  "check",
  "compute",
  "create",
  "delete",
  "ensure",
  "fetch",
  "format",
  "from",
  "get",
  "has",
  "is",
  "link",
  "list",
  "load",
  "make",
  "mark",
  "merge",
  "no",
  "parse",
  "prepare",
  "read",
  "record",
  "remove",
  "render",
  "resolve",
  "restore",
  "run",
  "seed",
  "send",
  "set",
  "subscribe",
  "sync",
  "to",
  "unlink",
  "unsubscribe",
  "update",
  "use",
  "verify",
  "with",
  "wrap",
  "write",
]);

function moduleName(file: string) {
  return file.slice(0, file.indexOf("."));
}

function singular(name: string) {
  return name
    .toLowerCase()
    .replace(/^[-_$]/u, "")
    .replace(/ies$/u, "y")
    .replace(/s$/u, "");
}

function stutters(directory: string, stem: string) {
  const name = singular(stem);

  return directory
    .split("/")
    .filter((part) => !testDirectories.has(part))
    .slice(-3)
    .some((part) => singular(part).split("-").includes(name));
}

function clusters(directory: string, files: readonly string[]) {
  const modules = new Set(files.map((file) => moduleName(file)));
  const stems = new Map<string, Set<string>>();

  for (const name of modules) {
    if (name.indexOf("-") > 0) {
      const stem = name.slice(0, name.indexOf("-"));

      stems.set(stem, new Set([...(stems.get(stem) ?? []), name]));
    }
  }

  return new Map(
    [...stems].flatMap(([stem, prefixed]) =>
      prefixed.size >= minimum &&
      !verbs.has(stem) &&
      !stutters(directory, stem) &&
      files.some(
        (file) =>
          lintedFile.test(file) &&
          (prefixed.has(moduleName(file)) || moduleName(file) === stem),
      )
        ? [[stem, prefixed.size + (modules.has(stem) ? 1 : 0)] as const]
        : [],
    ),
  );
}

export const noPrefixCluster = defineRule({
  meta: {
    type: "suggestion",
    schema: allowlistSchema,
    docs: {
      description: `Group ${minimum} or more sibling modules that share a <prefix>- stem into a folder.`,
    },
    messages: {
      cluster:
        "{{count}} modules in {{directory}} share the {{stem}}- prefix. Group them in a {{stem}}/ folder.",
      grown:
        "{{cluster}} grew to {{count}} modules; its no-prefix-cluster allowlist entry permits {{allowed}}. Group them in a {{stem}}/ folder instead of raising the entry.",
      stale:
        "{{cluster}} now has {{count}} modules; lower its no-prefix-cluster allowlist entry from {{allowed}} to {{count}}.",
      resolved:
        "{{cluster}} is no longer a prefix cluster; remove its no-prefix-cluster allowlist entry.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const filename = context.physicalFilename.replaceAll("\\", "/");
        const directory = dirname(filename);

        if (routes.test(directory)) {
          return;
        }

        const files = readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isFile() && moduleFile.test(entry.name))
          .map((entry) => entry.name)
          .toSorted();

        const reporter = files.find(
          (file) =>
            lintedFile.test(file) &&
            !/\.d\.[cm]?ts$/u.test(file) &&
            !isGeneratedPath(file),
        );

        if (reporter !== basename(filename)) {
          return;
        }

        const counts = clusters(directory, files);

        const listed = new Map(
          allowances(context).flatMap(([entry, allowed]) => {
            const stem = /(?<stem>[^/]+)-\*$/u.exec(entry)?.groups?.["stem"];

            return stem !== undefined &&
              isEntryFor(context.cwd, `${directory}/${stem}-*`, entry)
              ? [[stem, { entry, allowed }] as const]
              : [];
          }),
        );

        for (const stem of new Set([...counts.keys(), ...listed.keys()])) {
          const count = counts.get(stem) ?? 0;
          const allowed = listed.get(stem)?.allowed;

          const data = {
            cluster: listed.get(stem)?.entry ?? `${directory}/${stem}-*`,
            directory: relative(context.cwd, directory) || ".",
            stem,
            count: String(count),
            allowed: String(allowed),
          };

          if (allowed === undefined) {
            context.report({ node: program, messageId: "cluster", data });
          } else if (count > allowed) {
            context.report({ node: program, messageId: "grown", data });
          } else if (count === 0) {
            context.report({ node: program, messageId: "resolved", data });
          } else if (count < allowed) {
            context.report({ node: program, messageId: "stale", data });
          }
        }
      },
    };
  },
});
