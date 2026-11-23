import { definePlugin } from "@oxlint/plugins";

import { noComments } from "../rules/no-comments.ts";
import { noInlineHexEncoding } from "../rules/no-inline-hex-encoding.ts";
import { noSelfContainerQuery } from "../rules/no-self-container-query.ts";
import { noSilentCatch } from "../rules/no-silent-catch.ts";
import { paddingBetweenStatements } from "../rules/padding-between-statements.ts";

const plugin = definePlugin({
  meta: { name: "landmines-style" },
  rules: {
    "no-comments": noComments,
    "no-inline-hex-encoding": noInlineHexEncoding,
    "no-self-container-query": noSelfContainerQuery,
    "no-silent-catch": noSilentCatch,
    "padding-between-statements": paddingBetweenStatements,
  },
});

// oxlint-disable-next-line import/no-default-export
export default plugin;
