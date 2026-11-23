import { definePlugin } from "@oxlint/plugins";

import { noClipboardReadText } from "../rules/no-clipboard-read-text.ts";
import { noColdImportInTest } from "../rules/no-cold-import-in-test.ts";
import { noColdStartInTest } from "../rules/no-cold-start-in-test.ts";
import { noConditionalExpect } from "../rules/no-conditional-expect.ts";
import { noElapsedTimeBound } from "../rules/no-elapsed-time-bound.ts";
import { noFixedSleep } from "../rules/no-fixed-sleep.ts";
import { noFlakeMasking } from "../rules/no-flake-masking.ts";
import { noImportedMutation } from "../rules/no-imported-mutation.ts";
import { noParameterBranch } from "../rules/no-parameter-branch.ts";
import { noProjectMaxWorkers } from "../rules/no-project-max-workers.ts";
import { noStaleRenderAssertion } from "../rules/no-stale-render-assertion.ts";
import { noStylingClassAssertion } from "../rules/no-styling-class-assertion.ts";
import { noTestDoubles } from "../rules/no-test-doubles.ts";
import { noUnsignaledPoll } from "../rules/no-unsignaled-poll.ts";
import { strictMsw } from "../rules/strict-msw.ts";
import { declaredTestInputs } from "../test-inputs/declared-inputs.ts";

const plugin = definePlugin({
  meta: { name: "landmines-testing" },
  rules: {
    "declared-test-inputs": declaredTestInputs,
    "no-clipboard-read-text": noClipboardReadText,
    "no-cold-import-in-test": noColdImportInTest,
    "no-cold-start-in-test": noColdStartInTest,
    "no-conditional-expect": noConditionalExpect,
    "no-elapsed-time-bound": noElapsedTimeBound,
    "no-fixed-sleep": noFixedSleep,
    "no-flake-masking": noFlakeMasking,
    "no-imported-mutation": noImportedMutation,
    "no-parameter-branch": noParameterBranch,
    "no-project-max-workers": noProjectMaxWorkers,
    "no-stale-render-assertion": noStaleRenderAssertion,
    "no-styling-class-assertion": noStylingClassAssertion,
    "no-test-doubles": noTestDoubles,
    "no-unsignaled-poll": noUnsignaledPoll,
    "strict-msw": strictMsw,
  },
});

// oxlint-disable-next-line import/no-default-export
export default plugin;
