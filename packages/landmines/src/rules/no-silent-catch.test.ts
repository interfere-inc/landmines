import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect, test } from "vitest";
import { noSilentCatch } from "./no-silent-catch";

const linter = new Linter();

const plugins = {
  style: {
    rules: { "silent-catch": noSilentCatch },
  } as unknown as ESLint.Plugin,
};

const config: Linter.Config = {
  files: ["**/*.js"],
  plugins,
  languageOptions: { sourceType: "module" },
  rules: { "style/silent-catch": "error" },
};

const allowed: Linter.Config = {
  ...config,
  rules: {
    "style/silent-catch": ["error", { allow: { "src/legacy/flush.js": 2 } }],
  },
};

const messages = (code: string, filename = "src/task.js", rules = config) =>
  linter.verify(code, rules, { filename }).map(({ messageId }) => messageId);

test.each([
  "flush().catch(() => {});",
  "flush().catch(() => undefined);",
  "flush().catch(() => null);",
  "flush().catch(() => void 0);",
  "flush().catch((_error) => {});",
  "flush().catch(async () => {});",
  "flush().catch(function () {});",
  "void reader.cancel().catch(() => undefined);",
  "void body?.cancel().catch(() => undefined);",
  "document.fonts.ready.then(measure).catch(() => {});",
  "flush().catch(() => {}).finally(done);",
  "flush().then(done, () => {});",
  "function hide() { this.flush().catch(() => {}); }",
])(
  "reports a discarded promise with an empty rejection handler: %s",
  (code) => {
    expect(messages(code)).toStrictEqual(["silentCatch"]);
  },
);

test.each([
  "const body = await response.json().catch(() => null);",
  "await bucket.delete(key).catch(() => undefined);",
  "const pending = flush().catch(() => undefined);",
  "function settle() { return flush().catch(() => {}); }",
  "ctx.waitUntil(flush().catch(() => {}));",
  "const settled = Promise.all([a.catch(() => null), b]);",
  "flush().catch((error) => log.warn('flush failed', { error }));",
  "flush().catch(() => false);",
  "flush().then(done);",
  "fireAndForget(flush());",
])("allows awaited, returned and handled rejections: %s", (code) => {
  expect(messages(code)).toStrictEqual([]);
});

test.each([
  "src/race.test.js",
  "src/race.worker.test.js",
  "src/test/fixtures/health.js",
  "src/e2e/signout.js",
])("ignores test file %s", (filename) => {
  expect(messages("pending.catch(() => undefined);", filename)).toStrictEqual(
    [],
  );
});

test("allowlists a file at its exact count and reports a stale entry", () => {
  const two = "flush().catch(() => {}); flush().catch(() => {});";

  expect(messages(two, "src/legacy/flush.js", allowed)).toStrictEqual([]);

  expect(
    messages(`${two} flush().catch(() => {});`, "src/legacy/flush.js", allowed),
  ).toStrictEqual(["silentCatch", "silentCatch", "silentCatch"]);

  expect(
    messages("flush().catch(() => {});", "src/legacy/flush.js", allowed),
  ).toStrictEqual(["stale"]);
});
