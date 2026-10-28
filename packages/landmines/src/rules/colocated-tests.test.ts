import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "colocated-tests-"));

  write(
    "package.json",
    JSON.stringify({
      name: "@example/recovery",
      type: "module",
      imports: { "#/*": "./src/*" },
      exports: {
        "./repeated/*": "./src/*/*.ts",
        "./admission": {
          monorepo: "./src/recovery/admission.ts",
          default: "./dist/admission.js",
        },
        "./*": "./src/*.ts",
      },
    }),
  );

  write("src/recovery/admission.ts", "export const admit = true;");

  write("src/recovery/policy.ts", "export const policy = true;");

  write("src/publication/publish.ts", "export const publish = true;");

  write("src/app.ts", "export const app = true;");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function write(filename: string, content: string) {
  const target = join(directory, filename);

  mkdirSync(dirname(target), { recursive: true });

  writeFileSync(target, content);

  return target;
}

function lint(filename: string, code: string, repository = false) {
  const target = write(filename, code);

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
      rules: { "landmines-structure/colocated-tests": "error" },
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

test.each(["admission", "$&"])(
  "resolves every wildcard literally for %s",
  (name) => {
    write(`src/${name}/${name}.ts`, "export const subject = true;");

    const result = lint(
      `test/${name}.test.ts`,
      `import { subject } from "@example/recovery/repeated/${name}"; test("subject", () => subject);`,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`src/${name}`);
  },
);

test.each([
  ["src/recovery/admission.test.ts", "./admission"],
  ["src/recovery/tests/admission.test.ts", "../admission"],
  ["src/recovery/tests/boundaries/admission.node.test.ts", "../../admission"],
  ["src/recovery/__tests__/admission.browser.test.tsx", "../admission"],
])("accepts owned test %s", (filename, specifier) => {
  expect(
    lint(filename, `import { admit } from '${specifier}'; export { admit };`)
      .status,
  ).toBe(0);
});

test.each([
  "../src/recovery/admission",
  "../src/recovery/admission.js",
  "@example/recovery/admission",
  "@example/recovery/recovery/admission",
  "#/recovery/admission",
])("finds the owner through %s", (specifier) => {
  const result = lint(
    "test/admission.test.ts",
    `import { admit } from '${specifier}'; export { admit };`,
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("src/recovery");
});

test("rejects placing a test inside an unrelated source feature", () => {
  expect(
    lint(
      "src/publication/admission.test.ts",
      "import { admit } from '../recovery/admission'; export { admit };",
    ).status,
  ).toBe(1);
});

test("groups several modules in the same feature", () => {
  expect(
    lint(
      "test/scenarios.test.ts",
      "import { admit } from '../src/recovery/admission'; import { policy } from '../src/recovery/policy'; export { admit, policy };",
    ).status,
  ).toBe(1);
});

test("retains cross-feature integration tests", () => {
  expect(
    lint(
      "test/scenarios.test.ts",
      "import { admit } from '../src/recovery/admission'; import { publish } from '../src/publication/publish'; export { admit, publish };",
    ).status,
  ).toBe(0);
});

test.each([
  "test/admission.integration.test.ts",
  "test/integration/admission.test.ts",
  "test/e2e/admission.test.ts",
])("rejects detached single-owner integration placement %s", (filename) => {
  expect(
    lint(
      filename,
      "import { admit } from '@example/recovery/admission'; export { admit };",
    ).status,
  ).toBe(1);
});

test.each(["cloudflare:workers", "cloudflare:test"])(
  "rejects detached single-owner runtime suites using %s",
  (runtime) => {
    expect(
      lint(
        "test/admission.worker.test.ts",
        `import '${runtime}'; import { admit } from '@example/recovery/admission'; export { admit };`,
      ).status,
    ).toBe(1);
  },
);

test("does not treat an application entry point as a module owner", () => {
  expect(
    lint(
      "test/http.test.ts",
      "import { app } from '../src/app'; export { app };",
    ).status,
  ).toBe(0);
});

test("enforces colocation through the repository configuration", () => {
  const result = lint(
    "test/admission.test.ts",
    'import { admit } from "@example/recovery/admission";\n\nexport { admit };\n',
    true,
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("landmines-structure(colocated-tests)");
});

test("finds dynamically imported subjects", () => {
  expect(
    lint(
      "test/admission.test.ts",
      "export const subject = import('../src/recovery/admission');",
    ).status,
  ).toBe(1);
});

test("ignores type-only imports when identifying the subject", () => {
  expect(
    lint(
      "test/scenarios.test.ts",
      "import type { admit } from '../src/recovery/admission'; export type Subject = typeof admit;",
    ).status,
  ).toBe(0);
});

test("rejects generic tests inside an unrelated feature", () => {
  expect(
    lint(
      "src/publication/scenarios.test.ts",
      "import { policy } from '../recovery/policy'; export { policy };",
    ).status,
  ).toBe(1);
});

test("rejects detached single-owner Worker runtime projects", () => {
  expect(
    lint(
      "test/worker/admission.test.ts",
      "import { admit } from '../../src/recovery/admission'; export { admit };",
    ).status,
  ).toBe(1);
});

test("ignores stylesheet imports when identifying the subject", () => {
  write("src/publication/theme.css", "body {}");

  expect(
    lint(
      "test/scenarios.test.ts",
      "import '../src/publication/theme.css'; import { policy } from '../src/recovery/policy'; export { policy };",
    ).status,
  ).toBe(1);
});

test("resolves relative subjects when the package exports a single entry", () => {
  write(
    "package.json",
    JSON.stringify({ name: "@example/recovery", exports: "./src/app.ts" }),
  );

  expect(
    lint(
      "test/admission.test.ts",
      "import { admit } from '../src/recovery/admission'; export { admit };",
    ).status,
  ).toBe(1);
});

test.each([
  ["test/admission.test.ts", "admission.ts"],
  ["src/publication/admission.test.ts", "src/publication/admission.ts"],
])("ignores an unrelated same-stem neighbor at %s", (filename, helper) => {
  write(helper, "export const unrelated = true;");

  expect(
    lint(
      filename,
      "import { admit } from '@example/recovery/admission'; export { admit };",
    ).status,
  ).toBe(1);
});

test("resolves realistic inherited aliases and fallback targets", () => {
  write(
    "config/base.json",
    JSON.stringify({
      compilerOptions: {
        baseUrl: "..",
        paths: { "@source/*": ["generated/*", "src/*"] },
      },
    }),
  );

  write(
    "tsconfig.json",
    '{ "extends": "./config/base.json", "include": ["src", "test"] }',
  );

  const result = lint(
    "test/admission.test.ts",
    "import { admit } from '@source/recovery/admission'; export { admit };",
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("src/recovery");
});

test.each([
  "src/recovery/admission.integration.test.ts",
  "src/recovery/tests/worker/admission.test.ts",
  "src/recovery/tests/service-worker/admission.test.ts",
])("accepts locally owned runtime suites at %s", (filename) => {
  expect(
    lint(
      filename,
      "import 'cloudflare:test'; import { admit } from '@example/recovery/admission'; export { admit };",
    ).status,
  ).toBe(0);
});

test.each([false, true])(
  "keeps an imported local subject when equal-stem imports are reversed: %s",
  (reverse) => {
    write("src/publication/admission.ts", "export const local = true;");

    const imports = [
      "import { admit } from '../recovery/admission';",
      "import { local } from './admission';",
    ];

    expect(
      lint(
        "src/publication/admission.test.ts",
        (reverse ? imports.toReversed() : imports).join("\n"),
      ).status,
    ).toBe(0);
  },
);

test.each([false, true])(
  "retains ambiguous equal-stem subjects regardless of import order: %s",
  (reverse) => {
    write("src/publication/admission.ts", "export const local = true;");

    const imports = [
      "import { admit } from '../src/recovery/admission';",
      "import { local } from '../src/publication/admission';",
    ];

    expect(
      lint(
        "test/admission.test.ts",
        (reverse ? imports.toReversed() : imports).join("\n"),
      ).status,
    ).toBe(0);
  },
);

test("ignores shared test companions when identifying the owner", () => {
  write("src/publication/setup.test-utils.ts", "export const setup = true;");

  write("src/publication/data.fixture.ts", "export const fixture = true;");

  expect(
    lint(
      "test/scenarios.test.ts",
      "import { policy } from '../src/recovery/policy'; import { setup } from '../src/publication/setup.test-utils'; import { fixture } from '../src/publication/data.fixture'; export { policy, setup, fixture };",
    ).status,
  ).toBe(1);
});

test("retains shared harness tests without a production subject", () => {
  write("src/publication/setup.test-utils.ts", "export const setup = true;");

  expect(
    lint(
      "test/scenarios.test.ts",
      "import { setup } from '../src/publication/setup.test-utils'; export { setup };",
    ).status,
  ).toBe(0);
});

test("retains cross-feature runtime integration suites", () => {
  expect(
    lint(
      "test/worker/scenarios.integration.test.ts",
      "import 'cloudflare:test'; import { admit } from '@example/recovery/admission'; import { publish } from '@example/recovery/publication/publish'; export { admit, publish };",
    ).status,
  ).toBe(0);
});

test.each(["node", "browser", "integration", "e2e"])(
  "rejects a detached single-owner %s variant",
  (variant) => {
    expect(
      lint(
        `test/admission.${variant}.test.ts`,
        "import { admit } from '@example/recovery/admission'; export { admit };",
      ).status,
    ).toBe(1);
  },
);

test("allows an explicit entrypoint exception with an incidental local helper", () => {
  expect(
    lint(
      "test/http.worker.test.ts",
      "/* oxlint-disable landmines-structure/colocated-tests -- Exercises the Worker HTTP entrypoint; policy supplies request setup. */\nimport { exports } from 'cloudflare:workers'; import { policy } from '../src/recovery/policy'; export const response = exports.default.fetch(new Request('https://example.com', { method: policy ? 'GET' : 'POST' }));",
    ).status,
  ).toBe(0);
});

test.each(["test", "tests", "__tests__"])(
  "ignores private helpers in local %s directories as implementation subjects",
  (support) => {
    write(
      `src/publication/${support}/accepted-publication.ts`,
      "export const setup = true;",
    );

    expect(
      lint(
        "test/scenarios.test.ts",
        `import { setup } from '../src/publication/${support}/accepted-publication'; export { setup };`,
      ).status,
    ).toBe(0);

    expect(
      lint(
        "test/scenarios.test.ts",
        `import { policy } from '../src/recovery/policy'; import { setup } from '../src/publication/${support}/accepted-publication'; export { policy, setup };`,
      ).status,
    ).toBe(1);
  },
);

test.each(["scenario", "admission-scenario"])(
  "accepts a local subject with sibling setup imports independently of test name: %s",
  (name) => {
    expect(
      lint(
        `src/recovery/${name}.browser.test.ts`,
        "import { admit } from './admission'; import { publish } from '../publication/publish'; export { admit, publish };",
      ).status,
    ).toBe(0);
  },
);

test.each(["fixture", "test-utils"])(
  "finds the local subject through a %s despite incidental imports",
  (suffix) => {
    write(
      `src/recovery/setup.${suffix}.ts`,
      "import { admit } from './admission'; export const setup = () => admit;",
    );

    expect(
      lint(
        "src/recovery/scenario.test.ts",
        `import { setup } from './setup.${suffix}'; import { publish } from '../publication/publish'; export { setup, publish };`,
      ).status,
    ).toBe(0);
  },
);

test.each(["fixture", "test-utils"])(
  "rejects a detached subject reached through a %s",
  (suffix) => {
    write(
      `src/recovery/setup.${suffix}.ts`,
      "export { admit } from './admission';",
    );

    const result = lint(
      "test/scenario.worker.test.ts",
      `import { admit } from '../src/recovery/setup.${suffix}'; export { admit };`,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("src/recovery");
  },
);

test("recognizes a local subject rendered by a shared parent fixture", () => {
  write("src/recovery/detail/page.ts", "export const page = true;");

  write(
    "src/recovery/pages.fixture.ts",
    "export { page } from './detail/page'; export { admit } from './admission';",
  );

  expect(
    lint(
      "src/recovery/detail/scenario.test.ts",
      "import { page } from '../pages.fixture'; import { publish } from '../../publication/publish'; export { page, publish };",
    ).status,
  ).toBe(0);
});

test("follows cyclic local fixture composition without following production dependencies", () => {
  write(
    "src/recovery/admission.ts",
    "export { publish as admit } from '../publication/publish';",
  );

  write(
    "src/recovery/first.fixture.ts",
    "export { second } from './second.fixture'; export { admit } from './admission';",
  );

  write(
    "src/recovery/second.fixture.ts",
    "export { admit as second } from './first.fixture';",
  );

  const result = lint(
    "test/scenario.test.ts",
    "import { second } from '../src/recovery/first.fixture'; export { second };",
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("src/recovery");
});

test("does not infer subjects from package test harness setup", () => {
  write(
    "test/runtime/setup.fixture.ts",
    "export const setup = () => import('../../src/recovery/admission');",
  );

  expect(
    lint(
      "test/scenario.test.ts",
      "import { setup } from './runtime/setup.fixture'; export { setup };",
    ).status,
  ).toBe(0);
});

test("ignores type-only companion imports when identifying subjects", () => {
  write(
    "src/recovery/setup.fixture.ts",
    "import type { admit } from './admission'; import { type policy } from './policy'; export type { publish } from '../publication/publish'; export const setup = true;",
  );

  expect(
    lint(
      "test/scenario.test.ts",
      "import { setup } from '../src/recovery/setup.fixture'; export { setup };",
    ).status,
  ).toBe(0);
});

test("does not infer a shared organizational folder as the subject of sibling features", () => {
  write("src/providers/auth/identity.ts", "export const identity = true;");

  write("src/providers/shell/startup.ts", "export const startup = true;");

  expect(
    lint(
      "test/startup.test.ts",
      "import { identity } from '../src/providers/auth/identity'; import { startup } from '../src/providers/shell/startup'; export { identity, startup };",
    ).status,
  ).toBe(0);
});

test("abstains when a fixture cannot be parsed instead of blaming incidental setup", () => {
  write("src/recovery/setup.fixture.ts", "export const broken = ;");

  expect(
    lint(
      "src/recovery/scenario.test.ts",
      "import './setup.fixture'; import { publish } from '../publication/publish'; export { publish };",
    ).status,
  ).toBe(0);
});

test("ignores inline type re-exports in companions", () => {
  write(
    "src/recovery/setup.fixture.ts",
    "export { type admit } from './admission'; export const setup = true;",
  );

  expect(
    lint(
      "test/scenario.test.ts",
      "import { setup } from '../src/recovery/setup.fixture'; export { setup };",
    ).status,
  ).toBe(0);
});

test("prefers local subprocess companions over parent fixture setup", () => {
  write("src/recovery/ledger.fixture.ts", "export { policy } from './policy';");

  write(
    "src/recovery/worker/worker.fixture.ts",
    "export const runWorker = true;",
  );

  expect(
    lint(
      "src/recovery/worker/scenario.test.ts",
      "import { runWorker } from './worker.fixture'; import { policy } from '../ledger.fixture'; export { runWorker, policy };",
    ).status,
  ).toBe(0);
});

test("keeps direct subjects enforceable when an opaque local companion exists", () => {
  write("src/publication/setup.fixture.ts", "export const setup = true;");

  expect(
    lint(
      "src/publication/scenario.test.ts",
      "import { setup } from './setup.fixture'; import { admit } from '../recovery/admission'; export { setup, admit };",
    ).status,
  ).toBe(1);
});

test("does not trace a local companion into another feature's setup", () => {
  write(
    "src/publication/setup.fixture.ts",
    "export { policy } from '../recovery/ledger.fixture';",
  );

  write("src/recovery/ledger.fixture.ts", "export { policy } from './policy';");

  expect(
    lint(
      "src/publication/scenario.test.ts",
      "import { policy } from './setup.fixture'; export { policy };",
    ).status,
  ).toBe(0);
});

test("ignores nonlocal schema imports in runtime companions", () => {
  write(
    "src/scenario.fixture.ts",
    "import { policy } from './recovery/policy'; export const run = () => policy;",
  );

  expect(
    lint(
      "src/scenario.test.ts",
      "import { run } from './scenario.fixture'; export { run };",
    ).status,
  ).toBe(0);
});

test("ignores direct inline type-only imports", () => {
  expect(
    lint(
      "test/scenario.test.ts",
      "import { type admit } from '../src/recovery/admission'; export type Subject = typeof admit;",
    ).status,
  ).toBe(0);
});

test("retains value evidence in a mixed type and value import", () => {
  expect(
    lint(
      "test/scenario.test.ts",
      "import { type admit, policy } from '../src/recovery/policy'; export { policy };",
    ).status,
  ).toBe(1);
});

test("traces dynamic subjects within a source-local test companion", () => {
  write(
    "src/recovery/setup.fixture.ts",
    "export const setup = () => import('./admission');",
  );

  expect(
    lint(
      "test/scenario.test.ts",
      "import { setup } from '../src/recovery/setup.fixture'; export { setup };",
    ).status,
  ).toBe(1);
});

test.each([
  "export { harness } from '../../../test/harness.fixture';",
  "export { harness } from '../../publication/harness.fixture';",
  "export { publish } from '../../publication/publish';",
])("does not assign remote composite fixture ownership: %s", (crossFeature) => {
  write("test/harness.fixture.ts", "export const harness = true;");

  write("src/publication/harness.fixture.ts", "export const harness = true;");

  write(
    "src/recovery/test/scenario.fixture.ts",
    `export { admit } from '../admission'; ${crossFeature}`,
  );

  expect(
    lint(
      "test/scenario.test.ts",
      "import { admit } from '../src/recovery/test/scenario.fixture'; export { admit };",
    ).status,
  ).toBe(0);
});

test("retains local evidence from composite fixtures", () => {
  write(
    "src/recovery/setup.fixture.ts",
    "export { admit } from './admission'; export { publish } from '../publication/publish';",
  );

  expect(
    lint(
      "src/recovery/scenario.test.ts",
      "import { admit } from './setup.fixture'; import { publish } from '../publication/publish'; export { admit, publish };",
    ).status,
  ).toBe(0);
});

test("treats source fixtures combined with package harnesses as ambiguous", () => {
  write("test/harness.fixture.ts", "export const harness = true;");

  write(
    "src/recovery/setup.fixture.ts",
    "export { admit } from './admission';",
  );

  expect(
    lint(
      "test/scenario.test.ts",
      "import { harness } from './harness.fixture'; import { admit } from '../src/recovery/setup.fixture'; export { harness, admit };",
    ).status,
  ).toBe(0);
});

test("package harnesses do not exempt direct production subjects", () => {
  write("test/harness.fixture.ts", "export const harness = true;");

  expect(
    lint(
      "test/scenario.test.ts",
      "import { harness } from './harness.fixture'; import { admit } from '../src/recovery/admission'; export { harness, admit };",
    ).status,
  ).toBe(1);
});
