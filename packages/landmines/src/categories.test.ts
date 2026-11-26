import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { config, configs } from "./categories";
import plugin from "./plugin";

test.each(Object.entries(configs))(
  "configs/%s.json enables the rules of its categories",
  (name, included) => {
    const shipped: unknown = JSON.parse(
      readFileSync(new URL(`../configs/${name}.json`, import.meta.url), "utf8"),
    );

    expect(shipped).toStrictEqual(config(included));
  },
);

test("the all config enables every rule", () => {
  expect(Object.keys(config(configs.all).rules).toSorted()).toStrictEqual(
    Object.keys(plugin.rules)
      .map((rule) => `landmines/${rule}`)
      .toSorted(),
  );
});
