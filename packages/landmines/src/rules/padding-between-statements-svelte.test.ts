import { expect, test } from "vitest";
import { paddingBetweenStatements } from "./padding-between-statements";

const create = paddingBetweenStatements.create as NonNullable<
  typeof paddingBetweenStatements.create
>;

function makeContext(text: string) {
  const reports: unknown[] = [];

  return {
    context: {
      sourceCode: {
        text,
        getCommentsBefore: () => [],
        getTokens: () => [],
      },
      report: (descriptor: unknown) => reports.push(descriptor),
    },
    reports,
  };
}

function svelteNode(type: string) {
  return { type };
}

function statement(range: [number, number], line: number) {
  return {
    type: "ExpressionStatement",
    expression: { type: "Identifier", name: "x" },
    range,
    loc: {
      start: { line, column: 0 },
      end: { line, column: range[1] - range[0] },
    },
  };
}

test("skips the template, so the script/template boundary is not flagged", () => {
  const { context, reports } = makeContext("");
  const visitor = create(context as never);

  visitor.Program?.({
    type: "Program",
    body: [
      svelteNode("SvelteScriptElement"),
      svelteNode("SvelteText"),
      svelteNode("SvelteElement"),
    ],
  } as never);

  expect(reports).toStrictEqual([]);
});

test("still checks the statements inside a SvelteScriptElement's own body", () => {
  const { context, reports } = makeContext("AAA\nBBB");
  const visitor = create(context as never);

  visitor["SvelteScriptElement"]?.({
    type: "SvelteScriptElement",
    body: [statement([0, 3], 1), statement([4, 7], 2)],
  } as never);

  expect(reports).toHaveLength(1);
});

test("does not flag two script statements that already have a blank line", () => {
  const { context, reports } = makeContext("AAA\n\nBBB");
  const visitor = create(context as never);

  visitor["SvelteScriptElement"]?.({
    type: "SvelteScriptElement",
    body: [statement([0, 3], 1), statement([5, 8], 3)],
  } as never);

  expect(reports).toStrictEqual([]);
});
