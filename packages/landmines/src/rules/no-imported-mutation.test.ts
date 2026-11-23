import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect, test } from "vitest";
import { noImportedMutation } from "./no-imported-mutation";

const linter = new Linter();

const plugins = {
  testing: {
    rules: { mutation: noImportedMutation },
  } as unknown as ESLint.Plugin,
};

const config: Linter.Config = {
  files: ["**/*.js"],
  plugins,
  languageOptions: { sourceType: "module" },
  rules: { "testing/mutation": "error" },
};

const allowed: Linter.Config = {
  files: ["**/*.js"],
  plugins,
  languageOptions: { sourceType: "module" },
  rules: {
    "testing/mutation": ["error", { allow: { "src/legacy/env.test.js": 2 } }],
  },
};

const messages = (code: string, filename = "fixture.test.js", rules = config) =>
  linter.verify(code, rules, { filename }).map(({ messageId }) => messageId);

test.each([
  'import { deadline } from "./request"; deadline.milliseconds = 50;',
  'import { deadline } from "./request"; test("x", () => { deadline.milliseconds = 50; });',
  'import { env } from "cloudflare:workers"; env.DEPLOY_ENV = "production";',
  'import { auth } from "./fixture"; auth.claims.org.role = "3";',
  'import { uploads } from "./fixture"; uploads.requests.length = 0;',
  'import * as request from "./request"; request.deadline.milliseconds = 50;',
  'import config from "motion"; config.useManualTiming = true;',
  'import { counters } from "./state"; counters.total += 1;',
])("reports an assignment to an imported binding's property: %s", (code) => {
  expect(messages(code)).toStrictEqual(["mutation"]);
});

test.each([
  'import { env } from "cloudflare:workers"; Object.assign(env, { DEPLOY_ENV: "production" });',
  'import { env } from "cloudflare:workers"; Object.defineProperty(env, "FLAGS", { value: 1 });',
  'import { env } from "cloudflare:workers"; Object.defineProperties(env, { FLAGS: { value: 1 } });',
  'import { env } from "cloudflare:workers"; Reflect.deleteProperty(env, "DEPLOY_ENV");',
  'import { env } from "cloudflare:workers"; Reflect.set(env, "DEPLOY_ENV", "production");',
  'import { env } from "cloudflare:workers"; Reflect.defineProperty(env, "FLAGS", { value: 1 });',
  'import * as request from "./request"; Object.assign(request.deadline, { milliseconds: 50 });',
  'import { env } from "cloudflare:workers"; delete env.DEPLOY_ENV;',
  'import { env } from "cloudflare:workers"; afterEach(() => Object.assign(env, original));',
])("reports a call that mutates an imported binding: %s", (code) => {
  expect(messages(code)).toStrictEqual(["mutation"]);
});

test.each([
  'import { env } from "cloudflare:workers"; const copy = Object.assign({}, env, { DEPLOY_ENV: "production" });',
  'import { env } from "cloudflare:workers"; const copy = { ...env }; Object.assign(copy, { DEPLOY_ENV: "production" });',
  'import { env } from "cloudflare:workers"; const copy = { ...env }; Reflect.deleteProperty(copy, "DEPLOY_ENV");',
  'import { env } from "cloudflare:workers"; Reflect.get(env, "DEPLOY_ENV"); Object.keys(env);',
  'import { env } from "cloudflare:workers"; const copy = { ...env }; delete copy.DEPLOY_ENV;',
  'import { withEnv } from "cloudflare:workers"; withEnv({ DEPLOY_ENV: "production" }, () => 1);',
])("allows copies, reads and scoped overrides: %s", (code) => {
  expect(messages(code)).toStrictEqual([]);
});

test.each([
  "fixture.fixture.js",
  "helpers.test-utils.js",
  "nested/dir/env.spec.js",
])("checks %s like a test file", (filename) => {
  expect(
    messages(
      'import { env } from "cloudflare:workers"; Object.assign(env, { A: "1" });',
      filename,
    ),
  ).toStrictEqual(["mutation"]);
});

test.each([
  'import { deadline } from "./request"; test("x", () => { const deadline = { milliseconds: 0 }; deadline.milliseconds = 50; });',
  "const local = { milliseconds: 0 }; local.milliseconds = 50;",
  'import { requestK2 } from "./request"; requestK2({ deadlineMs: 50 });',
  'import { env } from "cloudflare:workers"; const copy = { ...env }; copy.DEPLOY_ENV = "production";',
  'import { deadline } from "./request"; expect(deadline.milliseconds).toBe(30_000);',
  "let value; value = 1;",
])("allows local state and reads of imported values: %s", (code) => {
  expect(messages(code)).toStrictEqual([]);
});

test("ignores production files", () => {
  expect(
    messages(
      'import { deadline } from "./request"; deadline.milliseconds = 50;',
      "fixture.js",
    ),
  ).toStrictEqual([]);
});

test("counts calls toward an allowlist entry", () => {
  const code =
    'import { env } from "cloudflare:workers"; Object.assign(env, { A: "1" }); Reflect.deleteProperty(env, "A");';

  expect(messages(code, "src/legacy/env.test.js", allowed)).toStrictEqual([]);

  expect(
    messages(`${code} env.B = "2";`, "src/legacy/env.test.js", allowed),
  ).toStrictEqual(["mutation", "mutation", "mutation"]);
});

test("allowlists a file at its exact count and reports a stale entry", () => {
  const two =
    'import { env } from "cloudflare:workers"; env.A = "1"; env.B = "2";';

  expect(messages(two, "src/legacy/env.test.js", allowed)).toStrictEqual([]);

  expect(
    messages(`${two} env.C = "3";`, "src/legacy/env.test.js", allowed),
  ).toStrictEqual(["mutation", "mutation", "mutation"]);

  expect(
    messages(
      'import { env } from "cloudflare:workers"; env.A = "1";',
      "src/legacy/env.test.js",
      allowed,
    ),
  ).toStrictEqual(["stale"]);
});
