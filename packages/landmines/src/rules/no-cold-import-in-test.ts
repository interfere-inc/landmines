import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { z } from "zod";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

type Owner = "test" | "warm" | "warmHook" | "hook" | { helper: string };

interface Load {
  node: ESTree.ImportExpression;
  key: string;
}

const warmers = new Set(["describe", "suite"]);

const warmHooks = new Set(["beforeAll"]);

const hooks = new Set([
  "beforeEach",
  "afterEach",
  "afterAll",
  "onTestFinished",
  "onTestFailed",
  "aroundEach",
  "extend",
]);

function callRoot(node: ESTree.Node) {
  let current = node;

  while (true) {
    if (current.type === "CallExpression") {
      current = current.callee;
    } else if (current.type === "MemberExpression") {
      current = current.object;
    } else if (current.type === "TaggedTemplateExpression") {
      current = current.tag;
    } else {
      return current.type === "Identifier" ? current.name : undefined;
    }
  }
}

function calleeMember(node: ESTree.Node) {
  return node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
    ? node.property.name
    : undefined;
}

function functionName(node: FunctionNode) {
  if (node.type === "FunctionDeclaration") {
    return node.id?.name;
  }

  const { parent } = node;

  return parent.type === "VariableDeclarator" && parent.id.type === "Identifier"
    ? parent.id.name
    : undefined;
}

function ownerOf(node: FunctionNode) {
  const call = node.parent;

  if (call.type === "CallExpression" && call.arguments.includes(node)) {
    const root = callRoot(call.callee) ?? "";
    const member = calleeMember(call.callee) ?? "";

    if (hooks.has(root) || hooks.has(member)) {
      return "hook";
    }

    if (warmHooks.has(root) || warmHooks.has(member)) {
      return "warmHook";
    }

    if (warmers.has(root)) {
      return "warm";
    }

    if (root === "test" || root === "it") {
      return "test";
    }
  }

  const helper = functionName(node);

  return helper === undefined ? undefined : { helper };
}

function moduleKey(specifier: string) {
  return specifier.replace(/\.[cm]?[jt]sx?$/u, "");
}

function specifierOf(source: ESTree.Expression) {
  if (source.type === "Literal") {
    return source.value;
  }

  return source.type === "TemplateLiteral" && source.expressions.length === 0
    ? source.quasis[0]?.value.cooked
    : undefined;
}

function importedKey(node: ESTree.ImportExpression) {
  const specifier = z.string().safeParse(specifierOf(node.source));

  return specifier.success ? moduleKey(specifier.data) : undefined;
}

function reachable(roots: Set<string>, calls: Map<string, Set<string>>) {
  const seen = new Set<string>();
  const queue = [...roots];

  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (!seen.has(name)) {
      seen.add(name);

      queue.push(...(calls.get(name) ?? []));
    }
  }

  return seen;
}

export const noColdImportInTest = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Keep the first, cold dynamic import of a module outside test assertion budgets.",
    },
    messages: {
      cold: "Only a test reaches this dynamic import, so the 5 s test budget measures a cold module load instead of the assertion and fails under CI load. Import the same specifier once at module scope or in describe; vi.resetModules() re-imports in tests then only re-evaluate it.",
      coldHook:
        "This dynamic import runs inside a hook, so a cold module load competes with the hook's own timeout instead of the assertion it sets up for. Import the same specifier once at module scope or in describe; vi.resetModules() re-imports in tests then only re-evaluate it.",
      stale:
        "This file now has {{count}} cold imports in tests; lower its no-cold-import-in-test allowlist entry for {{path}} to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const stack: (Owner | undefined)[] = [];
    const warm = new Set<string>();
    const inTests: Load[] = [];
    const inHooks: Load[] = [];
    const inHelpers = new Map<string, Load[]>();
    const calls = new Map<string, Set<string>>();
    const fromTests = new Set<string>();
    const fromWarm = new Set<string>();

    function owner() {
      return (
        stack.findLast((entry): entry is Owner => entry !== undefined) ?? "warm"
      );
    }

    function enter(node: FunctionNode) {
      stack.push(ownerOf(node));
    }

    function exit() {
      stack.pop();
    }

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      "FunctionDeclaration:exit": exit,
      "FunctionExpression:exit": exit,
      "ArrowFunctionExpression:exit": exit,
      ImportDeclaration(node) {
        const erased =
          node.importKind === "type" ||
          (node.specifiers.length > 0 &&
            node.specifiers.every(
              (specifier) =>
                specifier.type === "ImportSpecifier" &&
                specifier.importKind === "type",
            ));

        if (!erased) {
          warm.add(moduleKey(node.source.value));
        }
      },
      ImportExpression(node) {
        const key = importedKey(node);
        const current = owner();

        if (key === undefined) {
          return;
        }

        if (current === "hook" || current === "warmHook") {
          inHooks.push({ node, key });
        } else if (current === "warm") {
          warm.add(key);
        } else if (current === "test") {
          inTests.push({ node, key });
        } else {
          inHelpers.set(current.helper, [
            ...(inHelpers.get(current.helper) ?? []),
            { node, key },
          ]);
        }
      },
      CallExpression(node) {
        const current = owner();

        if (node.callee.type !== "Identifier" || current === "hook") {
          return;
        }

        const { name } = node.callee;

        if (current === "warm" || current === "warmHook") {
          fromWarm.add(name);
        } else if (current === "test") {
          fromTests.add(name);
        } else {
          calls.set(
            current.helper,
            new Set([...(calls.get(current.helper) ?? []), name]),
          );
        }
      },
      "Program:exit"(program) {
        for (const helper of reachable(fromWarm, calls)) {
          for (const { key } of inHelpers.get(helper) ?? []) {
            warm.add(key);
          }
        }

        const hookReports: ESTree.ImportExpression[] = [];

        for (const { key, node } of inHooks) {
          if (!warm.has(key)) {
            hookReports.push(node);
            warm.add(key);
          }
        }

        const loads = [
          ...inTests,
          ...[...reachable(fromTests, calls)].flatMap(
            (helper) => inHelpers.get(helper) ?? [],
          ),
        ];

        const hookNodes = new Set<ESTree.Node>(hookReports);

        reportAllowed(
          context,
          program,
          [
            ...hookReports,
            ...loads.flatMap(({ key, node }) => (warm.has(key) ? [] : [node])),
          ],
          "cold",
          undefined,
          (node) => (hookNodes.has(node) ? "coldHook" : "cold"),
        );
      },
    };
  },
});
