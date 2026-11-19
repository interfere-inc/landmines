import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { z } from "zod";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "colocated-tests-lsp-"));
  write(
    "package.json",
    JSON.stringify({ name: "lsp-fixture", type: "module" }),
  );
  write("src/recovery/admission.ts", "export const admit = true;");
  write("src/publication/publish.ts", "export const publish = true;");
  write(
    ".oxlintrc.json",
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
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function write(filename: string, content: string) {
  const target = join(directory, filename);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

async function lintOpenDocument(filename: string, content: string) {
  const uri = pathToFileURL(join(directory, filename)).href;
  const child = spawn(join(root, "node_modules/.bin/oxlint"), ["--lsp"], {
    cwd: directory,
    timeout: 4000,
  });
  const stderr: string[] = [];

  function send(message: Record<string, unknown>) {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    child.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  }

  try {
    return await new Promise<string[]>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      child.once("error", reject);
      child.once("close", (code) => {
        reject(
          new Error(`Language server closed (${code}): ${stderr.join("")}`),
        );
      });
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
      child.stdout.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        try {
          while (true) {
            const headerEnd = buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1) {
              return;
            }
            const header = buffer.subarray(0, headerEnd).toString();
            const length = Number(
              /Content-Length: (?<length>\d+)/iu.exec(header)?.groups?.[
                "length"
              ],
            );
            if (!Number.isFinite(length)) {
              throw new TypeError("Missing LSP content length");
            }
            if (buffer.length < headerEnd + 4 + length) {
              return;
            }
            const message = z
              .object({
                id: z.number().optional(),
                method: z.string().optional(),
                params: z.unknown().optional(),
              })
              .parse(
                JSON.parse(
                  buffer
                    .subarray(headerEnd + 4, headerEnd + 4 + length)
                    .toString(),
                ),
              );
            buffer = buffer.subarray(headerEnd + 4 + length);

            if (message.id === 1) {
              send({ method: "initialized", params: {} });
              send({
                method: "textDocument/didOpen",
                params: {
                  textDocument: {
                    uri,
                    languageId: "typescript",
                    version: 1,
                    text: content,
                  },
                },
              });
            }
            if (message.method === "textDocument/publishDiagnostics") {
              const params = z
                .object({
                  uri: z.string(),
                  diagnostics: z.array(z.object({ message: z.string() })),
                })
                .parse(message.params);
              if (params.uri === uri) {
                resolve(
                  params.diagnostics.map((diagnostic) => diagnostic.message),
                );
              }
            }
          }
        } catch (error) {
          reject(
            new Error("Invalid language server response", { cause: error }),
          );
        }
      });
      const workspaceUri = pathToFileURL(directory).href;
      send({
        id: 1,
        method: "initialize",
        params: {
          processId: process.pid,
          rootUri: workspaceUri,
          workspaceFolders: [{ uri: workspaceUri, name: "fixture" }],
          capabilities: {},
        },
      });
    });
  } finally {
    child.kill();
  }
}

test.each([
  ["src/recovery/new.test.ts", "./admission"],
  ["src/recovery/tests/nested/new.test.ts", "../../admission"],
])("accepts an unsaved owned document at %s", async (filename, specifier) => {
  const diagnostics = await lintOpenDocument(
    filename,
    `import { admit } from '${specifier}'; export { admit };`,
  );
  expect(diagnostics).toStrictEqual([]);
});

test.each([
  ["tests/nested/new.test.ts", "../../src/recovery/admission"],
  ["src/publication/new.test.ts", "../recovery/admission"],
])(
  "reports the owner for an unsaved detached document at %s",
  async (filename, specifier) => {
    const diagnostics = await lintOpenDocument(
      filename,
      `import { admit } from '${specifier}'; export { admit };`,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain("This test has an implementation owner");
    expect(diagnostics[0]).toContain(join("src", "recovery"));
  },
);

test("resolves existing symlinked parents of an unsaved detached document", async () => {
  mkdirSync(join(directory, "deep/tests"), { recursive: true });
  symlinkSync(
    join(directory, "deep/tests"),
    join(directory, "linked-tests"),
    "junction",
  );
  const diagnostics = await lintOpenDocument(
    "linked-tests/new.test.ts",
    "import { admit } from '../../src/recovery/admission'; export { admit };",
  );
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toContain("This test has an implementation owner");
  expect(diagnostics[0]).toContain(join("src", "recovery"));
});

test("retains canonical ownership for an existing document through a directory symlink", async () => {
  write(
    "src/recovery/admission.test.ts",
    "import { admit } from './admission'; export { admit };",
  );
  symlinkSync(
    join(directory, "src/recovery"),
    join(directory, "linked-source"),
    "junction",
  );
  const diagnostics = await lintOpenDocument(
    "linked-source/admission.test.ts",
    "import { admit } from './admission'; export { admit };",
  );
  expect(diagnostics).toStrictEqual([]);
});
