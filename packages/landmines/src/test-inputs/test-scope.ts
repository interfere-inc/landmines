import { existsSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

import { otherRunner } from "./coverage.ts";

const testModule = /\.(?:test|fixture|test-utils)\.[cm]?[jt]sx?$/u;
export const testFile = /\.test\.[cm]?[jt]sx?$/u;
export const vitestConfig = /^vitest(?:\.[\w-]+)*\.config\.[cm]?[jt]s$/u;
const testDirectories = new Set(["test", "tests", "__tests__"]);

export function repositoryRoot(directory: string) {
  for (let current = directory; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    if (dirname(current) === current) {
      return;
    }
  }
}

export function inScope(filename: string, directory: string) {
  if (otherRunner.test(filename)) {
    return false;
  }

  return (
    testModule.test(filename) ||
    vitestConfig.test(basename(filename)) ||
    relative(directory, dirname(filename))
      .split(sep)
      .some((part) => testDirectories.has(part))
  );
}
