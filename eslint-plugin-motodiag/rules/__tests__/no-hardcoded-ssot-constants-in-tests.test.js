"use strict";

// f9-allow-ssot-constants: meta-test — this file IS the RuleTester
// suite for the no-hardcoded-ssot-constants-in-tests rule itself.
// The literal SSOT values inside RuleTester `code` fixtures + `data:`
// expectations are intentional fixtures of the very pattern the rule
// catches. Refactoring them through any source-of-truth would defeat
// the test's purpose. See docs/patterns/f9-mock-vs-runtime-drift.md
// subspecies (ii) generalized.

const { RuleTester } = require("eslint");
const rule = require("../no-hardcoded-ssot-constants-in-tests");

// Inject a synthetic in-memory registry so the tests don't depend on
// the on-disk JSON registry's contents (which evolve over time as new
// SSOT-managed constants get registered). The fixtures pin the exact
// production values the rule should match.
const TEST_REGISTRY = [
  {
    name: "DEFAULT_BASE_URL",
    source_module: "src/api/client",
    role: "contract",
    value_type: "string",
    live_value: "http://10.0.2.2:8000",
    description: "Test fixture — dev backend URL pin (>=30 chars to satisfy registry validation guidance).",
  },
  {
    name: "MAX_VIDEOS_PER_SESSION",
    source_module: "src/types/video",
    role: "contract",
    value_type: "number",
    live_value: 5,
    description: "Test fixture — per-session video count cap pin (>=30 chars guidance).",
  },
  {
    name: "DTC_SEARCH_DEBOUNCE_MS",
    source_module: "src/hooks/useDTCSearch",
    role: "contract",
    value_type: "number",
    live_value: 300,
    description: "Test fixture — debounce delay pin for DTC search hook (>=30 chars guidance).",
  },
  // Synthetic noise-overlap entry: a registry value of 0 that the rule
  // should NOT flag because 0 is in the noise-literal exclusion set.
  {
    name: "ZERO_VALUED_SENTINEL",
    source_module: "src/synthetic/noise",
    role: "contract",
    value_type: "number",
    live_value: 0,
    description: "Test fixture — synthetic zero-valued entry to verify noise-literal filter (>=30 chars guidance).",
  },
  // Default-role entry: should be SKIPPED entirely by the rule (the
  // rule filters role: "contract" on load). Setting a value that would
  // otherwise match a fixture below to confirm the skip works.
  {
    name: "SKIPPED_DEFAULT_ENTRY",
    source_module: "src/synthetic/skipme",
    role: "default",
    value_type: "string",
    live_value: "should-not-fire-because-role-is-default",
    description: "Test fixture — role: default entries are skipped by the lint scanner (>=30 chars guidance).",
  },
];

rule._setRegistryForTests(TEST_REGISTRY);

