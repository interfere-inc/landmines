import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { z } from "zod";

import { allowlistProperties, reportAllowed } from "../lib/allowlist.ts";

const coldStartOptions = z
  .tuple([z.looseObject({ harnessModules: z.array(z.string()).optional() })])
  .or(z.tuple([]));

const processes = new Set([
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "fork",
]);

const hooks = new Set([
  "beforeAll",
  "beforeEach",
  "afterAll",
  "afterEach",
  "onTestFinished",
  "extend",
]);

const harnessRestarts = new Set(["listen", "update", "reset"]);

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

const rootName: (node: ESTree.Node) => string | undefined = (node) => {
  if (node.type === "CallExpression") {
    return rootName(node.callee);
  }

  if (node.type === "MemberExpression") {
    return rootName(node.object);
  }

  if (node.type === "TaggedTemplateExpression") {
    return rootName(node.tag);
  }

  return node.type === "Identifier" ? node.name : undefined;
};

function inTest(node: ESTree.Node) {
  for (
    let current: ESTree.Node | null = node.parent;
    current;
    current = current.parent
  ) {
    if (
      current.type !== "ArrowFunctionExpression" &&
      current.type !== "FunctionExpression"
    ) {
      continue;
    }

    const call = current.parent;

    if (call.type !== "CallExpression") {
      continue;
    }

    const name = rootName(call.callee);

    const member =
      call.callee.type === "MemberExpression" &&
      call.callee.property.type === "Identifier"
        ? call.callee.property.name
        : undefined;

    if (hooks.has(name ?? "") || hooks.has(member ?? "")) {
      return false;
    }

    if (name === "test" || name === "it") {
      return true;
    }
  }

  return false;
}

function imported(source: SourceCode, node: ESTree.Node) {
  if (node.type !== "Identifier") {
    return null;
  }

  for (
    let scope: Scope | null = source.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);

    if (!variable) {
      continue;
    }

    for (const { node: definition, parent } of variable.defs) {
      if (parent?.type !== "ImportDeclaration") {
        continue;
      }

      if (definition.type === "ImportSpecifier") {
        return {
          module: parent.source.value,
          name:
            definition.imported.type === "Identifier"
              ? definition.imported.name
              : definition.imported.value,
        };
      }

      return { module: parent.source.value, name: "*" };
    }

    return null;
  }

  return null;
}

function initializer(source: SourceCode, node: ESTree.Node) {
  if (node.type !== "Identifier") {
    return null;
  }

  for (
    let scope: Scope | null = source.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);

    if (!variable) {
      continue;
    }

    const [definition] = variable.defs;

    return definition?.node.type === "VariableDeclarator"
      ? definition.node.init
      : null;
  }

  return null;
}

function promisified(
  source: SourceCode,
  node: ESTree.Node | null,
  harness: readonly string[],
) {
  if (node?.type !== "CallExpression") {
    return false;
  }

  const [target] = node.arguments;

  if (!target || target.type === "SpreadElement") {
    return false;
  }

  const { callee } = node;

  const binding =
    callee.type === "MemberExpression"
      ? imported(source, callee.object)
      : imported(source, callee);

  const name =
    callee.type === "MemberExpression" && callee.property.type === "Identifier"
      ? callee.property.name
      : binding?.name;

  return (
    /^(?:node:)?util$/u.test(binding?.module ?? "") &&
    name === "promisify" &&
    coldStart(source, target, harness)
  );
}

function testHarness(
  source: SourceCode,
  node: ESTree.Node | null,
  harness: readonly string[],
) {
  if (node?.type !== "CallExpression") {
    return false;
  }

  const binding = imported(source, node.callee);

  return (
    binding?.name === "createTestHarness" &&
    (binding.module === "wrangler" || harness.includes(binding.module))
  );
}

