import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-inline-hex-encoding-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const configuration = ruleConfiguration(
  directory,
  "style/no-inline-hex-encoding",
);

const inlined = [
  'const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");',
  'const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");',
  'const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");',
  'const hex = Array.from(bytes).map((byte) => { return byte.toString(16).padStart(2, "0"); }).join("");',
  'const table = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"));',
  'const hex = Array.from(bytes).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");',
  'let hex = ""; for (const byte of bytes) { hex += byte.toString(16).padStart(2, "0"); }',
  'let hex = ""; for (let index = 0; index < bytes.length; index++) hex += bytes[index].toString(16).padStart(2, "0");',
  'const hex = bytes.reduce((text, byte) => text + byte.toString(16).padStart(2, "0"), "");',
];

const allowed = [
  'const flags = ctx.traceFlags.toString(16).padStart(2, "0");',
  'const id = index.toString(16).padStart(2, "0");',
  'const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(4, "0")).join("");',
  'const hex = Array.from(bytes, (byte) => byte.toString(2).padStart(2, "0")).join("");',
  'import { bytesToHex } from "./hex"; const hex = bytesToHex(bytes);',
  'const hex = items.map((item) => item.name.padStart(2, "0"));',
  'for (const item of items) { console.log(item); } const id = index.toString(16).padStart(2, "0");',
  'for (const id of [index.toString(16).padStart(2, "0")]) { console.log(id); }',
];

test.each(lintBatch(inlined, false, "style", configuration))(
  "rejects inline byte hex encoding: %s",
  (_, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("no-inline-hex-encoding");
    expect(result.output).toContain("toHex()");
  },
);

test.each(lintBatch(allowed, false, "style", configuration))(
  "accepts numeric formatting and the shared helper: %s",
  (_, result) => {
    expect(result.status).toBe(0);
  },
);
