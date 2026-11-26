import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lint, lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-shared-signal-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function configuration(allow?: Record<string, number>) {
  return ruleConfiguration(
    directory,
    "testing/no-shared-signal",
    allow && { allow },
  );
}

const sharedTimeouts = [
  "const REQUEST = { redirect: 'manual', signal: AbortSignal.timeout(30_000) } as const; test('x', async () => { await fetch(url, { ...REQUEST }); });",
  "const signal = AbortSignal.timeout(1000); export function load() { return fetch(url, { signal }); }",
  "describe('x', () => { const signal = AbortSignal.timeout(5000); test('y', async () => { await fetch(url, { signal }); }); });",
  "let signal; signal = AbortSignal.timeout(10);",
  "export const options = { signal: AbortSignal.any([AbortSignal.timeout(10)]) };",
  "class Client { static signal = AbortSignal.timeout(10); }",
];

const freshSignals = [
  "export function gatewayRequest() { return { redirect: 'manual', signal: AbortSignal.timeout(30_000) } as const; }",
  "test('x', async () => { const signal = AbortSignal.timeout(1000); await fetch(url, { signal }); });",
  "await ready(url, AbortSignal.timeout(25_000));",
  "export async function read(url, deadline = AbortSignal.timeout(10_000)) { return fetch(url, { signal: deadline }); }",
  "beforeEach(() => { controller = new AbortController(); });",
  "test('x', () => { const controller = new AbortController(); controller.abort(); });",
  "const request = () => ({ signal: AbortSignal.timeout(10) });",
  "const metadata = await fetch(url, { signal: AbortSignal.timeout(10_000) });",
  "const closed = await fetch(url, { signal: AbortSignal.timeout(1000) }).then(() => false);",
  "const shutdown = new AbortController(); process.once('SIGTERM', () => shutdown.abort());",
];

test.each(
  lintBatch(
    sharedTimeouts,
    false,
    "testing",
    configuration(),
    "fixture.e2e.ts",
  ),
)(
  "rejects a timeout signal created at module or describe scope: %s",
  (_, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("landmines(no-shared-signal)");
    expect(result.output).toContain("starts counting when the module loads");
  },
);

test.each(
  lintBatch(freshSignals, false, "testing", configuration(), "fixture.e2e.ts"),
)("allows signals created per request or per test: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test("rejects one AbortController shared by a test file's tests", () => {
  const result = lint(
    "const controller = new AbortController(); test('x', async () => { await load(controller.signal); });",
    false,
    "testing",
    configuration(),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("shared by every test in the file");
});

test("leaves module signals in production code alone", () => {
  expect(
    lint(
      "const controller = new AbortController(); const query = client(AbortSignal.timeout(60_000)); test('x', () => controller.abort());",
      false,
      "testing",
      configuration(),
      "server.ts",
    ).status,
  ).toBe(0);
});

test("accepts a file exactly at its allowlisted count", () => {
  expect(
    lint(
      "const a = AbortSignal.timeout(1); const b = AbortSignal.timeout(2);",
      false,
      "testing",
      configuration({ "0/fixture.e2e.ts": 2 }),
      "fixture.e2e.ts",
    ).status,
  ).toBe(0);
});

test("asks to lower an allowlist entry once its file has fewer shared signals", () => {
  const result = lint(
    "const a = AbortSignal.timeout(1);",
    false,
    "testing",
    configuration({ "0/fixture.e2e.ts": 2 }),
    "fixture.e2e.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("This file now has 1 shared signals");
});
