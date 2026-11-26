import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { z } from "zod";

import { allowlistProperties, reportAllowed } from "../lib/allowlist.ts";

const defaultRunNow = ["act", "waitFor", "then", "catch", "finally", "step"];

const noFixedSleepOptions = z
  .tuple([z.object({ runNow: z.array(z.string()).optional() })])
  .or(z.tuple([]));

const testCallees = new Set([
  "test",
  "it",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
]);

const timerModules = new Set(["node:timers/promises", "timers/promises"]);

const storyFile = /\.stories\.[cm]?[jt]sx?$/u;

type TimerBinding = "setTimeout" | "scheduler" | "namespace";

function timerProperty(node: ESTree.MemberExpression) {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }

  if (node.computed && node.property.type === "Literal") {
    return node.property.value;
  }

  return null;
}

const timerBinding: (
  source: SourceCode,
  node: ESTree.Node,
) => TimerBinding | undefined = (source, node) => {
  if (node.type === "MemberExpression") {
    const property = timerProperty(node);
    const object = timerBinding(source, node.object);

    if (object === "namespace") {
      return property === "setTimeout" || property === "scheduler"
        ? property
        : undefined;
    }

    return object === "scheduler" && property === "wait"
      ? "setTimeout"
      : undefined;
  }

  if (node.type !== "Identifier") {
    return;
  }

  for (
    let scope: Scope | null = source.getScope(node);
    scope !== null;
    scope = scope.upper
  ) {
    const definition = scope.set.get(node.name)?.defs[0];

    if (!definition) {
      continue;
    }

    const { node: importedNode, parent } = definition;

    if (
      parent?.type !== "ImportDeclaration" ||
      !timerModules.has(parent.source.value)
    ) {
      return;
    }

    if (importedNode.type === "ImportSpecifier") {
      const imported =
        importedNode.imported.type === "Identifier"
          ? importedNode.imported.name
          : importedNode.imported.value;

      return imported === "setTimeout" || imported === "scheduler"
        ? imported
        : undefined;
    }

    return importedNode.type === "ImportNamespaceSpecifier" ||
      importedNode.type === "ImportDefaultSpecifier"
      ? "namespace"
      : undefined;
  }

  return node.name === "scheduler" ? "scheduler" : undefined;
};

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

function isSetTimeout(node: ESTree.Node) {
  return (
    (node.type === "Identifier" && node.name === "setTimeout") ||
    isMember(node, "globalThis", "setTimeout") ||
    isMember(node, "window", "setTimeout")
  );
}

const calleeRoot: (node: ESTree.Node) => string | undefined = (node) => {
  if (node.type === "CallExpression") {
    return calleeRoot(node.callee);
  }

  if (node.type === "MemberExpression") {
    return calleeRoot(node.object);
  }

  if (node.type === "TaggedTemplateExpression") {
    return calleeRoot(node.tag);
  }

  return node.type === "Identifier" ? node.name : undefined;
};

function calleeName(node: ESTree.Node) {
  if (node.type === "Identifier") {
    return node.name;
  }

  return node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
    ? node.property.name
    : undefined;
}

function fakeTimerScope(
  node: ESTree.Node,
  runNow: ReadonlySet<string>,
  isStory: boolean,
) {
  let current = node;
  let sharedSetup = false;

  while (current.type !== "Program") {
    const call =
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression"
        ? current.parent
        : null;

    if (isStoryPlay(call, isStory)) {
      return current;
    }

    const name =
      call?.type === "CallExpression" ? calleeRoot(call.callee) : undefined;

    const member =
      call?.type === "CallExpression" && call.callee.type === "MemberExpression"
        ? calleeName(call.callee)
        : undefined;

    if (
      member !== undefined &&
      (defaultRunNow.includes(member) || runNow.has(member))
    ) {
      current = current.parent;

      continue;
    }

    if (sharedSetup) {
      if (name === "describe" || name === "suite") {
        return current;
      }
    } else if (testCallees.has(name ?? "")) {
      if (name === "beforeEach" || name === "beforeAll") {
        sharedSetup = true;
      } else {
        return current;
      }
    }

    current = current.parent;
  }

  return current;
}

