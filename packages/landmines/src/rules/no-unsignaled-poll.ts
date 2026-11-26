import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";
import { containsNode } from "../lib/ast-search.ts";
import { isTestSupportFile } from "../lib/test-file.ts";

const pollSources = new Set([
  "vitest",
  "vite-plus/test",
  "@playwright/test",
  "playwright/test",
]);

const spyMatchers =
  /^(?:toHaveBeenCalled|toHaveBeenCalledOnce|toHaveBeenCalledTimes|toHaveBeenCalledWith|toHaveBeenCalledExactlyOnceWith|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith|toHaveReturned|toHaveReturnedTimes|toHaveReturnedWith|toHaveLastReturnedWith|toHaveNthReturnedWith|toHaveResolved|toHaveResolvedTimes|toHaveResolvedWith|toHaveLastResolvedWith|toHaveNthResolvedWith)$/u;

function propertyName(node: ESTree.MemberExpression) {
  return node.property.type === "Identifier" && !node.computed
    ? node.property.name
    : undefined;
}

function bindingName(source: SourceCode, node: ESTree.Node) {
  if (node.type !== "Identifier") {
    return null;
  }

  for (
    let scope: Scope | null = source.getScope(node);
    scope !== null;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);

    if (!variable || variable.defs.length === 0) {
      continue;
    }

    for (const { node: definition, parent } of variable.defs) {
      if (
        definition.type === "ImportSpecifier" &&
        parent?.type === "ImportDeclaration" &&
        pollSources.has(parent.source.value)
      ) {
        const name =
          definition.imported.type === "Identifier"
            ? definition.imported.name
            : definition.imported.value;

        return name === "vitest" ? "vi" : name;
      }
    }

    return null;
  }

  return node.name;
}

function isCall(
  source: SourceCode,
  node: ESTree.Node,
  object: string,
  property: string,
) {
  return (
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    bindingName(source, node.object) === object &&
    propertyName(node) === property
  );
}

const path: (node: ESTree.Node) => string[] | null = (node) => {
  if (node.type === "ChainExpression") {
    return path(node.expression);
  }

  if (node.type === "Identifier") {
    return [node.name];
  }

  if (node.type !== "MemberExpression") {
    return null;
  }

  const object = path(node.object);

  return object && [...object, propertyName(node) ?? "[]"];
};

function readsRecorder(node: ESTree.Node) {
  const names = path(node);

  if (!names || names.includes("current")) {
    return false;
  }

  const last = names.at(-1);

  return (
    names.includes("mock") ||
    (names.length > 1 && (last === "length" || last === "size"))
  );
}

function polledValue(callback: ESTree.Node) {
  if (
    callback.type !== "ArrowFunctionExpression" &&
    callback.type !== "FunctionExpression"
  ) {
    return null;
  }

  if (!callback.body) {
    return null;
  }

  if (callback.body.type !== "BlockStatement") {
    return callback.body;
  }

  const [statement, ...rest] = callback.body.body;

  if (rest.length > 0) {
    return null;
  }

  if (statement?.type === "ReturnStatement") {
    return statement.argument;
  }

  return statement?.type === "ExpressionStatement"
    ? statement.expression
    : null;
}

function assertsRecorder(source: SourceCode, node: ESTree.Node) {
  if (
    node.type !== "CallExpression" ||
    node.callee.type !== "MemberExpression"
  ) {
    return false;
  }

  const matcher = propertyName(node.callee) ?? "";

  const subject =
    node.callee.object.type === "MemberExpression" &&
    propertyName(node.callee.object) === "not"
      ? node.callee.object.object
      : node.callee.object;

  if (
    subject.type !== "CallExpression" ||
    subject.callee.type !== "Identifier" ||
    bindingName(source, subject.callee) !== "expect"
  ) {
    return false;
  }

  const [target] = subject.arguments;

  if (!target || target.type === "SpreadElement") {
    return false;
  }

  if (readsRecorder(target)) {
    return true;
  }

  const names = path(target);

  return (
    names !== null &&
    !names.includes("current") &&
    (spyMatchers.test(matcher) || matcher === "toHaveLength")
  );
}

function pollsLength(node: ESTree.CallExpression, value: ESTree.Node) {
  const parent =
    node.parent.type === "MemberExpression" &&
    propertyName(node.parent) === "not"
      ? node.parent.parent
      : node.parent;
  const names = path(value);
  const matcher =
    parent.type === "MemberExpression" ? (propertyName(parent) ?? "") : "";

  return (
    (matcher === "toHaveLength" || spyMatchers.test(matcher)) &&
    names !== null &&
    !names.includes("current")
  );
}

