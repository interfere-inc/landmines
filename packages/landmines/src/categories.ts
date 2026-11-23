import type plugin from "./plugin.ts";

type Category =
  | "correctness"
  | "suspicious"
  | "pedantic"
  | "style"
  | "restriction";

type Severity = "error" | "warn";

export const categories = {
  "colocated-tests": "restriction",
  "declared-test-inputs": "pedantic",
  "max-exports-per-module": "pedantic",
  "max-file-lines": "pedantic",
  "max-files-per-directory": "pedantic",
  "no-clipboard-read-text": "suspicious",
  "no-cold-import-in-test": "suspicious",
  "no-cold-start-in-test": "suspicious",
  "no-comments": "restriction",
  "no-conditional-expect": "correctness",
  "no-elapsed-time-bound": "suspicious",
  "no-explicit-return-types": "style",
  "no-fixed-sleep": "suspicious",
  "no-flake-masking": "suspicious",
  "no-github-scripts": "restriction",
  "no-imported-mutation": "suspicious",
  "no-inline-hex-encoding": "style",
  "no-parameter-branch": "suspicious",
  "no-prefix-cluster": "pedantic",
  "no-project-max-workers": "correctness",
  "no-scripts-directory": "restriction",
  "no-self-container-query": "correctness",
  "no-shared-signal": "suspicious",
  "no-silent-catch": "correctness",
  "no-stale-render-assertion": "correctness",
  "no-styling-class-assertion": "suspicious",
  "no-test-doubles": "suspicious",
  "no-unsignaled-poll": "suspicious",
  "package-exports": "restriction",
  "package-scripts": "restriction",
  "padding-between-statements": "style",
  "strict-msw": "correctness",
  "test-dir-only-cross-functional": "restriction",
  "test-file-names": "restriction",
} as const satisfies Record<keyof typeof plugin.rules, Category>;

const severities: Record<Category, Severity> = {
  correctness: "error",
  suspicious: "error",
  restriction: "error",
  pedantic: "warn",
  style: "warn",
};

const overrides = new Map<string, Severity>([["package-scripts", "warn"]]);

export const configs = {
  recommended: ["correctness", "suspicious"],
  correctness: ["correctness"],
  suspicious: ["suspicious"],
  pedantic: ["pedantic"],
  style: ["style"],
  restriction: ["restriction"],
  all: ["correctness", "suspicious", "pedantic", "style", "restriction"],
} as const satisfies Record<string, readonly Category[]>;

export function config(included: readonly Category[]) {
  return {
    jsPlugins: [{ name: "landmines", specifier: "@interfere/landmines" }],
    rules: Object.fromEntries(
      Object.entries(categories)
        .filter(([, category]) => included.includes(category))
        .map(([rule, category]) => [
          `landmines/${rule}`,
          overrides.get(rule) ?? severities[category],
        ]),
    ),
  };
}
