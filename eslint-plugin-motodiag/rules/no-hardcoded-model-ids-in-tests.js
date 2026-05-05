"use strict";

/**
 * F9 subspecies (ii): hardcoded model IDs in test files.
 *
 * Phase 191D Commit 3: this rule is now a STUB-REDIRECT to the
 * generalized motodiag/no-hardcoded-ssot-constants-in-tests rule. The
 * narrow heuristic + EXEMPT_CONTAINER_NAMES list that lived here
 * through Phase 191C have been superseded by the registry-driven
 * generalized rule (see ../ssot-constants.json + ../rules/
 * no-hardcoded-ssot-constants-in-tests.js). The MODEL_ALIASES /
 * MODEL_PRICING entries in the registry continue to catch the same
 * cases this rule used to catch directly.
 *
 * The redirect is deliberate-on-cutover (per plan v1.0 scope decision
 * D = clean-deprecation at 191D finalize). The stub continues to
 * function via delegation so .eslintrc.js + pre-commit configs that
 * reference the old rule name keep working through Phase 200+. After
 * Phase 200 the rule will be removed; .eslintrc.js entries should
 * migrate to the generalized rule name.
 *
 * Existing test files that opt-out via `// f9-allow-model-ids:
 * <reason>` keep working because the generalized rule recognizes
 * `f9-allow-model-ids` as a back-compat file-level opt-out alongside
 * its native `f9-allow-ssot-constants` / `f9-allow-not-ssot` shapes.
 *
 * See docs/patterns/f9-mock-vs-runtime-drift.md subspecies (ii)
 * generalized for the rationale.
 */

const generalizedRule = require("./no-hardcoded-ssot-constants-in-tests");

// One-time deprecation banner printed at the first rule create() call
// in any given ESLint run (gated by a module-level flag — RuleTester's
// per-test-case create() invocations should not emit N banners).
let _deprecationWarnedHere = false;

function emitDeprecationBannerOnce() {
  if (_deprecationWarnedHere) return;
  _deprecationWarnedHere = true;
  // console.warn goes to stderr in Node by default — this is the
  // mobile-equivalent of the backend's `print(..., file=sys.stderr)`
  // deprecation banner. ESLint's stdout carries findings; stderr
  // carries this informational message (visible to humans, not
  // confused with rule output by tooling).
  // eslint-disable-next-line no-console
  console.warn(
    "DEPRECATION: motodiag/no-hardcoded-model-ids-in-tests is " +
      "deprecated as of Phase 191D; use motodiag/no-hardcoded-ssot-" +
      "constants-in-tests. This stub will be removed in Phase 200+. " +
      "See docs/patterns/f9-mock-vs-runtime-drift.md for the rule " +
      "rename rationale."
  );
}

// Test seam: reset the deprecation flag for unit-test reruns within
// the same Node process.
function _resetDeprecationBanner() {
  _deprecationWarnedHere = false;
}

module.exports = {
  meta: Object.assign({}, generalizedRule.meta, {
    docs: Object.assign({}, generalizedRule.meta.docs, {
      description:
        "(DEPRECATED — Phase 191D) Stub-redirect to motodiag/" +
        "no-hardcoded-ssot-constants-in-tests filtered to model-ID " +
        "registry entries (MODEL_ALIASES / MODEL_PRICING). Will be " +
        "removed in Phase 200+. See docs/patterns/" +
        "f9-mock-vs-runtime-drift.md subspecies (ii) generalized.",
    }),
  }),
  create(context) {
    emitDeprecationBannerOnce();
    // No-op stub. Phase 191D Commit 3 fix-cycle observation: the
    // initial Builder-C cutover delegated to the generalized rule
    // without a registry filter, which caused EVERY ssot-constants
    // finding to also fire under the deprecated rule's ID — every
    // hit reported twice. Cleanest fix is to make the deprecated
    // rule a true no-op: the deprecation banner tells consumers to
    // migrate their `.eslintrc.js` to `motodiag/no-hardcoded-ssot-
    // constants-in-tests`; that NEW rule produces all the actual
    // findings. Mobile has no MODEL_ALIASES entry in the JSON
    // registry today (backend owns model IDs); even if a name_filter
    // was added the stub would correctly produce zero findings.
    // Stub kept alive purely so `.eslintrc.js` references to the
    // deprecated name don't break. Removed entirely in Phase 200+.
    return {};
  },
};

module.exports._resetDeprecationBanner = _resetDeprecationBanner;
