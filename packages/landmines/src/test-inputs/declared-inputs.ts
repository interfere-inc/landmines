import { realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { allowedCount, allowlistSchema } from "../lib/allowlist.ts";
import { packageDirectory } from "../lib/test-owner.ts";
import {
  callName,
  commandArguments,
  evaluate,
  pathFromUrl,
  unknownSegment,
} from "./path-value.ts";
import type { PathContext } from "./path-value.ts";
import {
  display,
  excused,
  onlyContractImporters,
  suggestion,
} from "./coverage.ts";
import type { Read } from "./coverage.ts";
import { optionsCwd, scanReads } from "./git-scans.ts";
import { iterationBindings } from "./iteration.ts";
import {
  enclosingHelper,
  functionName,
  isProducer,
  isWrite,
} from "./syntax.ts";
import type { FunctionNode } from "./syntax.ts";
import {
  inScope,
  repositoryRoot,
  testFile,
  vitestConfig,
} from "./test-scope.ts";
import type { Reference } from "./iteration.ts";
import { fileReads, pathProducers } from "./read-calls.ts";
import {
  dependencyDirectories,
  manifest,
  testTaskInputs,
} from "./turbo-inputs.ts";

export const declaredTestInputs = defineRule({
  meta: {
    type: "problem",
    schema: allowlistSchema,
    docs: {
      description:
        "Keep package tests to their own package's files: a read outside the package is invisible to Vitest --changed and widens the package's Turbo inputs. Allowlisted files must still declare each read as a Turbo test input.",
    },
    messages: {
      outside:
        "This test reads {{path}}, outside {{package}}. Package tests read only their own package: move a repository check into a root *.contract.test.ts, import another package's files through its exports, or keep the fixture inside {{package}}.",
      stale:
        "{{path}} now makes {{count}} out-of-package reads; lower its declared-test-inputs allowlist entry to {{count}}, or remove it at 0.",
      undeclared:
        'This test reads {{path}}, outside {{package}}, but the package\'s test task does not declare it, so the Turbo cache and PR CI skip this test when that file changes and the merge queue is the first run to fail. Add "$TURBO_ROOT$/{{input}}" to tasks.test.inputs after "$TURBO_EXTENDS$" in {{package}}/turbo.json.',
    },
  },
  create(context) {
    const filename = realpathSync(context.physicalFilename);
    const directory = packageDirectory(dirname(filename));
    const root = repositoryRoot(directory);

    if (
      root === undefined ||
      root === directory ||
      manifest(directory).scripts?.["test"] === undefined ||
      !inScope(filename, directory)
    ) {
      return allowedCount(context) > 0
        ? {
            Program(node) {
              reportStale(node, 0);
            },
          }
        : {};
    }

    const pathContext: PathContext = {
      filename,
      packageDirectory: directory,
      root,
      source: context.sourceCode,
    };

    const reads: Read[] = [];
    const references: Reference[] = [];
    const calls: ESTree.CallExpression[] = [];
    const helperValues: { node: ESTree.Node; helper: FunctionNode }[] = [];

    function value(node: ESTree.Node) {
      if (isProducer(node) || isWrite(node)) {
        return;
      }

      const path = pathFromUrl(evaluate(node, pathContext));

      if (path === undefined) {
        return;
      }

      const helper = path.includes(unknownSegment)
        ? enclosingHelper(node)
        : undefined;

      if (helper) {
        helperValues.push({ node, helper });
      } else {
        reads.push({ node, path, tree: false });
      }
    }

    function reportStale(node: ESTree.Node, count: number) {
      context.report({
        node,
        messageId: "stale",
        data: {
          path: relative(root ?? "", filename)
            .split(sep)
            .join("/"),
          count: String(count),
        },
      });
    }

    function expand(read: Read) {
      const { node, path } = read;

      const expanded = path.includes(unknownSegment)
        ? iterationBindings(context.sourceCode, node, references).flatMap(
            (bindings) => {
              const bound = pathFromUrl(
                evaluate(node, { ...pathContext, bindings }),
              );

              return bound === undefined ? [] : [{ ...read, path: bound }];
            },
          )
        : [];

      return expanded.length > 0 ? expanded : [read];
    }

    function instantiate(node: ESTree.Node, helper: FunctionNode) {
      const name = functionName(helper);

      const parameters = helper.params.flatMap((parameter) =>
        parameter.type === "Identifier" ? [parameter.name] : [],
      );

      const instances = calls.filter(
        (call) =>
          call.callee.type === "Identifier" && call.callee.name === name,
      );

      if (instances.length === 0) {
        const path = pathFromUrl(evaluate(node, pathContext));

        return path === undefined ? [] : [{ node, path, tree: false }];
      }

      return instances.flatMap((call) => {
        const iterations = iterationBindings(
          context.sourceCode,
          call,
          references,
        );

        return (iterations.length > 0 ? iterations : [new Map()]).flatMap(
          (iteration: ReadonlyMap<string, ESTree.Node>) => {
            const path = pathFromUrl(
              evaluate(node, {
                ...pathContext,
                bindings: new Map([
                  ...iteration,
                  ...parameters.flatMap((parameter, index) => {
                    const argument = call.arguments[index];

                    if (!argument) {
                      return [];
                    }

                    const element =
                      argument.type === "Identifier"
                        ? iteration.get(argument.name)
                        : undefined;

                    return [[parameter, element ?? argument] as const];
                  }),
                ]),
              }),
            );

            return path === undefined
              ? []
              : [{ node: call, path, tree: false }];
          },
        );
      });
    }

    function external(read: Read) {
      if (!isAbsolute(read.path)) {
        return;
      }

      const fromRoot = relative(root ?? "", read.path);
      const toPackage = relative(read.path, directory);

      if (
        fromRoot.startsWith("..") ||
        !relative(directory, read.path).startsWith("..") ||
        (!toPackage.startsWith("..") && !read.tree) ||
        fromRoot.split(sep).includes("node_modules") ||
        fromRoot.split(sep)[0]?.includes(unknownSegment)
      ) {
        return;
      }

      return { ...read, path: fromRoot.split(sep).join("/") };
    }

    return {
      Identifier(node) {
        const { parent } = node;

        if (
          (parent.type === "MemberExpression" &&
            parent.property === node &&
            !parent.computed) ||
          (parent.type === "Property" &&
            parent.key === node &&
            !parent.computed)
        ) {
          return;
        }

        references.push({
          node,
          name: node.name,
          start: node.start,
          end: node.end,
        });
      },
      CallExpression(node) {
        const name = callName(node.callee);

        calls.push(node);

        if (name !== undefined && pathProducers.has(name)) {
          value(node);
        }

        const [first] = node.arguments;

        if (
          first &&
          (first.type === "Literal" || first.type === "TemplateLiteral") &&
          ((name !== undefined && fileReads.has(name)) ||
            (name === "file" &&
              node.callee.type === "MemberExpression" &&
              node.callee.object.type === "Identifier" &&
              node.callee.object.name === "Bun"))
        ) {
          const path = evaluate(first, pathContext);

          const cwd =
            name === "glob" || name === "globSync"
              ? optionsCwd(node.arguments[1], pathContext)
              : directory;

          if (path !== undefined && cwd !== undefined) {
            reads.push({ node: first, path: resolve(cwd, path), tree: false });
          }
        }

        const command = commandArguments(node, pathContext);

        if (command) {
          reads.push(
            ...scanReads(
              node,
              command.argv,
              optionsCwd(command.options, pathContext),
            ),
          );
        }
      },
      NewExpression(node) {
        if (callName(node.callee) === "URL") {
          value(node);
        }
      },
      MemberExpression(node) {
        if (
          !node.computed &&
          node.property.type === "Identifier" &&
          (node.property.name === "pathname" || node.property.name === "href")
        ) {
          value(node);
        }
      },
      TemplateLiteral(node) {
        if (node.expressions.length > 0) {
          value(node);
        }
      },
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || node.tag.name !== "$") {
          return;
        }

        const command = evaluate(node.quasi, pathContext);
        const { parent } = node;

        const cwdCall =
          parent.type === "MemberExpression" &&
          parent.property.type === "Identifier" &&
          parent.property.name === "cwd" &&
          parent.parent.type === "CallExpression"
            ? parent.parent.arguments[0]
            : undefined;

        if (command !== undefined) {
          reads.push(
            ...scanReads(
              node,
              command.trim().split(/\s+/u),
              cwdCall ? evaluate(cwdCall, pathContext) : directory,
            ),
          );
        }
      },
      "Program:exit"() {
        if (
          !testFile.test(filename) &&
          !vitestConfig.test(basename(filename)) &&
          reads.length + helperValues.length > 0 &&
          onlyContractImporters(filename, directory)
        ) {
          if (allowedCount(context) > 0) {
            reportStale(context.sourceCode.ast, 0);
          }

          return;
        }

        const outside = [
          ...reads.flatMap((read) => expand(read)),
          ...helperValues.flatMap(({ node, helper }) =>
            instantiate(node, helper),
          ),
        ].flatMap((candidate) => {
          const read = external(candidate);

          return read && !excused(read, [], [], root) ? [read] : [];
        });

        const paths = new Map<ESTree.Node, Set<string>>();

        for (const read of outside) {
          paths.set(
            read.node,
            (paths.get(read.node) ?? new Set()).add(display(read.path)),
          );
        }

        const count = [...paths.values()].reduce(
          (total, nodePaths) => total + nodePaths.size,
          0,
        );

        const allowed = allowedCount(context);

        if (count < allowed) {
          reportStale(context.sourceCode.ast, count);

          return;
        }

        if (count > allowed) {
          for (const [node, nodePaths] of paths) {
            context.report({
              node,
              messageId: "outside",
              data: {
                path: [...nodePaths].join(", "),
                package: relative(root, directory),
              },
            });
          }

          return;
        }

        if (count === 0) {
          return;
        }

        const globs = testTaskInputs(directory, root);
        const dependencies = dependencyDirectories(directory, root);
        const reported = new Set<string>();

        for (const read of outside) {
          const key = `${read.node.start}:${read.path}`;

          if (reported.has(key) || excused(read, globs, dependencies, root)) {
            continue;
          }

          reported.add(key);

          context.report({
            node: read.node,
            messageId: "undeclared",
            data: {
              path: display(read.path),
              package: relative(root, directory),
              input: suggestion(read, root),
            },
          });
        }
      },
    };
  },
});
