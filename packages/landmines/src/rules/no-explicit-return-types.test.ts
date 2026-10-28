import { expect, test } from "vitest";

import { lint } from "./rule.test-utils";

test.each([
  "function count(): number { return 1; }",
  "const count = function (): number { return 1; };",
  "const count = (): number => 1;",
  "const count = (): number => { return 1; };",
  "async function count(): Promise<number> { return 1; }",
  "function* count(): Generator<number> { yield 1; }",
  "const counter = { count(): number { return 1; } };",
  "class Counter { count(): number { return 1; } }",
  "class Counter { get count(): number { return 1; } }",
  "export default function count(): number { return 1; }",
])("reports implemented return annotations without autofixing: %s", (code) => {
  const result = lint(code, true, "types");

  expect(result.status).toBe(1);

  expect(result.output.match(/Remove the explicit return type/gu)).toHaveLength(
    1,
  );

  expect(result.code).toBe(code);
});

test.each([
  "function isString(value: unknown): value is string { return typeof value === 'string'; }",
  "function assertString(value: unknown): asserts value is string { if (typeof value !== 'string') throw Error(); }",
  "function fail(): never { throw new Error(); }",
  "const fail = (): never => { throw new Error(); };",
  "function count() { return 1; }",
  "const count = function () { return 1; };",
  "const count = () => 1;",
  "const count: () => number = () => 1;",
  "const count = () => 1 satisfies number;",
  "declare function count(): number;",
  "function count(value: string): string; function count(value: number): number; function count(value: string | number) { return value; }",
  "abstract class Counter { abstract count(): number; }",
  "interface Counter { count(): number; }",
  "type Counter = () => number;",
  "class Counter { constructor() {} }",
])("allows inferred returns and type-only signatures: %s", (code) => {
  expect(lint(code, false, "types").status).toBe(0);
});

test("visits nested implementations independently", () => {
  const result = lint(
    "function outer(): number { const inner = (): number => 1; return inner(); }",
    false,
    "types",
  );

  expect(result.status).toBe(1);

  expect(result.output.match(/Remove the explicit return type/gu)).toHaveLength(
    2,
  );
});
