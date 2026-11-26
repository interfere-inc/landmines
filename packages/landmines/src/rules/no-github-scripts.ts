import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { defineRule } from "@oxlint/plugins";

const checkedDirectories = new Set<string>();

export const noGithubScripts = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: {
      description:
        "Keep Python, TypeScript, and shell script files out of .github.",
    },
    messages: {
      forbidden:
        "Forbidden files in .github: {{files}}. Use native tool features and maintained GitHub Actions instead of repository-owned CI scripts.",
    },
  },
  create(context) {
    const { cwd } = context;

    if (checkedDirectories.has(cwd)) {
      return {};
    }

    checkedDirectories.add(cwd);

    let root = cwd;

    while (!existsSync(join(root, ".git"))) {
      const parent = dirname(root);

      if (parent === root) {
        return {};
      }

      root = parent;
    }

    const directory = join(root, ".github");

    if (!existsSync(directory)) {
      return {};
    }

    const files = readdirSync(directory, {
      recursive: true,
      withFileTypes: true,
    })
      .filter(
        (entry) => !entry.isDirectory() && /\.(?:py|ts|sh)$/iu.test(entry.name),
      )
      .map((entry) => relative(root, join(entry.parentPath, entry.name)))
      .toSorted();

    return {
      Program(node) {
        if (files.length > 0) {
          context.report({
            node,
            messageId: "forbidden",
            data: { files: files.join(", ") },
          });
        }
      },
    };
  },
});