function isStoryPlay(node: ESTree.Node | null | undefined, isStory: boolean) {
  if (!isStory || node?.type !== "Property" || node.computed) {
    return false;
  }

  return (
    (node.key.type === "Identifier" && node.key.name === "play") ||
    (node.key.type === "Literal" && node.key.value === "play")
  );
}

const inTestBody: (
  node: ESTree.Node,
  runNow: ReadonlySet<string>,
  isStory: boolean,
) => boolean = (node, runNow, isStory) => {
  let current: ESTree.Node | null = node.parent;

  while (
    current &&
    current.type !== "ArrowFunctionExpression" &&
    current.type !== "FunctionExpression" &&
    current.type !== "FunctionDeclaration"
  ) {
    current = current.parent;
  }

  const parent = current?.parent;

  if (isStoryPlay(parent, isStory)) {
    return true;
  }

  if (parent?.type !== "CallExpression") {
    return false;
  }

  if (testCallees.has(calleeRoot(parent.callee) ?? "")) {
    return true;
  }

  return (
    runNow.has(calleeName(parent.callee) ?? "") &&
    inTestBody(parent, runNow, isStory)
  );
};

function scheduled(body: ESTree.Node | null) {
  if (body?.type !== "BlockStatement") {
    return body;
  }

  const [statement, ...rest] = body.body;

  return statement?.type === "ExpressionStatement" && rest.length === 0
    ? statement.expression
    : null;
}

function resolvesAfterTimeout(node: ESTree.NewExpression) {
  const [executor] = node.arguments;

  if (
    !executor ||
    (executor.type !== "ArrowFunctionExpression" &&
      executor.type !== "FunctionExpression")
  ) {
    return false;
  }

  const [resolve] = executor.params;

  if (resolve?.type !== "Identifier") {
    return false;
  }

  const call = scheduled(executor.body);

  if (call?.type !== "CallExpression" || !isSetTimeout(call.callee)) {
    return false;
  }

  const [handler] = call.arguments;

  if (handler?.type === "Identifier") {
    return handler.name === resolve.name;
  }

  if (
    handler?.type !== "ArrowFunctionExpression" &&
    handler?.type !== "FunctionExpression"
  ) {
    return false;
  }

  const settle = scheduled(handler.body);

  return (
    settle?.type === "CallExpression" &&
    settle.callee.type === "Identifier" &&
    settle.callee.name === resolve.name
  );
}

const idleStates = new Set(["networkidle", "networkidle0", "networkidle2"]);

function isIdleState(node: ESTree.Node | undefined) {
  return node?.type === "Literal" && idleStates.has(String(node.value));
}

function isTimedWait(node: ESTree.CallExpression) {
  const { callee } = node;

  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier"
  ) {
    return false;
  }

  const [state] = node.arguments;

  return (
    callee.property.name === "waitForTimeout" ||
    (callee.property.name === "waitForLoadState" && isIdleState(state))
  );
}

function waitsUntilIdle(node: ESTree.Node) {
  return (
    node.type === "Property" &&
    !node.computed &&
    node.key.type === "Identifier" &&
    node.key.name === "waitUntil" &&
    isIdleState(node.value)
  );
}

function returned(node: ESTree.Node | null | undefined) {
  if (
    node?.type !== "ArrowFunctionExpression" &&
    node?.type !== "FunctionExpression" &&
    node?.type !== "FunctionDeclaration"
  ) {
    return null;
  }

  const { body } = node;

  if (body?.type !== "BlockStatement") {
    return body ?? null;
  }

  const last = body.body.at(-1);

  return last?.type === "ReturnStatement" ? last.argument : null;
}

