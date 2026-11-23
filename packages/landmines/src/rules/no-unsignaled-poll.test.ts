import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lint, lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-unsignaled-poll-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function configuration(allow?: Record<string, number>) {
  return ruleConfiguration(
    directory,
    "testing/no-unsignaled-poll",
    allow && { allow },
  );
}

const unsignaled = [
  "await expect.poll(() => requests).not.toHaveLength(0);",
  "await expect.poll(() => state.post).not.toHaveBeenCalledWith('old');",
  "await expect.poll(() => spy).not.toHaveReturned();",
  "await expect.poll(() => requests.length).toBe(1);",
  "await expect.poll(() => requests.length, { timeout: 5000 }).toBe(3);",
  "await expect.poll(() => traffic.requests.length).toBe(1);",
  "await expect.poll(() => requestedChunks.size).toBeGreaterThan(0);",
  "await expect.poll(() => { return sent.length; }).toBe(2);",
  "await expect.poll(() => received).toHaveLength(1);",
  "await expect.poll(() => replayUploads.uploads).toHaveLength(2);",
  "await expect.poll(() => onComplete.mock.calls.length).toBe(1);",
  "await expect.poll(() => reload.mock.settledResults[0]?.type).toBe('rejected');",
  "await expect\n  .poll(() => mutate.mock.calls.length)\n  .toBe(1);",
  "await expect.poll(() => spy).toHaveBeenCalledTimes(1);",
  "await expect.poll(() => state.post).toHaveBeenCalled();",
  "await vi.waitFor(() => expect(preload).toHaveBeenCalledTimes(2));",
  "await vi.waitFor(() => expect(state.post).toHaveBeenCalledOnce());",
  "await vi.waitFor(() => expect(cancel).not.toHaveBeenCalledWith(1));",
  "await vi.waitFor(() => expect(requests).toHaveLength(1));",
  "await vi.waitFor(() => expect(releases.length).toBeGreaterThan(index));",
  "await vi.waitFor(() => expect(cancel.mock.calls.length).toBeGreaterThan(0));",
  "await vi.waitFor(() => { expect(fetcher).toHaveBeenCalled(); });",
  "await vi.waitFor(() => workers.size, { timeout: 2000 });",
];

const signaled = [
  "await expect.poll(() => result.current.items).not.toHaveLength(0);",
  "await expect.poll(() => result.current.save).not.toHaveBeenCalled();",
  "await expect.poll(() => document.title).not.toBe('Loading');",
  "await expect.poll(() => status).not.toStrictEqual({ ready: false });",
  "const request = Promise.withResolvers(); await request.promise;",
  "await expect.poll(() => result.current.items.length).toBe(2);",
  "await vi.waitFor(() => expect(result.current.pendingReplies).toHaveLength(1));",
  "await expect.poll(() => curves('overlaid-area').length).toBe(3);",
  "await expect.poll(() => rows.elements().length).toBe(6);",
  "await expect.poll(() => document.title).toBe('Slack');",
  "await expect.poll(rowLabels).toStrictEqual(['a']);",
  "await expect.poll(() => entered, { timeout: 5000 }).toBe(true);",
  "await expect.poll(() => status).toStrictEqual({ ready: true });",
  "await expect.poll(() => result.current.save).toHaveBeenCalled();",
  "await expect.poll(() => clients.at(-1)).toBeDefined();",
  "await expect.poll(() => client.isFetching()).toBe(0);",
  "await expect.poll(() => network.snapshot().pending.length).toBe(1);",
  "await vi.waitFor(() => expect(screen.getByText('Saved')).toBeVisible());",
  "await vi.waitFor(() => expect(status).toBe('ready'));",
  "await vi.waitFor(() => { const count = requests.length; expect(count).toBe(1); });",
  "expect(requests).toHaveLength(1); expect(onComplete).toHaveBeenCalledOnce();",
];

test.each(
  lintBatch(unsignaled, false, "testing", configuration(), "fixture.test.ts"),
)("rejects a deadline-bound poll on recorder state: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("landmines(no-unsignaled-poll)");
  expect(result.output).toContain("Await a signal instead of polling");
});

