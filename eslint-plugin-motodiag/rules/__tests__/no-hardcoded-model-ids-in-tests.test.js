"use strict";

// f9-allow-model-ids: meta-test — this file IS the RuleTester suite
// for the (now-deprecated) no-hardcoded-model-ids-in-tests rule.
// Phase 191D Commit 3 converted the rule to a stub-redirect that
// delegates to no-hardcoded-ssot-constants-in-tests. Mobile's JSON
// registry intentionally has no MODEL_ALIASES entry (backend owns
// model IDs); the stub functionally produces zero findings on mobile.
//
// Canonical positive/negative/opt-out tests for the SSOT-constants
// behavior live in no-hardcoded-ssot-constants-in-tests.test.js. This
// file remains as a sanity check that:
//   1. The deprecated rule still loads.
//   2. The deprecation banner is printed exactly once via console.warn.
//   3. The stub does not crash on the original anti-example shapes.

const { RuleTester } = require("eslint");
const rule = require("../no-hardcoded-model-ids-in-tests");

// Capture console.warn calls to verify the deprecation banner.
const originalWarn = console.warn;
const warnCalls = [];
console.warn = (...args) => {
  warnCalls.push(args.join(" "));
};

// Reset the module-level _deprecationWarnedHere flag so this test run
// observes the banner emission deterministically.
if (typeof rule._resetDeprecationBanner === "function") {
  rule._resetDeprecationBanner();
}

// ESLint 8 legacy RuleTester config — see fix-cycle note in
// no-closure-state-capture-in-native-callback.test.js.
const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-hardcoded-model-ids-in-tests", rule, {
  valid: [
    // Stub delegates to ssot-constants with no MODEL_ALIASES entry on
    // mobile. The original Phase 191B C2 anti-example shape now
    // produces zero findings — that's the post-cutover reality.
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `it("test", () => { expect(_resolve_model("sonnet")).toBe("claude-sonnet-4-5-20241022"); });`,
    },
    // Same for current valid model ID literal — also produces zero
    // findings since mobile registry has no MODEL_ALIASES entry.
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `it("test", () => { expect(model).toBe("claude-sonnet-4-6"); });`,
    },
  ],

  // No invalid cases — stub-redirect produces zero findings on mobile.
  // Canonical positive cases are in no-hardcoded-ssot-constants-in-tests.test.js.
  invalid: [],
});

// Verify the deprecation banner emitted exactly once via console.warn.
console.warn = originalWarn;
const depCalls = warnCalls.filter((c) => c.includes("DEPRECATION"));
if (depCalls.length !== 1) {
  throw new Error(
    `Expected exactly 1 DEPRECATION console.warn call from the stub-` +
    `redirect; got ${depCalls.length}. Banner-once-per-process gate ` +
    `is broken.`
  );
}

console.log("PASS: no-hardcoded-model-ids-in-tests (stub-redirect)");
