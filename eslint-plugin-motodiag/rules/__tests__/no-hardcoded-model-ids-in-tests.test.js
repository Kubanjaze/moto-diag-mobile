"use strict";

const { RuleTester } = require("eslint");
const rule = require("../no-hardcoded-model-ids-in-tests");

// ESLint 8 legacy RuleTester config — see fix-cycle note in
// no-closure-state-capture-in-native-callback.test.js.
const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-hardcoded-model-ids-in-tests", rule, {
  valid: [
    // Valid: literal inside KNOWN_GOOD_MODEL_IDS
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `const KNOWN_GOOD_MODEL_IDS = new Set(["claude-sonnet-4-6"]);`,
    },
    // Valid: literal inside KNOWN_BOGUS_IDS
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `const KNOWN_BOGUS_IDS = new Set(["claude-sonnet-4-5-20241022"]);`,
    },
    // Valid: literal inside MODEL_ALIASES dict-like object
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `const MODEL_ALIASES = { sonnet: "claude-sonnet-4-6" };`,
    },
    // Valid: not a test file - no-op
    {
      filename: "/repo/src/foo.ts",
      code: `const x = "claude-sonnet-4-6";`,
    },
    // Valid: literal that doesn't match the pattern - no-op
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `const greeting = "claude is helpful";`,
    },
  ],

  invalid: [
    // The Phase 191B C2 anti-example shape
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `it("test", () => { expect(_resolve_model("sonnet")).toBe("claude-sonnet-4-5-20241022"); });`,
      errors: [{ messageId: "hardcoded", data: { value: "claude-sonnet-4-5-20241022" } }],
    },
    // Current valid model ID hardcoded outside exempt - also flagged
    // (the rule is about CENTRALIZATION, not just bogus IDs)
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `it("test", () => { expect(model).toBe("claude-sonnet-4-6"); });`,
      errors: [{ messageId: "hardcoded", data: { value: "claude-sonnet-4-6" } }],
    },
    // Template literal version
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `const id = \`claude-haiku-4-5-20251001\`;`,
      errors: [{ messageId: "hardcoded" }],
    },
  ],
});

console.log("PASS: no-hardcoded-model-ids-in-tests");