function conditionReadsRecorder(node: ESTree.Node) {
  const pending: ESTree.Node[] = [node];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }

    if (readsRecorder(current)) {
      return true;
    }

    if (
      current.type === "BinaryExpression" ||
      current.type === "LogicalExpression"
    ) {
      pending.push(current.left, current.right);
    } else if (current.type === "UnaryExpression") {
      pending.push(current.argument);
    } else if (current.type === "SequenceExpression") {
      pending.push(...current.expressions);
    }
  }

  return false;
}

const clockCall = /^now(?:[A-Z_]|$)/u;

type Loop =
  | ESTree.WhileStatement
  | ESTree.DoWhileStatement
  | ESTree.ForStatement;

function isFunction(node: ESTree.Node) {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  );
}

function enclosedBy(node: ESTree.Node, root: ESTree.Node) {
  for (
    let current: ESTree.Node | null = node.parent;
    current && current !== root;
    current = current.parent
  ) {
    if (isFunction(current)) {
      return false;
    }
  }

  return true;
}

function within(root: ESTree.Node, predicate: (node: ESTree.Node) => boolean) {
  return containsNode(
    root,
    (node) => predicate(node) && enclosedBy(node, root),
  );
}

function readsClock(node: ESTree.Node) {
  if (node.type === "NewExpression") {
    return (
      node.callee.type === "Identifier" &&
      node.callee.name === "Date" &&
      node.arguments.length === 0
    );
  }

  if (node.type !== "CallExpression") {
    return false;
  }

  const { callee } = node;

  if (callee.type === "Identifier") {
    return clockCall.test(callee.name);
  }

  return callee.type === "MemberExpression" && propertyName(callee) === "now";
}

function checksDeadline(body: ESTree.Node) {
  return within(
    body,
    (node) =>
      (node.type === "IfStatement" || node.type === "ConditionalExpression") &&
      within(node.test, readsClock),
  );
}

function clockLoop(node: Loop) {
  const clocked =
    (node.test !== null && within(node.test, readsClock)) ||
    checksDeadline(node.body);

  return (
    clocked && within(node.body, (child) => child.type === "AwaitExpression")
  );
}

export const noUnsignaledPoll = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Disallow expect.poll, vi.waitFor and vi.waitUntil on request recorders and spy state, which race a deadline instead of awaiting a signal.",
    },
    messages: {
      poll: "Await a signal instead of polling a request recorder or spy: resolve a Promise.withResolvers() deferred from the handler or callback that records it, then await its promise, or await the operation's own completion. A deadline-bound poll on a counter fails under CPU load, and a longer timeout only hides that.",
      clock:
        "Await a signal instead of looping until a clock deadline: resolve a Promise.withResolvers() deferred where the awaited state changes, subscribe to the event that announces it, or await the operation's own completion. A loop that retries until a deadline passes guesses how long real work takes and fails under CPU load.",
      stale:
        "This file now has {{count}} unsignaled polls; lower its no-unsignaled-poll allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const source = context.sourceCode;
    const violations: ESTree.Node[] = [];
    const loops = new Set<ESTree.Node>();
    const support = isTestSupportFile(context.physicalFilename);

    function loop(node: Loop) {
      if (support && clockLoop(node)) {
        violations.push(node);
        loops.add(node);
      }
    }

    return {
      WhileStatement: loop,
      DoWhileStatement: loop,
      ForStatement: loop,
      CallExpression(node) {
        const poll = isCall(source, node.callee, "expect", "poll");
        const waitUntil = isCall(source, node.callee, "vi", "waitUntil");

        if (
          !poll &&
          !waitUntil &&
          !isCall(source, node.callee, "vi", "waitFor")
        ) {
          return;
        }

        const [callback] = node.arguments;
        const value = callback && polledValue(callback);

        if (!value) {
          return;
        }

        let unsignaled = readsRecorder(value);

        if (!unsignaled) {
          if (poll) {
            unsignaled = pollsLength(node, value);
          } else if (waitUntil) {
            unsignaled = conditionReadsRecorder(value);
          } else {
            unsignaled = assertsRecorder(source, value);
          }
        }

        if (unsignaled) {
          violations.push(node);
        }
      },
      "Program:exit"(program) {
        reportAllowed(
          context,
          program,
          violations,
          "poll",
          undefined,
          (node) => (loops.has(node) ? "clock" : "poll"),
        );
      },
    };
  },
});
