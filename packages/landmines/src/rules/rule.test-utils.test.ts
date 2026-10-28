import { expect, test } from "vitest";
import { lintBatch } from "./rule.test-utils";

test("keeps mixed fixture diagnostics and unchanged sources separate", () => {
  const sources = [
    'vi.mock("first-client");',
    'vi.spyOn(client, "fetch");',
    'vi.mock("last-client"); vi.fn(() => "replacement");',
  ];

  const results = lintBatch(sources, true, "testing");

  expect(results.map(([, result]) => result.status)).toStrictEqual([1, 0, 1]);
  expect(results.map(([, result]) => result.code)).toStrictEqual(sources);

  expect(
    results.map(
      ([, result]) =>
        (result.output.match(/Do not replace test dependency behavior/gu) ?? [])
          .length,
    ),
  ).toStrictEqual([1, 0, 2]);
});
