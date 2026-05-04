"use strict";

/**
 * eslint-plugin-motodiag - F9 mock-vs-runtime-drift mitigation rules.
 *
 * Pattern doc: docs/patterns/f9-mock-vs-runtime-drift.md
 *
 * Rules:
 *   no-closure-state-capture-in-native-callback (subspecies i)
 *   no-hardcoded-model-ids-in-tests (subspecies ii)
 *   no-loose-typed-async-mock-returns (subspecies iii)
 *
 * Severity rollout (per plan v1.0.1 Correction B3): rules ship at
 * 'warn' in Commit 3-4 to enable clean-baseline confirmation; bumped
 * to 'error' in Commit 5 finalize after running against current main
 * with zero false positives.
 */

module.exports = {
  rules: {
    "no-closure-state-capture-in-native-callback": require("./rules/no-closure-state-capture-in-native-callback"),
    "no-hardcoded-model-ids-in-tests": require("./rules/no-hardcoded-model-ids-in-tests"),
    "no-loose-typed-async-mock-returns": require("./rules/no-loose-typed-async-mock-returns"),
  },
  configs: {
    recommended: {
      plugins: ["motodiag"],
      rules: {
        "motodiag/no-closure-state-capture-in-native-callback": "warn",
        "motodiag/no-hardcoded-model-ids-in-tests": "warn",
        "motodiag/no-loose-typed-async-mock-returns": "warn",
      },
    },
  },
};
