import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";

const browserTest = /\.browser\.test\.tsx?$/u;

const stylingToken =
  /(?<![\w-])(?:(?:text|bg|border|fill|stroke)-[\w-]*foreground|bg-disabled|bg-component|bg-transparent|bg-\(--|opacity-|invisible|hidden|sr-only)|dark:/u;

function argumentText(node: ESTree.Node | undefined) {
  if (node?.type === "Literal") {
    return "regex" in node ? node.regex.pattern : String(node.value);
  }

  if (node?.type === "TemplateLiteral") {
    return node.quasis.map(({ value }) => value.cooked ?? value.raw).join(" ");
  }

  return "";
}

export const noStylingClassAssertion = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Assert accessible state in browser tests, not the colour-role or visibility classes that style it.",
    },
    messages: {
      styling:
        "Do not assert a styling class in a browser test. Assert the state it encodes: toBeDisabled(), aria-disabled, toBeVisible(), the role and accessible name, or a data-state attribute.",
      stale:
        "This file now has {{count}} styling class assertions; lower its no-styling-class-assertion allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const violations: ESTree.Node[] = [];

    if (!browserTest.test(context.physicalFilename.replaceAll("\\", "/"))) {
      return {};
    }

    return {
      CallExpression(node) {
        const { callee } = node;

        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name === "toHaveClass" &&
          node.arguments.some((argument) =>
            stylingToken.test(argumentText(argument)),
          )
        ) {
          violations.push(node);
        }
      },
      "Program:exit"(program) {
        reportAllowed(context, program, violations, "styling");
      },
    };
  },
});
