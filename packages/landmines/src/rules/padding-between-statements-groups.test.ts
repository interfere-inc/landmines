import { describe, expect, test } from "vitest";

import { lintBatch } from "./rule.test-utils";

function fixtureResult(
  results: ReadonlyMap<string, ReturnType<typeof lintBatch>[number][1]>,
  code: string,
) {
  const result = results.get(code);

  if (!result) {
    throw new Error(`Missing lint fixture: ${code}`);
  }

  return result;
}

const compactGroups = [
  "const x = 1;\nlet y = 2;",
  "function run() {\nusing x = resource();\nusing y = resource();\n}",
  "export const x = 1;\nexport const y = 2;",
  "const x = 1;\n\nconst y = 2;",
  "const x = 'await';\nconst y = 2;",
  "expect(x).toBe(1);\nexpect(y).not.toBe(2);",
  "target.type = 'text';\ntarget.value = 'hello';",
  "target.style.color = 'red';\ntarget.style.opacity = '1';",
  "this.x = 1;\nthis.y = 2;",
  "target['type'] = 'text';\ntarget['value'] = 'hello';",
  "import {\n  x,\n} from 'x';\nimport y from 'y';",
  "import x = require('x');\nimport y = require('y');",
  "function run(x: string): void;\nfunction run(x: number): void;\nfunction run(x: string | number) {\n  work();\n}",
  "export function run(x: string): void;\nexport function run(x: number): void;\nexport function run(x: string | number) {\n  work();\n}",
  "function run(x: string): Promise<void>;\nasync function run(x: string) {\n  await work();\n}",
];

const separatedGroups = [
  ["work();", "work();"],
  ["tracker.start();", "tracker.stop();"],
  ["vi.stubGlobal('x', 1);", "vi.stubGlobal('y', 2);"],
  ["const x = 1;", "work(x);"],
  ["work();", "expect(x).toBe(1);"],
  ["expect(x).toBe(1);", "await expect.poll(read).toBe(2);"],
  ["expect.poll(read).toBe(1);", "expect.poll(read).toBe(2);"],
  ["expect(x).resolves.toBe(1);", "expect(y).rejects.toBe(2);"],
  ["expect.assertions(1);", "expect(x).toBe(1);"],
  ["await work();", "await work();"],
  ["const x = await work();", "const y = 1;"],
  ["const x = (await work()) ?? 0;", "const y = 1;"],
  ["target.x = await work();", "target.y = 1;"],
  ["expect(await work()).toBe(1);", "expect(y).toBe(2);"],
  ["target.type = 'text';", "other.value = 'hello';"],
  ["target.style.color = 'red';", "target.value = 'hello';"],
  ["target = create();", "target.type = 'text';"],
  ["getTarget().x = 1;", "getTarget().y = 2;"],
  ["targets[first].x = 1;", "targets[second].y = 2;"],
  ["const x = {\n  value: 1,\n};", "const y = 2;"],
  ["expect(x).toEqual({\n  value: 1,\n});", "expect(y).toBe(2);"],
  ["function first(x: string): void;", "function second(x: string): void;"],
];

const separatedCodes = separatedGroups.map(
  ([previous, next]) => `${previous}\n${next}`,
);

const reportedFixtures = new Map(
  lintBatch(separatedCodes, false, "style/padding-between-statements"),
);

const fixedFixtures = new Map(
  lintBatch(
    [
      ...compactGroups,
      ...separatedCodes,
      "const x = 1; const y = 2;",
      "async function run() {\nawait using x = resource();\nawait using y = resource();\n}",
    ],
    true,
    "style/padding-between-statements",
  ),
);

const repeatedFixtures = new Map(
  lintBatch(
    [...fixedFixtures.values()].map((result) => result.code),
    true,
    "style/padding-between-statements",
  ),
);

describe.each(compactGroups)("preserves a compact group: %s", (code) => {
  const result = fixtureResult(fixedFixtures, code);

  test("preserves a compact group: %s", () => {
    expect(result.status, result.output).toBe(0);

    expect(result.code).toBe(code);
  });
});

describe.each(separatedGroups)(
  "separates statements outside a group: %s / %s",
  (previous, next) => {
    const code = `${previous}\n${next}`;

    const expected = `${previous}\n\n${next}`;

    const reported = fixtureResult(reportedFixtures, code);
    const fixed = fixtureResult(fixedFixtures, code);
    const repeated = fixtureResult(repeatedFixtures, fixed.code);

    test("separates statements outside a group: %s / %s", () => {
      expect(reported.status).toBe(1);

      expect(fixed.status, fixed.output).toBe(0);

      expect(fixed.code).toBe(expected);

      expect(repeated.code).toBe(expected);
    });
  },
);

describe("separates declarations sharing a line", () => {
  const result = fixtureResult(fixedFixtures, "const x = 1; const y = 2;");

  test("separates declarations sharing a line", () => {
    expect(result.status, result.output).toBe(0);

    expect(result.code).toBe("const x = 1;\n\nconst y = 2;");
  });
});

describe("separates asynchronous resource declarations", () => {
  const code =
    "async function run() {\nawait using x = resource();\nawait using y = resource();\n}";

  const result = fixtureResult(fixedFixtures, code);

  test("separates asynchronous resource declarations", () => {
    expect(result.status, result.output).toBe(0);

    expect(result.code).toBe(code.replace("resource();\n", "resource();\n\n"));
  });
});
