import type { Context, ESTree } from "@oxlint/plugins";
import { z } from "zod";

export const allowlistSchema = [
  {
    type: "object" as const,
    properties: {
      allow: {
        type: "object" as const,
        additionalProperties: { type: "integer" as const, minimum: 1 },
      },
    },
    additionalProperties: false,
  },
];

const allowlistOptions = z
  .tuple([z.object({ allow: z.record(z.string(), z.int().min(1)) })])
  .or(z.tuple([]));

function allowance(context: Context) {
  const filename = context.physicalFilename.replaceAll("\\", "/");
  const [options] = allowlistOptions.parse(context.options);

  return Object.entries(options?.allow ?? {}).find(
    ([path]) => filename === path || filename.endsWith(`/${path}`),
  );
}

export function reportAllowed(
  context: Context,
  program: ESTree.Program,
  violations: readonly ESTree.Node[],
  messageId: string,
) {
  const [path, count] = allowance(context) ?? ["", 0];

  if (violations.length < count) {
    context.report({
      node: program,
      messageId: "stale",
      data: { path, count: String(violations.length) },
    });

    return;
  }

  if (violations.length === count) {
    return;
  }

  for (const node of violations) {
    context.report({ node, messageId });
  }
}
