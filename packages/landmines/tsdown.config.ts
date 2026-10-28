import type { UserConfig } from "tsdown";

export default {
  clean: true,
  dts: { sourcemap: false },
  entry: ["src/plugins/*.ts", "!**/*.test.ts"],
  failOnWarn: "ci-only",
  format: ["esm"],
  logLevel: "warn",
  platform: "node",
  sourcemap: false,
  suppressWarnings:
    "TypeScript 7.0 does not yet have a stable API and is experimental.",
} satisfies UserConfig;
