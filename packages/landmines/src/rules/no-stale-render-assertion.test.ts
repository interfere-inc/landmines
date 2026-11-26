import { Linter } from "eslint";
import type { ESLint } from "eslint";
import { expect, test } from "vitest";

import { noStaleRenderAssertion } from "./no-stale-render-assertion";

const linter = new Linter();

const config: Linter.Config = {
  files: ["**/*.js"],
  plugins: {
    testing: {
      rules: { stale: noStaleRenderAssertion },
    } as unknown as ESLint.Plugin,
  },
  rules: { "testing/stale": "error" },
};

function verify(code: string, filename = "fixture.browser.test.js") {
  return linter
    .verify(`test("x", async () => { ${code} });`, config, { filename })
    .map(({ messageId }) => messageId);
}

test.each([
  'await expect.poll(() => client.getQueryState(["k"])?.status).toBe("success"); expect(hook.result.current).toStrictEqual(value);',
  "await expect.poll(() => observed.at(-1)).toStrictEqual({}); expect(requests).toHaveLength(1); expect(hook.result.current).toStrictEqual([]);",
  "await vi.waitFor(() => expect(spy).toHaveBeenCalled()); expect(hook.result.current.items).toHaveLength(1);",
  "await vi.waitUntil(() => store.getState().ready); expect(hook.result.current).toBe(1);",
  "const state = await vi.waitFor(() => store.getState()); expect(hook.result.current).toBe(state);",
  "await expect.poll(() => other.result.current).toBe(1); expect(hook.result.current).toBe(1);",
  "await expect.poll(() => cache.status).toBe(1); await requested(1); expect(requests).toHaveLength(1); expect(hook.result.current).toStrictEqual(value);",
  "await expect.poll(() => cache.status).toBe(1); await received.promise; expect(hook.result.current).toBe(1);",
  'await expect.poll(() => client.getQueryState(["k"])?.status, { timeout: 5000 }).toBe("success"); expect(hook.result.current?.state).toBe("downtime");',
])("reports a stale rendered read after a poll on other state: %s", (code) => {
  expect(verify(code)).toStrictEqual(["stale"]);
});

test.each([
  "await expect.poll(() => hook.result.current).toBe(1); expect(hook.result.current).toBe(1);",
  "await expect.poll(() => hook.result.current.items.map(({ id }) => id)).toStrictEqual([]); expect(hook.result.current.feed).toBe(x);",
  "await vi.waitFor(() => expect(hook.result.current).toBe(1)); expect(hook.result.current).toBe(1);",
  "const hook = await renderHook(() => useX()); expect(hook.result.current).toBeNull();",
  "await hook.rerender({}); expect(hook.result.current).toBe(1);",
  "await expect.poll(() => other).toBe(1); await act(() => {}); expect(hook.result.current).toBe(1);",
  'await expect.poll(() => other).toBe(1); await expect.element(screen.getByText("x")).toBeVisible(); expect(hook.result.current).toBe(1);',
  "await expect.poll(() => other).toBe(1); const hook = await renderHook(() => useX()); expect(hook.result.current).toBe(1);",
  "await expect.poll(() => other).toBe(1); await expect(hook.result.current).resolves.toBe(1);",
  "expect(hook.result.current).toBe(1);",
  "await expect.poll(() => other).toBe(1); expect(hook.result).toBeDefined();",
  "await expect.poll(() => other).toBe(1); expect(result.current).toBe(1);",
])(
  "accepts rendered reads that follow a render or a poll on the hook: %s",
  (code) => {
    expect(verify(code)).toStrictEqual([]);
  },
);

test("leaves non-browser test files alone", () => {
  expect(
    verify(
      "await expect.poll(() => other).toBe(1); expect(hook.result.current).toBe(1);",
      "fixture.test.js",
    ),
  ).toStrictEqual([]);
});
