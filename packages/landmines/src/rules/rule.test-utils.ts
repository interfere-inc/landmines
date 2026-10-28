import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

const binary = fileURLToPath(
  new URL("../../node_modules/.bin/oxlint", import.meta.url),
);

const rules = {
  style: "no-comments",
  types: "no-explicit-return-types",
  testing: "no-test-doubles",
};

function runLint(
  codes: readonly string[],
  fix = false,
  plugin: keyof typeof rules = "testing",
  configuration?: string,
  filename = "fixture.tsx",
) {
  const directory = mkdtempSync(join(tmpdir(), "oxlint-rule-"));

  const files = codes.map((_, index) =>
    join(directory, String(index), filename),
  );

  const config = join(directory, "config.json");

  try {
    for (const [index, code] of codes.entries()) {
      const file = join(directory, String(index), filename);

      mkdirSync(dirname(file), { recursive: true });

      writeFileSync(file, code);
    }

    writeFileSync(
      config,
      JSON.stringify({
        categories: { correctness: "off" },
        jsPlugins: [
          {
            name: `landmines-${plugin}`,
            specifier: fileURLToPath(
              new URL(`../plugins/${plugin}.ts`, import.meta.url),
            ),
          },
        ],
        rules: { [`landmines-${plugin}/${rules[plugin]}`]: "error" },
      }),
    );

    const result = spawnSync(
      binary,
      [
        "--config",
        configuration ?? config,
        "--threads",
        "1",
        ...(fix ? ["--fix"] : []),
        ...(codes.length > 1 ? ["--format", "json"] : []),
        ...files,
      ],
      { encoding: "utf8", timeout: 15_000 },
    );

    if (result.error) {
      throw result.error;
    }

    expect(result.stderr).toBe("");

    if (result.status !== 0 && result.status !== 1) {
      throw new Error(
        `Oxlint exited with status ${result.status}: ${result.stdout}`,
      );
    }

    if (codes.length === 1) {
      return files.map((file) => ({
        status: result.status,
        output: result.stdout,
        code: readFileSync(file, "utf8"),
      }));
    }

    const report = JSON.parse(result.stdout) as {
      diagnostics: {
        filename: string;
        severity: string;
        message: string;
        code: string;
      }[];
      number_of_files: number;
    };

    expect(report.number_of_files).toBe(codes.length);

    expect(
      report.diagnostics.every(({ filename: path }) => files.includes(path)),
    ).toBe(true);

    expect(result.status).toBe(
      report.diagnostics.some(({ severity }) => severity === "error") ? 1 : 0,
    );

    return files.map((file) => {
      const diagnostics = report.diagnostics.filter(
        ({ filename: path }) => path === file,
      );

      return {
        status: diagnostics.some(({ severity }) => severity === "error")
          ? 1
          : 0,
        output: JSON.stringify(diagnostics),
        code: readFileSync(file, "utf8"),
      };
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

type LintOptions = [
  fix?: boolean,
  plugin?: keyof typeof rules,
  configuration?: string,
  filename?: string,
];

export function lint(code: string, ...options: LintOptions) {
  const [result] = runLint([code], ...options);

  if (!result) {
    throw new Error("Oxlint did not return a fixture result");
  }

  return result;
}

export function lintBatch(codes: readonly string[], ...options: LintOptions) {
  const results = runLint(codes, ...options);

  return codes.map((code, index) => {
    const result = results[index];

    if (!result) {
      throw new Error(`Oxlint did not return fixture ${index}`);
    }

    return [code, result] as const;
  });
}

interface RuleOptions {
  allow: Record<string, number>;
}

export function ruleConfiguration(
  directory: string,
  rule: string,
  options?: RuleOptions,
) {
  const [plugin] = rule.split("/");
  const file = join(directory, `${crypto.randomUUID()}.json`);

  writeFileSync(
    file,
    JSON.stringify({
      categories: { correctness: "off" },
      jsPlugins: [
        {
          name: `landmines-${plugin}`,
          specifier: fileURLToPath(
            new URL(`../plugins/${plugin}.ts`, import.meta.url),
          ),
        },
      ],
      rules: {
        [`landmines-${rule}`]:
          options === undefined ? "error" : ["error", options],
      },
    }),
  );

  return file;
}
