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

// === Opt-out comment enforcement (Phase 191C Commit 5a refinement) ===
//
// File-level: `// f9-allow-model-ids: <reason>` near the top of a file
// opts the entire file out of this check. <reason> must be at least
// MIN_OPTOUT_REASON_CHARS chars long so opt-outs can't be drive-by
// comments. Recommended reason categories (not enforced; soft guidance):
//   - SSOT-pin:           file pins canonical model IDs
//   - meta-test:          file IS a test of the lint rules themselves
//                         (e.g., RuleTester fixtures for this rule)
//   - contract-assertion: line asserts on a backend-controlled contract
//                         value (resolved Vision model, etc.)
//
// Mirrored from backend scripts/check_f9_patterns.py:_file_level_optout.
const MIN_OPTOUT_REASON_CHARS = 20;
const FILE_OPTOUT_SCAN_LINES = 30;
const FILE_OPTOUT_REGEX = /\/\/\s*f9-allow-model-ids:\s*(.*)$/;

function checkFileOptOut(sourceCode) {
  // Returns {valid: true} if a valid opt-out comment is present;
  // {valid: false, malformed: <node-loc>, reason: <string>} if a
  // comment is present but the reason is too short;
  // {valid: false} if no comment at all.
  const lines = sourceCode.lines.slice(0, FILE_OPTOUT_SCAN_LINES);
  for (let i = 0; i < lines.length; i++) {
    const m = FILE_OPTOUT_REGEX.exec(lines[i]);
    if (m === null) continue;
    const reason = m[1].trim();
    if (reason.length >= MIN_OPTOUT_REASON_CHARS) {
      return { valid: true };
    }
    return {
      valid: false,
      malformed: { line: i + 1, column: 1 },
      reason,
    };
  }
  return { valid: false };
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
      malformedOptOut:
        "Malformed `// f9-allow-model-ids` opt-out: reason is " +
        "{{reasonLength}} chars (need >= " +
        "{{minLength}}). Opt-outs must teach: state WHY this " +
        "file is exempt (e.g., SSOT-pin / meta-test / " +
        "contract-assertion + specifics). Drive-by opt-outs " +
        "defeat the rule's purpose.",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!isTestFile(filename)) return {}; // No-op outside test files

    // File-level opt-out check (Phase 191C Commit 5a refinement).
    const sourceCode = context.getSourceCode();
    const optOut = checkFileOptOut(sourceCode);
    if (optOut.valid) {
      // Whole file exempt — no visitors registered, rule is a no-op.
      return {};
    }
    if (optOut.malformed) {
      // Comment present but reason too short — emit a finding pointing
      // at the comment line + continue running the rule (the malformed
      // opt-out doesn't apply).
      context.report({
        loc: { start: optOut.malformed, end: optOut.malformed },
        messageId: "malformedOptOut",
        data: {
          reasonLength: optOut.reason.length,
          minLength: MIN_OPTOUT_REASON_CHARS,
        },
      });
    }

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
