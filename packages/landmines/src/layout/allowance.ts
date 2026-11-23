import { relative } from "node:path";
import type { Context } from "@oxlint/plugins";
import { z } from "zod";

const allowanceOptions = z
  .tuple([
    z.looseObject({ allow: z.record(z.string(), z.int().min(1)).optional() }),
  ])
  .or(z.tuple([]));

export function allowances(context: Context) {
  const [options] = allowanceOptions.parse(context.options);

  return Object.entries(options?.allow ?? {});
}

export function isEntryFor(cwd: string, path: string, entry: string) {
  return relative(cwd, path).replaceAll("\\", "/") === entry;
}