export const noFixedSleep = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          ...allowlistProperties,
          runNow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    docs: {
      description:
        "Disallow awaiting a fixed real-time sleep in a test or hook body, and Playwright's timed waits anywhere.",
    },
    messages: {
      sleep:
        "Replace this fixed sleep with a signal: await the operation itself or a promise its handler resolves. To move time, use fake timers (vi.useFakeTimers() or jest.useFakeTimers()) and advance them. A sleep guesses how long real work takes and fails under CPU load.",
      timedWait:
        "Replace this timed Playwright wait with the state you need: a web-first assertion (await expect(locator).toBeVisible()), page.waitForResponse, page.waitForEvent or page.waitForFunction. waitForTimeout and networkidle guess how long real work takes and fail under CPU load.",
      stale:
        "This file now has {{count}} fixed sleeps; lower its no-fixed-sleep allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const [options] = noFixedSleepOptions.parse(context.options);
    const runNow = new Set(options?.runNow ?? defaultRunNow);
    const isStory = storyFile.test(context.filename.replaceAll("\\", "/"));
    const sleeps: ESTree.Node[] = [];
    const fakeTimers = new Set<ESTree.Node>();
    const blockingSleeps: ESTree.Node[] = [];
    const timedWaits: ESTree.Node[] = [];
    const helpers = new Map<string, ESTree.Node>();
    const helperCalls: [ESTree.Node, string][] = [];

    function recordHelper(name: string, node: ESTree.Node | null | undefined) {
      const value = returned(node);

      if (value) {
        helpers.set(name, value);
      }
    }

    function isSleep(node: ESTree.Node) {
      if (node.type === "NewExpression") {
        return (
          node.callee.type === "Identifier" &&
          node.callee.name === "Promise" &&
          resolvesAfterTimeout(node)
        );
      }

      if (node.type !== "CallExpression") {
        return false;
      }

      return (
        timerBinding(context.sourceCode, node.callee) === "setTimeout" ||
        isMember(node.callee, "Bun", "sleep")
      );
    }

    function usesFakeTimers(node: ESTree.Node) {
      let current: ESTree.Node | null = node;

      while (current) {
        if (fakeTimers.has(current)) {
          return true;
        }

        current = current.parent;
      }

      return false;
    }

    return {
      CallExpression(node) {
        if (
          isMember(node.callee, "vi", "useFakeTimers") ||
          isMember(node.callee, "jest", "useFakeTimers")
        ) {
          fakeTimers.add(fakeTimerScope(node, runNow, isStory));
        }

        if (isTimedWait(node)) {
          timedWaits.push(node);
        }

        if (
          isMember(node.callee, "Bun", "sleepSync") &&
          inTestBody(node, runNow, isStory)
        ) {
          blockingSleeps.push(node);
        }
      },
      Property(node) {
        if (waitsUntilIdle(node)) {
          timedWaits.push(node);
        }
      },
      FunctionDeclaration(node) {
        if (node.id) {
          recordHelper(node.id.name, node);
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier") {
          recordHelper(node.id.name, node.init);
        }
      },
      AwaitExpression(node) {
        if (!inTestBody(node, runNow, isStory)) {
          return;
        }

        const { argument } = node;

        if (isSleep(argument)) {
          sleeps.push(node);
        } else if (
          argument.type === "CallExpression" &&
          argument.callee.type === "Identifier"
        ) {
          helperCalls.push([node, argument.callee.name]);
        }
      },
      "Program:exit"(program) {
        for (const [node, name] of helperCalls) {
          const value = helpers.get(name);

          if (value && isSleep(value)) {
            sleeps.push(node);
          }
        }

        reportAllowed(
          context,
          program,
          [
            ...sleeps.filter((node) => !usesFakeTimers(node)),
            ...blockingSleeps,
            ...timedWaits,
          ],
          "sleep",
          undefined,
          (node) => (timedWaits.includes(node) ? "timedWait" : "sleep"),
        );
      },
    };
  },
});
