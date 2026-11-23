import { definePlugin } from "@oxlint/plugins";

import { noPrefixCluster } from "../layout/no-prefix-cluster.ts";
import { noScriptsDirectory } from "../layout/no-scripts-directory.ts";
import { testDirOnlyCrossFunctional } from "../layout/test-dir-only-cross-functional.ts";
import { colocatedTests } from "../rules/colocated-tests.ts";
import { maxExportsPerModule } from "../rules/max-exports-per-module.ts";
import { maxFileLines } from "../rules/max-file-lines.ts";
import { maxFilesPerDirectory } from "../rules/max-files-per-directory.ts";
import { noGithubScripts } from "../rules/no-github-scripts.ts";
import { packageExports } from "../rules/package-exports.ts";
import { packageScriptsRule } from "../rules/package-scripts.ts";
import { testFileNames } from "../rules/test-file-names.ts";

const plugin = definePlugin({
  meta: { name: "landmines-structure" },
  rules: {
    "colocated-tests": colocatedTests,
    "max-exports-per-module": maxExportsPerModule,
    "max-file-lines": maxFileLines,
    "max-files-per-directory": maxFilesPerDirectory,
    "no-github-scripts": noGithubScripts,
    "no-prefix-cluster": noPrefixCluster,
    "no-scripts-directory": noScriptsDirectory,
    "package-exports": packageExports,
    "package-scripts": packageScriptsRule,
    "test-dir-only-cross-functional": testDirOnlyCrossFunctional,
    "test-file-names": testFileNames,
  },
});

// oxlint-disable-next-line import/no-default-export
export default plugin;
