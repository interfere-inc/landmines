import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "test-file-names-"));

  write("package.json", "{}");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function write(filename: string, content: string) {
  const target = join(directory, filename);

  mkdirSync(dirname(target), { recursive: true });

  writeFileSync(target, content);

  return target;
}

function lint(filename: string, repository = false) {
  const target = write(filename, "export {};\n");

  const config = write(
    "config.json",
    JSON.stringify({
      categories: { correctness: "off" },
      jsPlugins: [
        {
          name: "landmines-structure",
          specifier: join(root, "packages/landmines/src/plugins/structure.ts"),
        },
      ],
      rules: { "landmines-structure/test-file-names": "error" },
    }),
  );

  const result = spawnSync(
    join(root, "node_modules/.bin/oxlint"),
    [
      "--config",
      repository ? join(root, ".oxlintrc.jsonc") : config,
      "--threads",
      "1",
      target,
    ],
    { encoding: "utf8", timeout: 15_000 },
  );

  if (result.error) {
    throw result.error;
  }

  expect(result.stderr).toBe("");

  return result;
}

test.each([
  "src/recovery/admission.ts",
  "src/recovery/admission.test.ts",
  "src/recovery/admission.browser.test.tsx",
  "src/recovery/admission.fixture.ts",
  "src/recovery/admission.fixture.tsx",
  "src/recovery/admission.test-utils.ts",
  "src/routes/-session.fixture.tsx",
  "src/fixtures/population.ts",
  "src/fixture-rows.ts",
  "src/table-helpers.ts",
  "test/recovery/admission.test.ts",
  "test/e2e/sign-in.e2e.ts",
])("accepts %s", (filename) => {
  expect(lint(filename).status).toBe(0);
});

test.each([
  ["src/admission.spec.ts", "<subject>.test.ts"],
  ["src/admission.tests.tsx", "<subject>.test.ts"],
  ["src/admission-fixture.ts", "<subject>.fixture.ts"],
  ["src/admission-fixtures.ts", "<subject>.fixture.ts"],
  ["src/admission.fixtures.ts", "<subject>.fixture.ts"],
  ["src/fixtures.ts", "<subject>.fixture.ts"],
  ["src/routes/-fixture.ts", "<subject>.fixture.ts"],
  ["src/admission.test-helper.ts", "<subject>.test-utils.ts"],
  ["src/admission.helper.ts", "<subject>.test-utils.ts"],
  ["src/admission.mock.tsx", "<subject>.test-utils.ts"],
  ["src/admission.harness.ts", "<subject>.test-utils.ts"],
  ["src/tests/admission.test.ts", "not tests"],
  ["src/__tests__/admission.test.ts", "not __tests__"],
])("rejects %s", (filename, message) => {
  const result = lint(filename);

  expect(result.status).toBe(1);
  expect(result.stdout).toContain(message);
});

test("ignores test-named ancestors outside the owning package", () => {
  write("tests/package/package.json", "{}");

  expect(lint("tests/package/src/policy.ts").status).toBe(0);
});

test("enforces the rule through the repository configuration", () => {
  const result = lint("src/admission.spec.ts", true);

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("landmines-structure(test-file-names)");
});