const coldStart: (
  source: SourceCode,
  callee: ESTree.Node,
  harness: readonly string[],
) => boolean = (source, callee, harness) => {
  if (callee.type === "CallExpression") {
    return promisified(source, callee, harness);
  }

  if (callee.type === "Identifier") {
    const binding = imported(source, callee);

    if (!binding) {
      return promisified(source, initializer(source, callee), harness);
    }

    if (/^(?:node:)?child_process$/u.test(binding.module)) {
      return processes.has(binding.name);
    }

    if (binding.module === "execa") {
      return ["execa", "execaSync", "$", "*"].includes(binding.name);
    }

    if (binding.module === "vitest/node") {
      return ["createVitest", "startVitest"].includes(binding.name);
    }

    if (binding.module === "miniflare") {
      return binding.name === "Miniflare";
    }

    if (binding.module === "wrangler") {
      return ["unstable_dev", "unstable_startWorker"].includes(binding.name);
    }

    return binding.name === "generateProject";
  }

  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier"
  ) {
    return false;
  }

  const { name } = callee.property;

  if (callee.object.type !== "Identifier") {
    return false;
  }

  const receiver = callee.object.name;

  if (receiver === "Bun") {
    return name === "spawn" || name === "spawnSync";
  }

  if (name === "start" && receiver.endsWith("Container")) {
    return true;
  }

  if (
    harnessRestarts.has(name) &&
    testHarness(source, initializer(source, callee.object), harness)
  ) {
    return true;
  }

  const binding = imported(source, callee.object);

  if (!binding) {
    return false;
  }

  if (/^(?:node:)?child_process$/u.test(binding.module)) {
    return processes.has(name);
  }

  if (
    ["playwright", "@playwright/test", "playwright-core"].includes(
      binding.module,
    )
  ) {
    return (
      name === "launch" &&
      ["chromium", "firefox", "webkit"].includes(binding.name)
    );
  }

  if (binding.module === "vitest/node") {
    return name === "createVitest" || name === "startVitest";
  }

  if (binding.module === "wrangler") {
    return name === "unstable_dev" || name === "unstable_startWorker";
  }

  return false;
};

function functionName(node: FunctionNode) {
  if (node.type === "FunctionDeclaration") {
    return node.id?.name;
  }

  const { parent } = node;

  return parent.type === "VariableDeclarator" && parent.id.type === "Identifier"
    ? parent.id.name
    : undefined;
}

export const noColdStartInTest = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          ...allowlistProperties,
          harnessModules: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    docs: {
      description:
        "Keep process and runtime cold starts outside test assertion budgets.",
    },
    messages: {
      cold: "Starting a process or runtime inside a test body makes the 5 s test budget measure a cold start instead of the assertion, and fails under CI load. Start it once in beforeAll (or a shared fixture) and keep only the assertion in the test.",
      stale:
        "This file now has {{count}} cold starts; lower its no-cold-start-in-test allowlist entry for {{path}} to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const [options] = coldStartOptions.parse(context.options);
    const harness = options?.harnessModules ?? [];
    const violations: ESTree.Node[] = [];
    const helpers = new Map<string, { cold: boolean; calls: Set<string> }>();
    const stack: (string | undefined)[] = [];
    const candidates: { node: ESTree.Node; name: string }[] = [];

    function enclosingHelper() {
      return stack.findLast((name) => name !== undefined);
    }

    function enter(node: FunctionNode) {
      const name = functionName(node);

      stack.push(name);

      if (name !== undefined && !helpers.has(name)) {
        helpers.set(name, { cold: false, calls: new Set() });
      }
    }

    function exit() {
      stack.pop();
    }

    function inspect(
      node: ESTree.CallExpression | ESTree.NewExpression,
      callee: ESTree.Node,
    ) {
      const helper = enclosingHelper();

      if (coldStart(context.sourceCode, callee, harness)) {
        if (inTest(node)) {
          violations.push(node);
        }

        if (helper !== undefined) {
          const entry = helpers.get(helper);

          if (entry) {
            entry.cold = true;
          }
        }

        return;
      }

      if (callee.type !== "Identifier") {
        return;
      }

      if (helper !== undefined) {
        helpers.get(helper)?.calls.add(callee.name);
      }

      if (inTest(node)) {
        candidates.push({ node, name: callee.name });
      }
    }

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      "FunctionDeclaration:exit": exit,
      "FunctionExpression:exit": exit,
      "ArrowFunctionExpression:exit": exit,
      CallExpression(node) {
        inspect(node, node.callee);
      },
      NewExpression(node) {
        inspect(node, node.callee);
      },
      TaggedTemplateExpression(node) {
        if (inTest(node) && coldStart(context.sourceCode, node.tag, harness)) {
          violations.push(node);
        }
      },
      "Program:exit"(program) {
        let changed = true;

        while (changed) {
          changed = false;

          for (const entry of helpers.values()) {
            if (
              !entry.cold &&
              [...entry.calls].some((name) => helpers.get(name)?.cold)
            ) {
              entry.cold = true;

              changed = true;
            }
          }
        }

        for (const { node, name } of candidates) {
          if (helpers.get(name)?.cold) {
            violations.push(node);
          }
        }

        reportAllowed(
          context,
          program,
          violations.toSorted((a, b) => a.range[0] - b.range[0]),
          "cold",
        );
      },
    };
  },
});