test.each(
  lintBatch(signaled, false, "testing", configuration(), "fixture.test.ts"),
)("allows signals and polls on observable state: %s", (_, result) => {
  expect(result.status).toBe(0);
});

const twoPolls =
  "await expect.poll(() => requests.length).toBe(1);\nawait expect.poll(() => requests.length).toBe(2);";

test("accepts a file exactly at its allowlisted count", () => {
  expect(
    lint(
      twoPolls,
      false,
      "testing",
      configuration({ "0/fixture.test.ts": 2 }),
      "fixture.test.ts",
    ).status,
  ).toBe(0);
});

test("rejects polls beyond a file's allowlisted count", () => {
  const result = lint(
    twoPolls,
    false,
    "testing",
    configuration({ "0/fixture.test.ts": 1 }),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("Await a signal instead of polling");
});

test("asks to lower an allowlist entry once its file has fewer polls", () => {
  const result = lint(
    "await expect.poll(() => requests.length).toBe(1);",
    false,
    "testing",
    configuration({ "0/fixture.test.ts": 3 }),
    "fixture.test.ts",
  );

  expect(result.status).toBe(1);
  expect(result.output).toContain("This file now has 1 unsignaled polls");
  expect(result.output).toContain("0/fixture.test.ts");
});

test("ignores allowlist entries that only share a filename suffix", () => {
  expect(
    lint(
      "await expect.poll(() => requests.length).toBe(1);",
      false,
      "testing",
      configuration({ "ixture.test.ts": 1 }),
      "fixture.test.ts",
    ).status,
  ).toBe(1);
});

const clockLoops = [
  "async function waitForIngest(page) { const deadline = nowMillis() + 60_000; while (nowMillis() < deadline) { if (await page.getByText('x').isVisible()) return; await page.reload(); } }",
  "export async function settled() { const deadline = Date.now() + 5000; while (Date.now() < deadline) { if (await ready()) return; await sleep(100); } throw new Error('timeout'); }",
  "test('x', async () => { const end = performance.now() + 100; do { await tick(); } while (performance.now() < end); });",
  "test('x', async () => { for (;;) { if (Date.now() > deadline) throw new Error('late'); if (await ready()) break; } });",
  "test('x', async () => { while (true) { const rows = await query(); if (rows.length > 0 || clock.now() > limit) break; } });",
  "test('x', async () => { for (let i = 0; new Date() < until; i++) { await probe(i); } });",
];

const clockFree = [
  "test('x', async () => { const end = performance.now() + 50; while (performance.now() < end) {} });",
  "test('x', async () => { for (let attempt = 0; attempt < 3; attempt++) { await send(); } });",
  "test('x', async () => { while (Date.now() < deadline) { queue.push(() => fetchLater()); } });",
  "test('x', async () => { while (Date.now() < deadline) { spin(async () => { await tick(); }); } });",
  "test('x', async () => { for (let i = 0; i < 3; i++) { const started = Date.now(); await run(i); durations.push(Date.now() - started); } });",
];

test.each(
  lintBatch(clockLoops, false, "testing", configuration(), "fixture.test.ts"),
)("rejects a loop that awaits until a clock deadline: %s", (_, result) => {
  expect(result.status).toBe(1);
  expect(result.output).toContain("landmines(no-unsignaled-poll)");
  expect(result.output).toContain("instead of looping until a clock deadline");
});

test.each(
  lintBatch(clockFree, false, "testing", configuration(), "fixture.test.ts"),
)("allows busy waits, bounded retries and timing loops: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test.each([
  "helper.fixture.ts",
  "helper.test-utils.ts",
  "test/helper.ts",
  "e2e/fixtures/helper.ts",
])("checks clock loops in test support file %s", (filename) => {
  expect(
    lint(clockLoops[1] ?? "", false, "testing", configuration(), filename)
      .status,
  ).toBe(1);
});

test("leaves clock loops in production code alone", () => {
  expect(
    lint(
      clockLoops[1] ?? "",
      false,
      "testing",
      configuration(),
      "src/deploy.ts",
    ).status,
  ).toBe(0);
});
