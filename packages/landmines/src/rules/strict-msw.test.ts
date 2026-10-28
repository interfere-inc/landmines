import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

import { lintBatch } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "oxlint-strict-msw-"));

function createConfig(
  name: string,
  options?: { allow: Record<string, number> },
) {
  const config = join(directory, `${name}.json`);

  writeFileSync(
    config,
    JSON.stringify({
      categories: { correctness: "off" },
      jsPlugins: [
        {
          name: "landmines-testing",
          specifier: fileURLToPath(
            new URL("../plugins/testing.ts", import.meta.url),
          ),
        },
      ],
      rules: {
        "landmines-testing/strict-msw": options ? ["error", options] : "error",
      },
    }),
  );

  return config;
}

const config = createConfig("strict");

const allowed = createConfig("allowed", {
  allow: { "src/native/bridge.fixture.ts": 1 },
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const server = 'import { setupServer } from "msw/node";\n';
const worker = 'import { setupWorker } from "msw/browser";\n';

const lenient = [
  `${server}const network = setupServer(); network.listen();`,
  `${server}const network = setupServer(); network.listen({ onUnhandledRequest: "bypass" });`,
  `${server}const network = setupServer(); network.listen({ onUnhandledRequest: "warn" });`,
  `${server}const network = setupServer(); network.listen({ quiet: true });`,
  `${server}setupServer().listen({ onUnhandledRequest: "bypass" });`,
  `${server}const network = setupServer(); export function start() { network.listen(); }`,
  `${worker}const network = setupWorker(); await network.start({ onUnhandledRequest: "bypass" });`,
  `${worker}let network; network = setupWorker(); await network.start({ quiet: true });`,
  `${worker}let network: ReturnType<typeof setupWorker> | undefined;\nexport async function mount() { network = setupWorker(); await network.start({ onUnhandledRequest: "bypass" }); }\nexport function unmount() { network = undefined; }`,
  'import { setupServer as setup } from "msw/node";\nconst network = setup(); network.listen();',
];

const strict = [
  `${server}const network = setupServer(); network.listen({ onUnhandledRequest: "error" });`,
  `${server}setupServer().listen({ onUnhandledRequest: "error" });`,
  `${server}const network = setupServer(); network.listen({ onUnhandledRequest(request, print) { print.error(); } });`,
  `${server}const network = setupServer(); network.listen({ onUnhandledRequest: (request) => { unhandled.push(request.url); } });`,
  `${worker}const network = setupWorker(); await network.start({ quiet: true, onUnhandledRequest: "error" });`,
  `${server}const network = setupServer(); network.close(); network.resetHandlers();`,
  'import { createServer } from "node:http";\nconst server = createServer(); server.listen();',
  "const server = createTestHarness(); await server.listen();",
  "function setupServer() { return { listen() {} }; }\nsetupServer().listen();",
  `${worker}export const network = setupWorker();`,
];

test.each(lintBatch(lenient, false, "testing", config))(
  "rejects lenient MSW starts: %s",
  (_code, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain(String.raw`onUnhandledRequest: \"error\"`);
  },
);

test.each(lintBatch(strict, false, "testing", config))(
  "accepts strict or unrelated starts: %s",
  (_code, result) => {
    expect(result.status).toBe(0);
  },
);

test.each(
  lintBatch(
    [`${worker}const network = setupWorker(); await network.start();`],
    false,
    "testing",
    allowed,
    "src/native/bridge.fixture.ts",
  ),
)("accepts allowlisted files: %s", (_code, result) => {
  expect(result.status).toBe(0);
});

test.each(
  lintBatch(
    [
      `${worker}const network = setupWorker(); await network.start({ onUnhandledRequest: "error" });`,
    ],
    false,
    "testing",
    allowed,
    "src/native/bridge.fixture.ts",
  ),
)("rejects allowlisted files that start MSW strictly: %s", (_code, result) => {
  expect(result.status).toBe(1);

  expect(result.output).toContain("lower its strict-msw allowlist entry");
});
