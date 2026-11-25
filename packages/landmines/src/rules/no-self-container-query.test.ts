import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

import { lintBatch, ruleConfiguration } from "./rule.test-utils";

const directory = mkdtempSync(join(tmpdir(), "no-self-container-query-"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const configuration = ruleConfiguration(
  directory,
  "style/no-self-container-query",
);

const selfQueries = [
  'const frame = <div className="@container flex flex-col @3xl:flex-row" />;',
  'const frame = <div className="@3xl:flex-row flex @container" />;',
  'const frame = <div className="@container hover:@md:underline" />;',
  'const frame = <div className="@container @min-[400px]:grid" />;',
  'const frame = <div className="@container @max-3xl:hidden" />;',
  'const frame = <div className="@container/main @3xl:flex-row" />;',
  'const frame = <div className="@container/main @3xl/main:flex-row" />;',
  'const frame = <div className="@container-size @3xl:flex-row" />;',
  'const frame = <div className={cn("@container flex", "@3xl:flex-row")} />;',
  'const frame = <div className={cn("@container", active && "@lg:grid")} />;',
  `const frame = <div className={\`@container \${gap} @3xl:flex-row\`} />;`,
  'const frame = <Shell contentClassName="@container @3xl:p-8" />;',
  'const frame = <div className={"@container @xl:[&>*]:p-4"} />;',
  'const frame = <div className={flag ? "@container @md:block" : "flex"} />;',
  'const frame = <div className={cn("@container", flag ? "@md:block" : "flex")} />;',
  'const frame = <div className={cn(flag ? "@container" : "flex", other ? "@md:block" : "grid")} />;',
];

const ancestorQueries = [
  'const frame = <div className="@container"><div className="flex @3xl:flex-row" /></div>;',
  'const frame = <div className="@container/main @3xl/side:flex-row" />;',
  'const frame = <div className="@container-normal @3xl:flex-row" />;',
  'const frame = <div className="flex md:flex-row" />;',
  'const frame = <div className="@container flex md:flex-row" />;',
  'const frame = <div className="@container" data-state="@3xl:open" />;',
  'const frame = <div className="@container">{"@3xl:flex"}</div>;',
  'const classes = "@container @3xl:flex-row";',
  'const frame = <div className={flag ? "@container" : "@md:block"} />;',
  'const frame = <div className={cn("flex", flag ? "@container flex-col" : "@3xl:flex-row")} />;',
  `const frame = <div className={\`flex \${nested ? "@sm:flex" : "@container"}\`} />;`,
];

test.each(lintBatch(selfQueries, false, "style", configuration, "fixture.tsx"))(
  "rejects a container query on its own container: %s",
  (_, result) => {
    expect(result.status).toBe(1);
    expect(result.output).toContain("no-self-container-query");
  },
);

test.each(
  lintBatch(ancestorQueries, false, "style", configuration, "fixture.tsx"),
)("accepts queries against an ancestor container: %s", (_, result) => {
  expect(result.status).toBe(0);
});

test.each(lintBatch([selfQueries[0] ?? ""], false, "style", configuration))(
  "names the variant and the fix: %s",
  (_, result) => {
    expect(result.output).toContain("@3xl: never matches");
    expect(result.output).toContain("Move @container to a wrapper element");
  },
);
