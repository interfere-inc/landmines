import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { defineRule } from "@oxlint/plugins";
import { z } from "zod";

import { packageDirectory } from "../lib/test-owner.ts";

const manifestSchema = z.object({ exports: z.json().optional() });

function unrestrictedSourceExports(
  value: z.infer<typeof manifestSchema>["exports"],
) {
  const pending = [value];
  const violations = new Set<string>();

  while (pending.length > 0) {
    const current = pending.pop();
    const target = z.string().safeParse(current);

    if (target.success) {
      if (
        /^(?:src\/)?\*(?:\.[cm]?[jt]sx?)?$/u.test(posix.normalize(target.data))
      ) {
        violations.add(target.data);
      }

      continue;
    }

    const array = z.array(z.json()).safeParse(current);

    if (array.success) {
      pending.push(...array.data);

      continue;
    }

    const object = z.record(z.string(), z.json()).safeParse(current);

    if (object.success) {
      pending.push(...Object.values(object.data));
    }
  }

  return [...violations];
}

export const packageExports = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Declare intentional package interfaces instead of unrestricted source exports.",
    },
    messages: {
      unrestricted:
        "{{manifest}} exposes arbitrary implementation files through {{targets}}. Declare explicit entrypoints or named public namespaces in package.json.",
    },
  },
  create(context) {
    const directory = packageDirectory(dirname(context.physicalFilename));
    const path = join(directory, "package.json");

    if (!existsSync(path)) {
      return {};
    }

    const manifest = manifestSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );

    const targets = unrestrictedSourceExports(manifest.exports);

    return {
      Program(node) {
        if (targets.length > 0) {
          context.report({
            node,
            messageId: "unrestricted",
            data: { manifest: path, targets: targets.join(", ") },
          });
        }
      },
    };
  },
});
