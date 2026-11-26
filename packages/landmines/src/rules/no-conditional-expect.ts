import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";
import { isExpectRoot, isTestCallback } from "../lib/test-context.ts";

function conditionalInTest(node: ESTree.Node) {
  let conditional = false;
  let child = node;

  for (let { parent } = child; parent; { parent } = parent) {
    if (isTestCallback(parent)) {
      return conditional;
    }

    if (
      ((parent.type === "IfStatement" ||
        parent.type === "ConditionalExpression") &&
        parent.test !== child) ||
      (parent.type === "SwitchStatement" && parent.discriminant !== child) ||
      (parent.type === "LogicalExpression" && parent.right === child) ||
      parent.type === "CatchClause"
    ) {
      conditional = true;
    }

    child = parent;
  }

  return false;
}

export const noConditionalExpect = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Disallow conditional assertions, including inside test fakes.",
    },
    messages: {
      conditional:
        "An expect inside a branch of a fake passes silently when the branch never runs; record what the fake received and assert in the test body with expect.assertions(n).",
      stale:
        "This file now has {{count}} conditional expects; lower its no-conditional-expect allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const expects: ESTree.Node[] = [];

    return {
      CallExpression(node) {
        if (isExpectRoot(node) && conditionalInTest(node)) {
          expects.push(node);
        }
      },
      "Program:exit"(program) {
        reportAllowed(context, program, expects, "conditional");
      },
    };
  },
});