// ESLint 8 legacy RuleTester config — see fix-cycle note in
// no-closure-state-capture-in-native-callback.test.js.
const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-hardcoded-ssot-constants-in-tests", rule, {
  valid: [
    // 1. Negative — assertion uses no literal RHS, just a defined check.
    {
      filename: "/repo/__tests__/api/client.test.ts",
      code: `
        import { DEFAULT_BASE_URL } from '../../src/api/client';
        it('test', () => { expect(DEFAULT_BASE_URL).toBeDefined(); });
      `,
    },
    // 2. Per-line opt-out (ssot-pin) suppresses the finding.
    {
      filename: "/repo/__tests__/api/client.test.ts",
      code: `
        import { DEFAULT_BASE_URL } from '../../src/api/client';
        it('t', () => {
          expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:8000'); // f9-noqa: ssot-pin emulator loopback URL pinned for regression coverage
        });
      `,
    },
    // 3. Per-line opt-out with contract-pin: subcategory.
    {
      filename: "/repo/__tests__/api/client.test.ts",
      code: `
        import { DEFAULT_BASE_URL } from '../../src/api/client';
        it('t', () => {
          expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:8000'); // f9-noqa: ssot-pin contract-pin: dev-backend identity pinned by regression
        });
      `,
    },
    // 4. Noise-literal filter: bare 0 matching ZERO_VALUED_SENTINEL
    // should NOT fire even though the registry has live_value: 0.
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `it('t', () => { expect(result).toBe(0); });`,
    },
    // 5. Identifier-nearby narrowing: literal 5 matches
    // MAX_VIDEOS_PER_SESSION's value but no registry-name identifier
    // is nearby and src/types/video isn't imported — should NOT fire.
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `it('t', () => { expect(items.length).toBe(5); });`,
    },
    // 6. Reverse-direction import-match drop: importing from a
    // sibling module that shares a parent path with src/api/client
    // (but is NOT src/api/client itself) should NOT match
    // DEFAULT_BASE_URL — the literal '/v1/version' (unrelated) is
    // safe; and a bare matching literal nearby a different import
    // shouldn't fire.
    {
      filename: "/repo/__tests__/api/auth.test.ts",
      code: `
        import { foo } from '../../src/api/auth';
        it('t', () => { expect(thing).toBe('http://10.0.2.2:8000'); });
      `,
    },
    // 7. File-level opt-out (legacy f9-allow-model-ids back-compat).
    {
      filename: "/repo/__tests__/legacy.test.ts",
      code: `
        // f9-allow-model-ids: legacy back-compat opt-out kept working through stub-redirect deprecation period
        import { DEFAULT_BASE_URL } from '../../src/api/client';
        it('t', () => { expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:8000'); });
      `,
    },
    // 8. role: "default" registry entry value should NOT fire even
    // though it appears as a literal next to a matching identifier.
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `
        import { SKIPPED_DEFAULT_ENTRY } from '../../src/synthetic/skipme';
        it('t', () => { expect(SKIPPED_DEFAULT_ENTRY).toBe('should-not-fire-because-role-is-default'); });
      `,
    },
  ],

  invalid: [
    // 1. Positive — matching literal next to a matching identifier
    // (DEFAULT_BASE_URL is named in the assertion).
    {
      filename: "/repo/__tests__/api/client.test.ts",
      code: `
        import { DEFAULT_BASE_URL } from '../../src/api/client';
        it('t', () => { expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:8000'); });
      `,
      errors: [
        {
          messageId: "hardcoded",
          data: {
            value: "'http://10.0.2.2:8000'",
            sourceModule: "src/api/client",
            name: "DEFAULT_BASE_URL",
          },
        },
      ],
    },
    // 2. Positive — matching number literal next to identifier match.
    {
      filename: "/repo/__tests__/hooks/useDTCSearch.test.ts",
      code: `
        import { DTC_SEARCH_DEBOUNCE_MS } from '../../src/hooks/useDTCSearch';
        it('t', () => { expect(DTC_SEARCH_DEBOUNCE_MS).toBe(300); });
      `,
      errors: [
        {
          messageId: "hardcoded",
          data: {
            value: "300",
            sourceModule: "src/hooks/useDTCSearch",
            name: "DTC_SEARCH_DEBOUNCE_MS",
          },
        },
      ],
    },
    // 3. Malformed per-line opt-out (reason too short) — fires the
    // malformedOptOut diagnostic AND falls through to fire the
    // underlying hardcoded finding (so the malformed opt-out doesn't
    // act as a free pass). Two errors expected.
    {
      filename: "/repo/__tests__/api/client.test.ts",
      code: `
        import { DEFAULT_BASE_URL } from '../../src/api/client';
        it('t', () => { expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:8000'); // f9-noqa: ssot-pin ok
        });
      `,
      errors: [
        { messageId: "malformedOptOut" },
        { messageId: "hardcoded" },
      ],
    },
    // 4. Malformed per-line opt-out with contract-pin: subcategory
    // (reason after the keyword too short).
    {
      filename: "/repo/__tests__/api/client.test.ts",
      code: `
        import { DEFAULT_BASE_URL } from '../../src/api/client';
        it('t', () => { expect(DEFAULT_BASE_URL).toBe('http://10.0.2.2:8000'); // f9-noqa: ssot-pin contract-pin: short
        });
      `,
      errors: [
        { messageId: "malformedOptOut" },
        { messageId: "hardcoded" },
      ],
    },
    // 5. Identifier-nearby firing: no import, but registry name is
    // textually present near the literal. Two `5` literals fire because
    // both appear within the proximity window of the registry-name
    // identifier (one in the local `= 5` shadow declaration; one in
    // the `.toBe(5)` assertion). The rule correctly flags both — the
    // shadow-declaration-itself is the kind of accidental drift the
    // rule should catch (someone might think they're declaring a local
    // override but really they're literal-pinning the SSOT value).
    {
      filename: "/repo/__tests__/foo.test.ts",
      code: `it('t', () => { const MAX_VIDEOS_PER_SESSION = 5; expect(MAX_VIDEOS_PER_SESSION).toBe(5); });`,
      errors: [
        { messageId: "hardcoded" },
        { messageId: "hardcoded" },
      ],
    },
  ],
});

// Verify role: "default" entries are filtered out at registry-load
// time (separate from RuleTester since this is a unit-level seam).
{
  rule._setRegistryForTests(TEST_REGISTRY);
  // After filter: 4 contract entries (DEFAULT_BASE_URL,
  // MAX_VIDEOS_PER_SESSION, DTC_SEARCH_DEBOUNCE_MS,
  // ZERO_VALUED_SENTINEL); 1 default entry skipped.
  // We assert this by checking that a fixture using SKIPPED_DEFAULT_
  // ENTRY's value doesn't fire (covered by valid case #8 above).
}

console.log("PASS: no-hardcoded-ssot-constants-in-tests");
