import { definePlugin } from "@oxlint/plugins";

import { noPrefixCluster } from "./layout/no-prefix-cluster.ts";
import { noScriptsDirectory } from "./layout/no-scripts-directory.ts";
import { testDirOnlyCrossFunctional } from "./layout/test-dir-only-cross-functional.ts";
import { colocatedTests } from "./rules/colocated-tests.ts";
import { maxExportsPerModule } from "./rules/max-exports-per-module.ts";
import { maxFileLines } from "./rules/max-file-lines.ts";
import { maxFilesPerDirectory } from "./rules/max-files-per-directory.ts";
import { noClipboardReadText } from "./rules/no-clipboard-read-text.ts";
import { noColdImportInTest } from "./rules/no-cold-import-in-test.ts";
import { noColdStartInTest } from "./rules/no-cold-start-in-test.ts";
import { noComments } from "./rules/no-comments.ts";
import { noConditionalExpect } from "./rules/no-conditional-expect.ts";
import { noElapsedTimeBound } from "./rules/no-elapsed-time-bound.ts";
import { noExplicitReturnTypes } from "./rules/no-explicit-return-types.ts";
import { noFixedSleep } from "./rules/no-fixed-sleep.ts";
import { noFlakeMasking } from "./rules/no-flake-masking.ts";
import { noGithubScripts } from "./rules/no-github-scripts.ts";
import { noImportedMutation } from "./rules/no-imported-mutation.ts";
import { noInlineHexEncoding } from "./rules/no-inline-hex-encoding.ts";
import { noParameterBranch } from "./rules/no-parameter-branch.ts";
import { noProjectMaxWorkers } from "./rules/no-project-max-workers.ts";
import { noSelfContainerQuery } from "./rules/no-self-container-query.ts";
import { noSilentCatch } from "./rules/no-silent-catch.ts";
import { noStaleRenderAssertion } from "./rules/no-stale-render-assertion.ts";
import { noStylingClassAssertion } from "./rules/no-styling-class-assertion.ts";
import { noTestDoubles } from "./rules/no-test-doubles.ts";
import { noUnsignaledPoll } from "./rules/no-unsignaled-poll.ts";
import { packageExports } from "./rules/package-exports.ts";
import { packageScriptsRule } from "./rules/package-scripts.ts";
import { paddingBetweenStatements } from "./rules/padding-between-statements.ts";
import { strictMsw } from "./rules/strict-msw.ts";
import { testFileNames } from "./rules/test-file-names.ts";
import { declaredTestInputs } from "./test-inputs/declared-inputs.ts";

const plugin = definePlugin({
  meta: { name: "landmines" },
  rules: {
    "colocated-tests": colocatedTests,
    "declared-test-inputs": declaredTestInputs,
    "max-exports-per-module": maxExportsPerModule,
    "max-file-lines": maxFileLines,
    "max-files-per-directory": maxFilesPerDirectory,
    "no-clipboard-read-text": noClipboardReadText,
    "no-cold-import-in-test": noColdImportInTest,
    "no-cold-start-in-test": noColdStartInTest,
    "no-comments": noComments,
    "no-conditional-expect": noConditionalExpect,
    "no-elapsed-time-bound": noElapsedTimeBound,
    "no-explicit-return-types": noExplicitReturnTypes,
    "no-fixed-sleep": noFixedSleep,
    "no-flake-masking": noFlakeMasking,
    "no-github-scripts": noGithubScripts,
    "no-imported-mutation": noImportedMutation,
    "no-inline-hex-encoding": noInlineHexEncoding,
    "no-parameter-branch": noParameterBranch,
    "no-prefix-cluster": noPrefixCluster,
    "no-project-max-workers": noProjectMaxWorkers,
    "no-scripts-directory": noScriptsDirectory,
    "no-self-container-query": noSelfContainerQuery,
    "no-silent-catch": noSilentCatch,
    "no-stale-render-assertion": noStaleRenderAssertion,
    "no-styling-class-assertion": noStylingClassAssertion,
    "no-test-doubles": noTestDoubles,
    "no-unsignaled-poll": noUnsignaledPoll,
    "package-exports": packageExports,
    "package-scripts": packageScriptsRule,
    "padding-between-statements": paddingBetweenStatements,
    "strict-msw": strictMsw,
    "test-dir-only-cross-functional": testDirOnlyCrossFunctional,
    "test-file-names": testFileNames,
  },
});

// oxlint-disable-next-line import/no-default-export
export default plugin;
