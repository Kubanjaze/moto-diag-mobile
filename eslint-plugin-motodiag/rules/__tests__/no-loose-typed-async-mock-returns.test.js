"use strict";

const { RuleTester } = require("eslint");
const rule = require("../no-loose-typed-async-mock-returns");

// ESLint 8 legacy RuleTester config — see fix-cycle note in
// no-closure-state-capture-in-native-callback.test.js.
const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-loose-typed-async-mock-returns", rule, {
  valid: [
    // Valid: explicit typed return
    {
      code: `
        type UploadResponse = paths['/v1/sessions/{id}/videos']['post']['responses']['201']['content']['application/json'];
        const mock = jest.fn().mockResolvedValue({data: {} as unknown as UploadResponse, error: undefined});
      `,
    },
    // Valid: no type assertion at all (TypeScript infers)
    {
      code: `const mock = jest.fn().mockResolvedValue({data: 42, error: undefined});`,
    },
    // Valid: not a mock-return call
    {
      code: `const x = obj.someMethod({foo: 1 as any});`,
    },
  ],

  invalid: [
    // The Phase 191B C6 anti-example shape
    {
      code: `const mock = jest.fn().mockResolvedValue({data: {} as any, error: undefined});`,
      errors: [{ messageId: "looseAny" }],
    },
    // mockReturnValue variant
    {
      code: `const mock = jest.fn().mockReturnValue({data: null as any});`,
      errors: [{ messageId: "looseAny" }],
    },
    // mockResolvedValueOnce variant
    {
      code: `const mock = jest.fn().mockResolvedValueOnce({data: undefined as any});`,
      errors: [{ messageId: "looseAny" }],
    },
    // Note (Phase 191C Commit 3 fix-cycle): the `as unknown as <non-schema>`
    // case is no longer flagged. Local type aliases to paths[...] /
    // components[...] are the LEGITIMATE FIX PATTERN per plan v1.0.1
    // Correction B1(iii); statically distinguishing them from fake aliases
    // requires type-checking the rule can't do. TypeScript strict mode
    // catches actual assignment incompatibilities. Rule narrowed to `as any`
    // only.
  ],
});

console.log("PASS: no-loose-typed-async-mock-returns");
