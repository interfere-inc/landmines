import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";
import {
  isExpectChain,
  isTableCallback,
  isTestCallback,
} from "../lib/test-context.ts";

function assertionArgument(node: ESTree.Node) {
  let child = node;

  for (let { parent } = child; parent; { parent } = parent) {
    const argumentNode = child;

    if (
      parent.type === "CallExpression" &&
      parent.arguments.some((argument) => argument === argumentNode) &&
      isExpectChain(parent)
    ) {
      return true;
    }

    child = parent;
  }

  return false;
}

function readsCaseParameter(source: SourceCode, condition: ESTree.Node) {
  for (
    let scope: Scope | null = source.getScope(condition);
    scope;
    scope = scope.upper
  ) {
    for (const variable of scope.variables) {
      if (
        variable.defs.some(
          ({ type, node }) => type === "Parameter" && isTableCallback(node),
        ) &&
        variable.references.some(
          (reference) =>
            reference.isRead() &&
            reference.identifier.range[0] >= condition.range[0] &&
            reference.identifier.range[1] <= condition.range[1],
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function insideTest(node: ESTree.Node) {
  for (let { parent } = node; parent; { parent } = parent) {
    if (isTestCallback(parent)) {
      return true;
    }
  }

  return false;
}

export const noParameterBranch = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description: "Keep parameterised test expectations in the case table.",
    },
    messages: {
      branch:
        "The expected value for a case belongs in the case table, not in a branch on the parameter; split the test or give the table an explicit expectation column.",
      stale:
        "This file now has {{count}} parameter branches; lower its no-parameter-branch allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const branches: ESTree.Node[] = [];

    function check(
      node:
        | ESTree.ConditionalExpression
        | ESTree.IfStatement
        | ESTree.SwitchStatement,
    ) {
      const condition =
        node.type === "SwitchStatement" ? node.discriminant : node.test;

      if (
        insideTest(node) &&
        assertionArgument(node) &&
        readsCaseParameter(context.sourceCode, condition)
      ) {
        branches.push(node);
      }
    }

    return {
      ConditionalExpression: check,
      IfStatement: check,
      SwitchStatement: check,
      "Program:exit"(program) {
        reportAllowed(context, program, branches, "branch");
      },
    };
  },
});
