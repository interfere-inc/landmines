import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { allowlistSchema, reportAllowed } from "../lib/allowlist.ts";

const testFunctions = new Set(["test", "it", "describe", "suite"]);
const configTimeouts = new Set(["testTimeout", "hookTimeout"]);
const testTimeouts = new Set(["timeout"]);

function keyName(property: ESTree.Node) {
  if (property.type !== "Property" || property.computed) {
    return null;
  }

  if (property.key.type === "Identifier") {
    return property.key.name;
  }

  return property.key.type === "Literal" ? String(property.key.value) : null;
}

function rootIdentifier(initial: ESTree.Node) {
  let node = initial;

  while (node.type === "MemberExpression" || node.type === "CallExpression") {
    node = node.type === "MemberExpression" ? node.object : node.callee;
  }

  return node.type === "Identifier" ? node : null;
}

function memberName(node: ESTree.Node) {
  return node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
    ? node.property.name
    : null;
}

function variableOf(source: SourceCode, node: ESTree.Node, name: string) {
  for (
    let scope: Scope | null = source.getScope(node);
    scope !== null;
    scope = scope.upper
  ) {
    const variable = scope.set.get(name);

    if (variable) {
      return variable;
    }
  }

  return null;
}

function testBinding(
  source: SourceCode,
  identifier: ESTree.Node & { name: string },
  seen = new Set<Variable>(),
): boolean {
  const variable = variableOf(source, identifier, identifier.name);

  if (variable === null || variable.defs.length === 0) {
    return true;
  }

  if (seen.has(variable)) {
    return false;
  }

  seen.add(variable);

  return variable.defs.every(({ type, node }) => {
    if (type === "ImportBinding") {
      return true;
    }

    if (
      type !== "Variable" ||
      node.type !== "VariableDeclarator" ||
      node.init === null
    ) {
      return false;
    }

    const root = rootIdentifier(node.init);

    return root !== null && testBinding(source, root, seen);
  });
}

function playwrightImport(source: SourceCode, identifier: ESTree.Node) {
  if (identifier.type !== "Identifier") {
    return false;
  }

  return (
    variableOf(source, identifier, identifier.name)?.defs.some(
      ({ type, parent }) =>
        type === "ImportBinding" &&
        parent?.type === "ImportDeclaration" &&
        parent.source.value === "@playwright/test",
    ) ?? false
  );
}

function zero(node: ESTree.Node | undefined) {
  return node?.type === "Literal" && node.value === 0;
}

export const noFlakeMasking = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Fix flaky tests at their cause instead of retrying them or raising their timeouts.",
    },
    messages: {
      retry:
        "Do not retry tests. A test that passes on rerun is a flake: wait on the event it depends on and file the failure under the flaky-test tracker.",
      timeout:
        "Do not raise a test's timeout. Wait on the event the test depends on, or move slow shared setup into a beforeAll hook.",
      stale:
        "This file now has {{count}} test timeout bumps; lower its no-flake-masking allowlist entry for {{path}} in .oxlintrc.jsonc to {{count}}, or remove the entry at 0.",
    },
  },
  create(context) {
    const source = context.sourceCode;
    const timeouts: ESTree.Node[] = [];

    function testCall(node: ESTree.CallExpression) {
      const root = rootIdentifier(node.callee);
      const member = memberName(node.callee);

      return (
        root !== null &&
        testFunctions.has(root.name) &&
        member !== "each" &&
        member !== "for" &&
        member !== "extend" &&
        member !== "scoped" &&
        member !== "override" &&
        member !== "configure" &&
        testBinding(source, root)
      );
    }

    function inspect(node: ESTree.Node | undefined, keys: ReadonlySet<string>) {
      if (node?.type !== "ObjectExpression") {
        return;
      }

      for (const property of node.properties) {
        const key = keyName(property);

        if (key === "retry") {
          context.report({ node: property, messageId: "retry" });
        } else if (key !== null && keys.has(key)) {
          timeouts.push(property);
        }
      }
    }

    function inspectRetries(node: ESTree.Node | undefined | null) {
      if (node?.type !== "ObjectExpression") {
        return;
      }

      for (const property of node.properties) {
        if (property.type !== "Property") {
          continue;
        }

        const key = keyName(property);

        if (key === "retries" && !zero(property.value)) {
          context.report({ node: property, messageId: "retry" });
        } else if (
          key === "projects" &&
          property.value.type === "ArrayExpression"
        ) {
          for (const project of property.value.elements) {
            inspectRetries(project);
          }
        }
      }
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        const member = memberName(callee);

        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "vi" &&
          member === "setConfig"
        ) {
          inspect(node.arguments[0], configTimeouts);

          return;
        }

        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "jest" &&
          member === "retryTimes"
        ) {
          if (!zero(node.arguments[0])) {
            context.report({ node, messageId: "retry" });
          }

          return;
        }

        if (
          callee.type === "Identifier" &&
          callee.name === "defineConfig" &&
          playwrightImport(source, callee)
        ) {
          inspectRetries(node.arguments[0]);

          return;
        }

        if (
          member === "configure" &&
          callee.type === "MemberExpression" &&
          memberName(callee.object) === "describe"
        ) {
          const root = rootIdentifier(callee);

          if (root !== null && testBinding(source, root)) {
            inspectRetries(node.arguments[0]);
          }

          return;
        }

        if (!testCall(node)) {
          return;
        }

        const [, second, third] = node.arguments;

        inspect(second, testTimeouts);

        inspect(third, testTimeouts);

        if (
          third !== undefined &&
          second?.type !== "ObjectExpression" &&
          third.type !== "ObjectExpression" &&
          third.type !== "ArrowFunctionExpression" &&
          third.type !== "FunctionExpression"
        ) {
          timeouts.push(third);
        }
      },
      "Program:exit"(program) {
        reportAllowed(context, program, timeouts, "timeout");
      },
      Property(node) {
        if (keyName(node) === "test") {
          inspect(node.value, configTimeouts);
        }
      },
    };
  },
});
