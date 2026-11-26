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

const adjacentStatements = [
  [
    "function count() {\n  work();\n  return 1;\n}",
    "function count() {\n  work();\n\n  return 1;\n}",
  ],
  [
    "function count() { work(); return 1; }",
    "function count() { work();\n\nreturn 1; }",
  ],
  [
    "const value = {\n  count: 1,\n};\nwork();",
    "const value = {\n  count: 1,\n};\n\nwork();",
  ],
  [
    "work();\nconst value = {\n  count: 1,\n};",
    "work();\n\nconst value = {\n  count: 1,\n};",
  ],
  [
    "class Counter { static {\n  work();\n  if (enabled) {\n    work();\n  }\n} }",
    "class Counter { static {\n  work();\n\n  if (enabled) {\n    work();\n  }\n} }",
  ],
  [
    "function count() { switch (value) { case 1: work(); return 1; default: return 0; } }",
    "function count() { switch (value) { case 1: work();\n\nreturn 1; default: return 0; } }",
  ],
  [
    "function count() {\r\n\twork();\r\n\treturn 1;\r\n}",
    "function count() {\r\n\twork();\r\n\r\n\treturn 1;\r\n}",
  ],
  [
    "function count() {\n  work();\n  // keep with return\n  return 1;\n}",
    "function count() {\n  work();\n\n  // keep with return\n  return 1;\n}",
  ],
  [
    "work(); // trailing\n// leading\nnext();",
    "work(); // trailing\n\n// leading\nnext();",
  ],
  [
    "function count() { work(); /* keep */ return 1; }",
    "function count() { work(); /* keep */\n\nreturn 1; }",
  ],
  [
    "import {\n  value,\n} from 'source';\nwork();",
    "import {\n  value,\n} from 'source';\n\nwork();",
  ],
  [
    "import value = require('source');\nconst result = {\n  value,\n};",
    "import value = require('source');\n\nconst result = {\n  value,\n};",
  ],
  [
    "const value = {\n  count: 1,\n};\nimport other from 'source';",
    "const value = {\n  count: 1,\n};\n\nimport other from 'source';",
  ],
];

const spacedStatements = [
  "function count() { return 1; }",
  "work();\n\nwork();",
  "function count() {\n  work();\n\n  return 1;\n}",
  "work(); // trailing\n\n// leading\nnext();",
  "if (enabled) { work(); } else { work(); }",
];

const replayStatements = [
  'record.addCustomEvent("single-hidden", true);',
  'vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");',
  'document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));',
  'globalThis.dispatchEvent(new Event("beforeunload"));',
  "await expect.poll(() => uploads.length).toBe(1);",
  "await vi.advanceTimersByTimeAsync(30_000);",
  'expect(requests).toHaveLength(1);\nexpect(uploads[0]?.text).toContain("single-hidden");',
];

const replayCode = `async function run() {\n${replayStatements.join("\n")}\n}`;
const replayExpected = `async function run() {\n${replayStatements.join("\n\n")}\n}`;

const namespaceCode =
  "namespace Counter {\n  work();\n  const value = {\n    count: 1,\n  };\n}";

const reportedFixtures = new Map(
  lintBatch(
    adjacentStatements.map(([code]) => code ?? ""),
    false,
    "style/padding-between-statements",
  ),
);

const fixedFixtures = new Map(
  lintBatch(
    [
      ...adjacentStatements.map(([code]) => code ?? ""),
      ...spacedStatements,
      replayCode,
      namespaceCode,
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

describe.each(adjacentStatements)(
  "fixes adjacent statements and remains idempotent: %s",
  (code, expected) => {
    const reported = fixtureResult(reportedFixtures, code);
    const fixed = fixtureResult(fixedFixtures, code);
    const repeated = fixtureResult(repeatedFixtures, fixed.code);

    test("fixes adjacent statements and remains idempotent: %s", () => {
      expect(reported.status).toBe(1);

      expect(fixed.status).toBe(0);

      expect(fixed.code).toBe(expected);

      expect(repeated.code).toBe(expected);
    });
  },
);

describe.each(spacedStatements)(
  "preserves already spaced, commented and exempt statements: %s",
  (code) => {
    const result = fixtureResult(fixedFixtures, code);

    test("preserves already spaced, commented and exempt statements: %s", () => {
      expect(result.status).toBe(0);

      expect(result.code).toBe(code);
    });
  },
);

describe("separates replay actions and waits while grouping assertions", () => {
  const code = replayCode;
  const expected = replayExpected;

  const result = fixtureResult(fixedFixtures, code);
  const repeated = fixtureResult(repeatedFixtures, result.code);

  test("separates replay actions and waits while grouping assertions", () => {
    expect(result.status).toBe(0);

    expect(result.code).toBe(expected);

    expect(repeated.code).toBe(expected);
  });
});

describe("checks statements inside TypeScript namespaces", () => {
  const code = namespaceCode;

  const result = fixtureResult(fixedFixtures, code);

  test("checks statements inside TypeScript namespaces", () => {
    expect(result.status).toBe(0);

    expect(result.code).toBe(code.replace("work();\n", "work();\n\n"));
  });
});
