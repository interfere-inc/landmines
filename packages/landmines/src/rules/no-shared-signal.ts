import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";
import { isTestSupportFile } from "../lib/test-file.ts";

const collectors = new Set(["describe", "suite"]);
const tests = new Set(["test", "it"]);

function isMember(node: ESTree.Node, object: string, property: string) {
  return (
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    node.object.name === object &&
    node.property.type === "Identifier" &&
    !node.computed &&
    node.property.name === property
  );
}

const callRoot: (node: ESTree.Node) => string | undefined = (node) => {
  if (node.type === "CallExpression") {
    return callRoot(node.callee);
  }

  if (node.type === "MemberExpression") {
    return callRoot(node.object);
  }

  return node.type === "Identifier" ? node.name : undefined;
};

function isCollector(node: ESTree.Node) {
  return (
    (node.type === "ArrowFunctionExpression" ||
      node.type === "FunctionExpression") &&
    node.parent.type === "CallExpression" &&
    node.parent.arguments.includes(node) &&
    collectors.has(callRoot(node.parent.callee) ?? "")
  );
}

function sharedAcrossTests(node: ESTree.Node) {
  let stored = false;

  for (
    let current: ESTree.Node | null = node.parent;
    current;
    current = current.parent
  ) {
    if (
      current.type === "VariableDeclarator" ||
      current.type === "AssignmentExpression" ||
      current.type === "PropertyDefinition"
    ) {
      stored = true;
    }

    if (current.type === "AwaitExpression" && !stored) {
      return false;
    }

    if (
      (current.type === "ArrowFunctionExpression" ||
        current.type === "FunctionExpression" ||
        current.type === "FunctionDeclaration") &&
      !isCollector(current)
    ) {
      return false;
    }
  }

  return stored;
}

export const noSharedSignal = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Disallow storing an AbortSignal.timeout at module or describe scope of a test file, and sharing one AbortController across its tests.",
    },
    messages: {
      timeout:
        "This AbortSignal.timeout starts counting when the module loads, so fixtures and earlier tests spend its budget and a later request aborts. Create the signal where the request is made, for example with a function that returns fresh request options per call.",
      controller:
        "This AbortController is shared by every test in the file: once one test aborts it, every later test sees an aborted signal. Create the controller inside the test or in beforeEach.",
      stale:
        "This file now has {{count}} shared signals; lower its no-shared-signal allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const violations: ESTree.Node[] = [];
    const controllers = new Set<ESTree.Node>();
    let hasTests = false;

    if (!isTestSupportFile(context.physicalFilename)) {
      return {};
    }

    return {
      CallExpression(node) {
        if (tests.has(callRoot(node.callee) ?? "")) {
          hasTests = true;
        }

        if (
          isMember(node.callee, "AbortSignal", "timeout") &&
          sharedAcrossTests(node)
        ) {
          violations.push(node);
        }
      },
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "AbortController" &&
          node.parent.type === "VariableDeclarator" &&
          node.parent.parent.type === "VariableDeclaration" &&
          node.parent.parent.kind === "const" &&
          sharedAcrossTests(node)
        ) {
          violations.push(node);
          controllers.add(node);
        }
      },
      "Program:exit"(program) {
        reportAllowed(
          context,
          program,
          violations.filter((node) => hasTests || !controllers.has(node)),
          "timeout",
          undefined,
          (node) => (controllers.has(node) ? "controller" : "timeout"),
        );
      },
    };
  },
});
