import { basename, dirname } from "node:path";
import type { Context } from "@oxlint/plugins";
import { z } from "zod";

const sourceExtension = /\.[cm]?[jt]sx?$/u;

const testName = /\.(?:test|e2e|test-utils|fixture)\.[cm]?[jt]sx?$/u;
const generatedName = /(?:^|[.-])generated(?:[.-]|$)/u;
const testDirectories = new Set(["test", "tests", "__tests__", "e2e"]);
const generatedDirectories = new Set(["generated", "__generated__"]);
const generatedHeader = /@generated|DO NOT EDIT/u;

export const sizeSchema = [
  {
    type: "object" as const,
    properties: {
      max: { type: "integer" as const, minimum: 1 },
      allow: {
        type: "object" as const,
        additionalProperties: { type: "integer" as const, minimum: 1 },
      },
    },
    additionalProperties: false,
  },
];

const sizeOptions = z
  .tuple([
    z.object({
      max: z.int().min(1).optional(),
      allow: z.record(z.string(), z.int().min(1)).optional(),
    }),
  ])
  .or(z.tuple([]));

export function isSourceFile(path: string) {
  return sourceExtension.test(path) && !path.endsWith(".d.ts");
}

export function isTestFile(path: string) {
  const segments = path.replaceAll("\\", "/").split("/");

  return (
    testName.test(basename(path)) ||
    segments.slice(0, -1).some((part) => testDirectories.has(part))
  );
}

export function isGeneratedPath(path: string) {
  const segments = path.replaceAll("\\", "/").split("/");

  return (
    generatedName.test(basename(path)) ||
    segments.slice(0, -1).some((part) => generatedDirectories.has(part))
  );
}

export function isGeneratedSource(path: string, text: string) {
  return (
    isGeneratedPath(path) ||
    generatedHeader.test(text.split("\n", 5).join("\n"))
  );
}

export function isCountedSource(path: string) {
  return isSourceFile(path) && !isTestFile(path) && !isGeneratedPath(path);
}

export function sizePolicy(
  context: Context,
  defaultMax: number,
  subject: "file" | "directory",
) {
  const [options] = sizeOptions.parse(context.options);
  const filename = context.physicalFilename.replaceAll("\\", "/");
  const path = subject === "directory" ? dirname(filename) : filename;

  const [entry, allowed] =
    Object.entries(options?.allow ?? {}).find(
      ([key]) => path === key || path.endsWith(`/${key}`),
    ) ?? [];

  return { max: options?.max ?? defaultMax, path: entry, allowed };
}
