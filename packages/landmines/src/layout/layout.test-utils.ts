import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect } from "vitest";

import layout from "../plugins/structure";

const lintedFile = /\.[cm]?[jt]sx?$/u;

export function lintLayout(
  root: string,
  rule: string,
  files: Record<string, string>,
  allow?: Record<string, number>,
  options: Readonly<Record<string, unknown>> = {},
) {
  const directory = mkdtempSync(join(root, "fixture-"));

  for (const [name, content] of Object.entries(files)) {
    const file = join(directory, name);

    mkdirSync(dirname(file), { recursive: true });

    writeFileSync(file, content);
  }

  const linter = new Linter({ cwd: root });

  const config = {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { "landmines-structure": layout as unknown as ESLint.Plugin },
    rules: {
      [`landmines-structure/${rule}`]: allow
        ? [
            "error",
            {
              ...options,
              allow: Object.fromEntries(
                Object.entries(allow).map(([key, count]) => [
                  `${basename(directory)}/${key}`,
                  count,
                ]),
              ),
            },
          ]
        : ["error", options],
    },
  } satisfies Linter.Config;

  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && lintedFile.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted()
    .flatMap((file) => {
      const messages = linter.verify(readFileSync(file, "utf8"), config, {
        filename: file,
      });

      expect(messages.filter(({ ruleId }) => ruleId === null)).toStrictEqual(
        [],
      );

      return messages.map(({ message }) => ({
        message,
        file: file.slice(directory.length + 1),
      }));
    });
}
