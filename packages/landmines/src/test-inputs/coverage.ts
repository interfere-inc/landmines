import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { basename, join, matchesGlob } from "node:path";
import type { ESTree } from "@oxlint/plugins";

import { unknownSegment } from "./path-value.ts";

export const otherRunner = /\.(?:contract\.test|e2e)\.[cm]?[jt]sx?$/u;

export interface Read {
  readonly node: ESTree.Node;
  readonly path: string;
  readonly tree: boolean;
}

export function display(path: string) {
  return path.replaceAll(unknownSegment, "*");
}

function staticPrefix(glob: string) {
  const parts = glob.split("/");
  const wildcard = parts.findIndex((part) => /[*?[{]/u.test(part));

  return (wildcard === -1 ? parts : parts.slice(0, wildcard)).join("/");
}

function covered(
  { path, tree }: Read,
  globs: readonly string[],
  dependencies: readonly string[],
) {
  if (
    dependencies.some(
      (dependency) =>
        path === dependency ||
        path.startsWith(`${dependency}/`) ||
        (!tree && dependency.startsWith(`${path}/`)),
    )
  ) {
    return true;
  }

  return globs.some((glob) => {
    if (tree) {
      return (
        matchesGlob(`${path}/${unknownSegment}`, glob) &&
        matchesGlob(`${path}/${unknownSegment}/${unknownSegment}`, glob)
      );
    }

    const prefix = staticPrefix(glob).split("/");
    const parts = path.split("/");

    return (
      matchesGlob(path, glob) ||
      matchesGlob(`${path}/${unknownSegment}`, glob) ||
      (prefix.length >= parts.length &&
        matchesGlob(prefix.slice(0, parts.length).join("/"), display(path)))
    );
  });
}

export function suggestion({ path, tree }: Read, root: string) {
  const absolute = join(root, path);

  return display(
    tree || (existsSync(absolute) && statSync(absolute).isDirectory())
      ? `${path}/**`
      : path,
  );
}

const contractOnly = new Map<string, boolean>();

const packageSources = new Map<
  string,
  readonly { readonly path: string; readonly text: string }[]
>();

function sources(directory: string) {
  const cached = packageSources.get(directory);

  if (cached !== undefined) {
    return cached;
  }

  const result = globSync("**/*.{ts,tsx,mts,cts,js,mjs}", {
    cwd: directory,
    exclude: (entry) => entry === "node_modules",
  }).map((entry) => {
    const path = join(directory, entry);

    return { path, text: readFileSync(path, "utf8") };
  });

  packageSources.set(directory, result);

  return result;
}

export function onlyContractImporters(filename: string, directory: string) {
  const cached = contractOnly.get(filename);

  if (cached !== undefined) {
    return cached;
  }

  const name = basename(filename).replace(/\.[cm]?[jt]sx?$/u, "");

  const importers = sources(directory)
    .filter(({ path, text }) => path !== filename && text.includes(name))
    .map(({ path }) => path);

  const result =
    importers.length > 0 && importers.every((entry) => otherRunner.test(entry));

  contractOnly.set(filename, result);

  return result;
}

const ignoredPrefixes = new Map<string, boolean>();

function ignored(path: string, root: string) {
  const prefix = staticPrefix(display(path));

  if (prefix === "") {
    return false;
  }

  const key = `${root}\0${prefix}`;
  const cached = ignoredPrefixes.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const result =
    spawnSync("git", ["check-ignore", "--quiet", "--no-index", prefix], {
      cwd: root,
    }).status === 0;

  ignoredPrefixes.set(key, result);

  return result;
}

export function excused(
  read: Read,
  globs: readonly string[],
  dependencies: readonly string[],
  root: string,
) {
  return covered(read, globs, dependencies) || ignored(read.path, root);
}
