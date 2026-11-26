import { defineRule } from "@oxlint/plugins";
import type { Comment, ESTree } from "@oxlint/plugins";

import { sameStatementGroup } from "../lib/statement-group.ts";

export const paddingBetweenStatements = defineRule({
  meta: {
    type: "layout",
    schema: [],
    fixable: "whitespace",
    docs: {
      description:
        "Require blank lines between statements outside compact declaration, assertion, assignment, import and overload groups.",
    },
    messages: {
      paddingBetweenStatements: "Separate these statements with a blank line.",
    },
  },
  create(context) {
    const source = context.sourceCode.text;

    function check(statements: ESTree.Program["body"]) {
      const relevant = statements.filter(
        (node) => !node.type.startsWith("Svelte"),
      );

      for (const [index, next] of relevant.entries()) {
        const previous = relevant[index - 1];

        if (previous === undefined) {
          continue;
        }

        if (sameStatementGroup(previous, next, context.sourceCode)) {
          continue;
        }

        let before: typeof previous | Comment = previous;
        let after: typeof next | Comment = next;

        for (const comment of context.sourceCode.getCommentsBefore(next)) {
          if (comment.range[0] < previous.range[1]) {
            continue;
          }

          if (comment.loc.start.line === before.loc.end.line) {
            before = comment;
          } else {
            after = comment;

            break;
          }
        }

        const gap = source.slice(before.range[1], after.range[0]);

        if (after.loc.start.line > before.loc.end.line + 1 || /\S/u.test(gap)) {
          continue;
        }

        context.report({
          node: next,
          messageId: "paddingBetweenStatements",
          fix(fixer) {
            const lineStart = source.lastIndexOf("\n", after.range[0] - 1) + 1;

            const indentation =
              /^[\t ]*/u.exec(source.slice(lineStart, after.range[0]))?.[0] ??
              "";

            const newline = gap.includes("\r\n") ? "\r\n" : "\n";

            return fixer.replaceTextRange(
              [before.range[1], after.range[0]],
              `${newline}${newline}${indentation}`,
            );
          },
        });
      }
    }

    return {
      Program: (node) => check(node.body),
      BlockStatement: (node) => check(node.body),
      StaticBlock: (node) => check(node.body),
      SwitchCase: (node) => check(node.consequent),
      TSModuleBlock: (node) => check(node.body),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- oxlint never parses .svelte files; this key only ever runs under svelte-eslint-parser, whose SvelteScriptElement.body is ESTree.Program["body"].
      SvelteScriptElement: ((node: { body: ESTree.Program["body"] }) =>
        check(node.body)) as unknown as (node: ESTree.Node) => void,
    };
  },
});
