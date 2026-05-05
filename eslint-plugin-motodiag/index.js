"use strict";

/**
 * eslint-plugin-motodiag - F9 mock-vs-runtime-drift mitigation rules.
 *
 * Pattern doc: docs/patterns/f9-mock-vs-runtime-drift.md
 *
 * Rules:
 *   no-closure-state-capture-in-native-callback (subspecies i)
 *   no-hardcoded-model-ids-in-tests             (subspecies ii — DEPRECATED stub-redirect, Phase 191D)
 *   no-hardcoded-ssot-constants-in-tests        (subspecies ii generalized — Phase 191D)
 *   no-loose-typed-async-mock-returns           (subspecies iii)
 *
 * Severity rollout (per plan v1.0.1 Correction B3): subspecies i + iii
 * shipped at 'warn' in Commit 3-4 of Phase 191C; bumped to 'error' in
 * Commit 5 finalize. The Phase 191D generalized rule ships at 'error'
 * from day one (no warn-rollout phase needed; Phase 191C 5a established
 * the discipline + clean-baseline). The narrow stub-redirect inherits
 * its current 'error' severity from the user's .eslintrc.js.
 */

module.exports = {
  rules: {
    "no-closure-state-capture-in-native-callback": require("./rules/no-closure-state-capture-in-native-callback"),
    "no-hardcoded-model-ids-in-tests": require("./rules/no-hardcoded-model-ids-in-tests"),
    "no-hardcoded-ssot-constants-in-tests": require("./rules/no-hardcoded-ssot-constants-in-tests"),
    "no-loose-typed-async-mock-returns": require("./rules/no-loose-typed-async-mock-returns"),
  },
  configs: {
    recommended: {
      plugins: ["motodiag"],
      rules: {
        "motodiag/no-closure-state-capture-in-native-callback": "warn",
        "motodiag/no-hardcoded-model-ids-in-tests": "warn",
        "motodiag/no-hardcoded-ssot-constants-in-tests": "warn",
        "motodiag/no-loose-typed-async-mock-returns": "warn",
      },
    },
  },
};
