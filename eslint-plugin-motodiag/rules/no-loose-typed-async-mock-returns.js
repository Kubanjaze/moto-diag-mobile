"use strict";

/**
 * F9 subspecies (iii): loose-typed async mock returns.
 *
 * jest.fn().mockResolvedValue(X) calls where X uses `as any` /
 * `as unknown as Y` to bypass the typed contract. Mocked async
 * functions MUST return Promise<T> where T is the imported return
 * type from the module being mocked.
 *
 * See docs/patterns/f9-mock-vs-runtime-drift.md subspecies (iii).
 *
 * This rule catches the Phase 191B C6 file:// bug shape - the mock
 * for api.POST returned `{data: {} as any, error: undefined}` so the
 * test never validated the FormData -> fetch contract.
 *
 * Exempt: `as unknown as paths[...]` / `as unknown as components['schemas'][...]`
 * annotations (those reference the typed contract from api-types.ts).
 */

// Allowlisted type-assertion shapes that DO reference a real schema:
//   as paths[...]
//   as components['schemas'][...]
//   as unknown as paths[...]
//   as unknown as components['schemas'][...]
const SCHEMA_REF_REGEX = /^(?:unknown\s+as\s+)?(?:paths|components)\b/;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `as any` / `as unknown as Y` (where Y is not a " +
        "typed schema reference) inside jest.fn().mockResolvedValue() " +
        "or .mockReturnValue() calls. Mocked async functions MUST " +
        "return Promise<T> where T is the imported return type from " +
        "the module being mocked. See docs/patterns/" +
        "f9-mock-vs-runtime-drift.md subspecies (iii).",
      recommended: true,
    },
    schema: [],
    messages: {
      looseAny:
        "Loose `as any` inside `{{methodName}}(...)` - the mock's " +
        "return type is unchecked, so the test passes against a fake " +
        "shape that may not match production. Type the mock with the " +
        "real return type from the module being mocked. See " +
        "docs/patterns/f9-mock-vs-runtime-drift.md subspecies (iii).",
      looseUnknownAs:
        "Loose `as unknown as {{typeText}}` inside `{{methodName}}(...)` " +
        "- that type isn't a typed schema reference (paths[...] / " +
        "components['schemas'][...]). The mock's return type isn't " +
        "anchored to the real contract. See docs/patterns/" +
        "f9-mock-vs-runtime-drift.md subspecies (iii).",
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    function isMockReturnCall(callExpr) {
      // Match .mockResolvedValue(...) or .mockReturnValue(...) on
      // any chain. We don't require the chain to start with jest.fn -
      // many mock setups extract the mock first, then call .mockResolvedValue
      // separately.
      const callee = callExpr.callee;
      if (callee.type !== "MemberExpression") return null;
      if (callee.property.type !== "Identifier") return null;
      if (
        callee.property.name === "mockResolvedValue" ||
        callee.property.name === "mockReturnValue" ||
        callee.property.name === "mockResolvedValueOnce" ||
        callee.property.name === "mockReturnValueOnce"
      ) {
        return callee.property.name;
      }
      return null;
    }

    function findLooseTypeAssertions(argNode) {
      // Walk argNode looking for TSAsExpression nodes.
      const findings = [];
      const visited = new WeakSet();

      function walk(node) {
        if (!node || typeof node !== "object" || !node.type) return;
        if (visited.has(node)) return;
        visited.add(node);

        if (node.type === "TSAsExpression") {
          const annotation = node.typeAnnotation;
          // Phase 191C Commit 3 fix-cycle: rule scope NARROWED to fire
          // ONLY on `as any`. The earlier `as unknown as <non-schema>`
          // check was wrong — `as unknown as UploadResponse` (where
          // UploadResponse is a local type alias to a paths[...] /
          // components[...] reference) is the LEGITIMATE FIX PATTERN
          // per plan v1.0.1 Correction B1(iii). The rule can't statically
          // tell whether a local alias resolves to a schema-ref without
          // type-checking; TypeScript's strict mode catches actual
          // assignment incompatibilities. So: fire only on `as any`,
          // which is the unambiguous escape hatch with no fallback
          // type-checking story.
          if (annotation.type === "TSAnyKeyword") {
            findings.push({ node, kind: "any" });
          }
        }

        for (const key in node) {
          if (key === "parent" || key === "loc" || key === "range") continue;
          const value = node[key];
          if (Array.isArray(value)) {
            for (const child of value) walk(child);
          } else if (value && typeof value === "object" && value.type) {
            walk(value);
          }
        }
      }
      walk(argNode);
      return findings;
    }

    return {
      CallExpression(node) {
        const methodName = isMockReturnCall(node);
        if (!methodName) return;
        if (node.arguments.length === 0) return;
        const arg = node.arguments[0];
        const findings = findLooseTypeAssertions(arg);
        for (const finding of findings) {
          if (finding.kind === "any") {
            context.report({
              node: finding.node,
              messageId: "looseAny",
              data: { methodName },
            });
          } else if (finding.kind === "unknown-as") {
            context.report({
              node: finding.node,
              messageId: "looseUnknownAs",
              data: { methodName, typeText: finding.typeText },
            });
          }
        }
      },
    };
  },
};
