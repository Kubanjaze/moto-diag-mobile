"use strict";

/**
 * F9 subspecies (ii): hardcoded model IDs in test files.
 *
 * Tests hardcode literal model ID strings instead of referencing a
 * centralized source-of-truth set. When the model ID drifts (e.g.,
 * Anthropic releases a new generation), the tests ASSERT THE BUG
 * INTO PLACE.
 *
 * See docs/patterns/f9-mock-vs-runtime-drift.md subspecies (ii).
 *
 * Backend twin: scripts/check_f9_patterns.py --check-model-ids
 * (sibling repo). Heuristic + exempt list MUST stay in sync.
 */

// Match the model ID shapes the project uses. Includes:
//   claude-haiku-4-5-20251001 (current haiku)
//   claude-sonnet-4-6 (current sonnet)
//   claude-opus-4-7 (current opus)
//   claude-sonnet-4-5-20241022 (the bogus historical ID)
const MODEL_ID_REGEX = /^claude-(haiku|sonnet|opus)-[\d-]+(-\d+)?$/;

// Source-of-truth identifiers that legitimately contain model-ID
// literals. Keep in sync with backend EXEMPT_CONTAINER_NAMES.
const EXEMPT_CONTAINER_NAMES = new Set([
  "KNOWN_GOOD_MODEL_IDS",
  "KNOWN_BOGUS_IDS",
  "MODEL_ALIASES",
  "MODEL_PRICING",
]);

// Only fire on test files (mirrors backend's tests/**/*.py scope).
function isTestFile(filename) {
  // __tests__/**/*.{ts,tsx,js,jsx} OR *.test.{ts,tsx,js,jsx}
  return (
    /[\\/]__tests__[\\/]/.test(filename) ||
    /\.test\.(ts|tsx|js|jsx)$/.test(filename)
  );
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded Claude model ID literals in test files " +
        "outside source-of-truth sets/dicts (KNOWN_GOOD_MODEL_IDS, " +
        "KNOWN_BOGUS_IDS, MODEL_ALIASES, MODEL_PRICING). Centralizes " +
        "the IDs so a generation bump is a single-file change. See " +
        "docs/patterns/f9-mock-vs-runtime-drift.md subspecies (ii).",
      recommended: true,
    },
    schema: [],
    messages: {
      hardcoded:
        "Hardcoded model ID literal '{{value}}' found outside " +
        "source-of-truth set. Move into one of the exempt containers " +
        "(KNOWN_GOOD_MODEL_IDS, KNOWN_BOGUS_IDS, MODEL_ALIASES, " +
        "MODEL_PRICING) OR import from a central source-of-truth " +
        "module. See docs/patterns/f9-mock-vs-runtime-drift.md " +
        "subspecies (ii).",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!isTestFile(filename)) return {}; // No-op outside test files

    function isInsideExemptContainer(node) {
      // Walk up parents; if we hit a VariableDeclarator whose id.name
      // is in EXEMPT_CONTAINER_NAMES, exempt.
      // Also handle AssignmentExpression with a matching LHS Identifier.
      // Also handle Property whose key.name is in the exempt set
      // (covers cases like `MOCK_RESPONSES = { MODEL_ALIASES: {...} }`).
      let current = node.parent;
      while (current) {
        if (current.type === "Property" && !current.computed) {
          const key = current.key;
          if (
            (key.type === "Identifier" && EXEMPT_CONTAINER_NAMES.has(key.name)) ||
            (key.type === "Literal" &&
              typeof key.value === "string" &&
              EXEMPT_CONTAINER_NAMES.has(key.value))
          ) {
            return true;
          }
        }
        if (current.type === "VariableDeclarator") {
          if (
            current.id.type === "Identifier" &&
            EXEMPT_CONTAINER_NAMES.has(current.id.name)
          ) {
            return true;
          }
          // VariableDeclarator with non-exempt name short-circuits
          // (assigned to a non-exempt name).
          return false;
        }
        if (current.type === "AssignmentExpression") {
          if (
            current.left.type === "Identifier" &&
            EXEMPT_CONTAINER_NAMES.has(current.left.name)
          ) {
            return true;
          }
          return false;
        }
        current = current.parent;
      }
      return false;
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (!MODEL_ID_REGEX.test(node.value)) return;
        if (isInsideExemptContainer(node)) return;
        context.report({
          node,
          messageId: "hardcoded",
          data: { value: node.value },
        });
      },
      // Template literals like `claude-sonnet-4-6` (no ${}) - also catch
      TemplateLiteral(node) {
        if (node.expressions.length > 0) return; // dynamic; skip
        const value = node.quasis.map((q) => q.value.cooked).join("");
        if (!MODEL_ID_REGEX.test(value)) return;
        if (isInsideExemptContainer(node)) return;
        context.report({
          node,
          messageId: "hardcoded",
          data: { value },
        });
      },
    };
  },
};
