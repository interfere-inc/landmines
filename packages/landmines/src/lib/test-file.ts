const supportName = /\.(?:test|spec|e2e|fixture|test-utils)\.[cm]?[jt]sx?$/u;
const supportDirectories = new Set(["test", "tests", "__tests__", "e2e"]);

export function isTestSupportFile(filename: string) {
  const parts = filename.replaceAll("\\", "/").split("/");

  return (
    supportName.test(parts.at(-1) ?? "") ||
    parts.slice(0, -1).some((part) => supportDirectories.has(part))
  );
}
