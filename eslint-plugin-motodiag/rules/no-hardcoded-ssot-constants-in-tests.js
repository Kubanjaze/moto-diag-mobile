"use strict";

/**
 * F9 subspecies (ii) GENERALIZED: hardcoded SSOT-managed constant
 * literals in test files (Phase 191D).
 *
 * Generalization of Phase 191C's narrow no-hardcoded-model-ids-in-tests
 * rule. Where the narrow rule scanned only Claude model ID strings, this
 * rule loads a registry (eslint-plugin-motodiag/ssot-constants.json) of
 * any constant whose canonical value lives in a single source-of-truth
 * module — and flags test files that hardcode the literal value next to
 * the registry name (or import the source module). Tests that drift in
 * either direction (literal-pin without import, or import without pin)
 * still fail loudly the moment production diverges.
 *
 * Backend twin: scripts/check_f9_patterns.py --check-ssot-constants
 * (sibling repo). Heuristic + opt-out grammar MUST stay in sync.
 *
 * See docs/patterns/f9-mock-vs-runtime-drift.md subspecies (ii)
 * generalized.
 *
 * Heuristic (mirrors backend post-fix-cycle behavior baked in from
 * day one for mobile — see Commit 2 lessons learned):
 *
 *   1. Load JSON registry at rule-init. Skip role: "default" entries
 *      (registered for documentation only).
 *
 *   2. For each role: "contract" entry: read live_value from registry
 *      (NOT via runtime require() — the JSON ships the production
 *      value alongside the registry name; bumping the production
 *      constant + bumping live_value in the registry happen in the
 *      same commit, kept honest by the regression suite).
 *
 *   3. Visit Literal nodes in __tests__/**\/*.{ts,tsx,js,jsx} only.
 *
 *   4. NOISE_LITERALS filter: exclude null / undefined / true / false /
 *      0 / "" from match consideration. Reasoning identical to backend
 *      Commit 2 fix-cycle: these are too universally common to
 *      attribute to a specific SSOT entry. expect(x).toBe(0) shouldn't
 *      flag because some registry entry happens to have the value 0.
 *
 *   5. For each candidate: heuristic narrowing —
 *        * source-module imported anywhere in the file (exact OR
 *          sub-module match — DO NOT match the reverse direction; that
 *          treats parent-package imports as matching every child-module
 *          entry, which produced the 311-finding swamp on the first
 *          backend Builder-B run).
 *        OR
 *        * registry name appears textually within
 *          IDENTIFIER_PROXIMITY_LINES of the offending literal.
 *
 *   6. Honor file-level opt-outs:
 *        // f9-allow-ssot-constants: <reason>     (>=20 chars)
 *        // f9-allow-not-ssot:       <reason>     (>=20 chars)
 *        // f9-allow-model-ids:      <reason>     (legacy back-compat)
 *
 *   7. Honor per-line opt-outs:
 *        // f9-noqa: ssot-pin <reason>                          (>=20)
 *        // f9-noqa: ssot-pin contract-pin: <reason>            (>=20)
 *
 *      Both subjects to the 20-char floor measured AFTER the
 *      contract-pin: keyword (so the keyword itself doesn't pad out a
 *      too-short reason).
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------
// Config
// ---------------------------------------------------------------

const REGISTRY_RELATIVE_PATH = "../ssot-constants.json";

// Mirrors backend MIN_OPTOUT_REASON_CHARS (Phase 191C 5a refinement).
const MIN_OPTOUT_REASON_CHARS = 20;
const FILE_OPTOUT_SCAN_LINES = 30;

// Mirrors backend IDENTIFIER_PROXIMITY_LINES.
const IDENTIFIER_PROXIMITY_LINES = 3;

// Mirrors backend NOISE_LITERALS (Phase 191D Commit 2 fix-cycle).
// undefined is JS-specific (no Python equivalent); null / true / false /
// 0 / "" are direct mirrors of None / True / False / 0 / "".
//
// Stored as a Set for O(1) membership; we check membership by value
// equality on string / number primitives. Booleans are filtered before
// numeric matching (a JS literal `true` has typeof === "boolean", we
// drop those entirely from candidate matching).
const NOISE_NUMBERS = new Set([0]);
const NOISE_STRINGS = new Set([""]);

// Recognized opt-out reason categories — matches backend doc'd
// vocabulary (SSOT-pin, meta-test, contract-assertion, contract-pin).
// Soft guidance only; the rule recognizes the contract-pin: subcategory
// in per-line opt-outs by stripping the prefix before length-checking.

// ---------------------------------------------------------------
// Registry load (once per ESLint run, cached)
// ---------------------------------------------------------------

let _registryCache = null;
let _registryError = null;
let _deprecationWarned = false; // shared with stub-redirect rule

function loadRegistry() {
  if (_registryCache !== null || _registryError !== null) {
    return { registry: _registryCache, error: _registryError };
  }
  const registryPath = path.join(__dirname, REGISTRY_RELATIVE_PATH);
  try {
    const raw = fs.readFileSync(registryPath, "utf8");
    const parsed = JSON.parse(raw);
    const constants = (parsed.constants || []).filter(
      (c) => c.role === "contract"
    );
    _registryCache = constants;
    return { registry: _registryCache, error: null };
  } catch (err) {
    _registryError = `Failed to load SSOT constants registry at ${registryPath}: ${err.message}`;
    return { registry: null, error: _registryError };
  }
}

// Test seam: allow tests to inject an in-memory registry for fixture
// scenarios (avoids writing temp JSON files for every RuleTester case).
// Setting to null restores normal disk-load behavior.
function _setRegistryForTests(registryArrayOrNull) {
  if (registryArrayOrNull === null) {
    _registryCache = null;
    _registryError = null;
    return;
  }
  _registryCache = registryArrayOrNull.filter((c) => c.role === "contract");
  _registryError = null;
}

// ---------------------------------------------------------------
// File-scope helpers
// ---------------------------------------------------------------

function isTestFile(filename) {
  // __tests__/**/*.{ts,tsx,js,jsx} OR *.test.{ts,tsx,js,jsx}
  return (
    /[\\/]__tests__[\\/]/.test(filename) ||
    /\.test\.(ts|tsx|js|jsx)$/.test(filename)
  );
}

// Recognize all three file-level opt-out shapes:
//   // f9-allow-ssot-constants: <reason>
//   // f9-allow-not-ssot: <reason>
//   // f9-allow-model-ids: <reason>   (legacy; honored for back-compat)
const FILE_OPTOUT_REGEX =
  /\/\/\s*f9-allow-(ssot-constants|not-ssot|model-ids):\s*(.*)$/;

function checkFileOptOut(sourceCode) {
  const lines = sourceCode.lines.slice(0, FILE_OPTOUT_SCAN_LINES);
  for (let i = 0; i < lines.length; i++) {
    const m = FILE_OPTOUT_REGEX.exec(lines[i]);
    if (m === null) continue;
    const reason = m[2].trim();
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

// Per-line opt-out:
//   // f9-noqa: ssot-pin <reason>
//   // f9-noqa: ssot-pin contract-pin: <reason>   (Phase 191D subcat)
//
// Returns:
//   { ok: true }                  — valid opt-out present
//   { ok: false, malformed: ... } — opt-out present but reason too short
//   { ok: false }                 — no opt-out comment on this line
const PER_LINE_OPTOUT_REGEX = /\/\/\s*f9-noqa:\s*ssot-pin\b\s*(.*)$/;

function checkPerLineOptOut(sourceLines, lineno) {
  if (lineno < 1 || lineno > sourceLines.length) return { ok: false };
  const line = sourceLines[lineno - 1];
  const m = PER_LINE_OPTOUT_REGEX.exec(line);
  if (m === null) return { ok: false };
  let reason = m[1].trim();
  // Strip the contract-pin: subcategory prefix BEFORE length-checking
  // (mirrors backend _ssot_per_line_optout) — the keyword itself
  // shouldn't pad a too-short reason.
  if (reason.toLowerCase().startsWith("contract-pin:")) {
    reason = reason.slice("contract-pin:".length).trim();
  }
  if (reason.length >= MIN_OPTOUT_REASON_CHARS) {
    return { ok: true };
  }
  return {
    ok: false,
    malformed: {
      lineno,
      reasonLength: reason.length,
    },
  };
}

// ---------------------------------------------------------------
// Imports inspection
// ---------------------------------------------------------------

// Scan the AST for all imported module specifiers (string literals in
// ImportDeclaration nodes + require('...') calls).
function collectImportedModules(programNode) {
  const imported = new Set();
  for (const stmt of programNode.body) {
    if (stmt.type === "ImportDeclaration") {
      if (stmt.source && typeof stmt.source.value === "string") {
        imported.add(stmt.source.value);
      }
    }
    // Handle const x = require('...')
    if (stmt.type === "VariableDeclaration") {
      for (const decl of stmt.declarations) {
        const init = decl.init;
        if (
          init &&
          init.type === "CallExpression" &&
          init.callee.type === "Identifier" &&
          init.callee.name === "require" &&
          init.arguments.length === 1 &&
          init.arguments[0].type === "Literal" &&
          typeof init.arguments[0].value === "string"
        ) {
          imported.add(init.arguments[0].value);
        }
      }
    }
  }
  return imported;
}

// Match an entry's source_module against the file's imported modules.
// Allow exact OR sub-module match (registry source_module === imported
// OR imported.startsWith(source_module + "/")).
//
// DO NOT match the reverse direction (source_module.startsWith(imported
// + "/")). That treats `import {X} from '../../src/api'` as importing
// every `../../src/api/*` registry entry — the false-positive shape
// that produced the 311-finding swamp on the first backend Builder-B
// run.
function isSourceModuleImported(sourceModule, importedSet) {
  for (const imp of importedSet) {
    // Strip leading relative path (../, ../../, etc.) for comparison —
    // the registry stores source_module as a project-relative path
    // (e.g., "src/hooks/useDTCSearch"); imports use relative paths
    // (e.g., "../../src/hooks/useDTCSearch" or "../hooks/useDTCSearch").
    // We try both raw and normalized forms.
    if (imp === sourceModule) return true;
    if (imp.startsWith(sourceModule + "/")) return true;
    // Trailing path-segment match: any import whose path ENDS with
    // ("/" + source_module) or equals the source_module's basename
    // counts as an import of that module. Catches ../hooks/useDTCSearch
    // matching src/hooks/useDTCSearch.
    if (imp.endsWith("/" + sourceModule)) return true;
    // Sub-module match through the trailing form: `../foo` import vs
    // `src/foo/sub` registry entry.
    const normalizedImp = imp.replace(/^(\.\.\/)+/, "");
    if (normalizedImp === sourceModule) return true;
    if (normalizedImp.startsWith(sourceModule + "/")) return true;
    // Reverse-direction NOT honored on purpose (see comment above).
  }
  return false;
}

// Identifier-nearby check: does any identifier in `identifiers` appear
// textually within IDENTIFIER_PROXIMITY_LINES of `lineno`?
function identifierNearby(sourceLines, lineno, identifiers) {
  const start = Math.max(0, lineno - 1 - IDENTIFIER_PROXIMITY_LINES);
  const stop = Math.min(sourceLines.length, lineno + IDENTIFIER_PROXIMITY_LINES);
  const haystack = sourceLines.slice(start, stop).join("\n");
  for (const ident of identifiers) {
    if (!ident) continue;
    // Word-boundary regex; escape special regex chars in ident.
    const escaped = ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("\\b" + escaped + "\\b");
    if (pattern.test(haystack)) return true;
  }
  return false;
}

// ---------------------------------------------------------------
// Rule definition
// ---------------------------------------------------------------

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded SSOT-managed constant literal values in " +
        "test files. Enforces that tests import the canonical constant " +
        "from its source module rather than literal-pinning a duplicate " +
        "value that drifts silently when production updates. See " +
        "docs/patterns/f9-mock-vs-runtime-drift.md subspecies (ii) " +
        "generalized.",
      recommended: true,
    },
    schema: [],
    messages: {
      hardcoded:
        "Literal {{value}} matches the live production value of " +
        "{{sourceModule}}.{{name}}. Import the constant from its " +
        "source module or opt out with `// f9-noqa: ssot-pin <reason>` " +
        "(or `// f9-noqa: ssot-pin contract-pin: <reason>` for " +
        "intentional two-source assertion design).",
      malformedFileOptOut:
        "Malformed `// f9-allow-{ssot-constants,not-ssot,model-ids}` " +
        "opt-out: reason is {{reasonLength}} chars (need >= " +
        "{{minLength}}). Opt-outs must teach: state WHY this file is " +
        "exempt (e.g., SSOT-pin / meta-test / contract-assertion + " +
        "specifics). Drive-by opt-outs defeat the rule's purpose.",
      malformedOptOut:
        "Malformed `// f9-noqa: ssot-pin` opt-out: reason is " +
        "{{reasonLength}} chars (need >= {{minLength}}). Recognized " +
        "subcategories: ssot-pin <reason> / ssot-pin contract-pin: " +
        "<reason>. Opt-outs must teach: state WHY the literal is " +
        "intentional.",
      registryError:
        "SSOT constants registry load failed: {{message}}. The lint " +
        "rule cannot enforce literal-pin drift until the registry " +
        "loads cleanly.",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!isTestFile(filename)) return {};

    const { registry, error } = loadRegistry();
    if (error !== null) {
      // Emit a single registry-error finding on the file so CI surfaces
      // the misconfiguration rather than silently passing.
      return {
        Program(node) {
          context.report({
            node,
            messageId: "registryError",
            data: { message: error },
          });
        },
      };
    }
    if (!registry || registry.length === 0) {
      // Empty registry → rule is a no-op. Mirrors backend "no entries
      // matched" path; ships safely on a fresh clone before any
      // entries are registered.
      return {};
    }

    const sourceCode = context.getSourceCode();

    // File-level opt-out check.
    const optOut = checkFileOptOut(sourceCode);
    if (optOut.valid) {
      return {};
    }

    // Will be populated when Program is visited (we need imports first
    // to make the per-Literal heuristic decision).
    let importedModules = new Set();
    let programVisited = false;
    const sourceLines = sourceCode.lines;

    function evaluateLiteral(node) {
      if (!programVisited) return; // imports not yet collected
      const value = node.value;
      // Skip booleans (typeof === "boolean") entirely.
      if (typeof value === "boolean") return;
      // Skip null / undefined.
      if (value === null) return;
      // Skip noise literals.
      if (typeof value === "number" && NOISE_NUMBERS.has(value)) return;
      if (typeof value === "string" && NOISE_STRINGS.has(value)) return;

      for (const entry of registry) {
        // Type-coerce: registry live_value is JSON-typed, so a number
        // in the JSON is JS number, a string in JSON is JS string.
        if (entry.live_value !== value) continue;

        // Heuristic narrowing — identifier-nearby (registry name only,
        // following backend post-fix-cycle: dict keys would swamp the
        // signal) OR source-module imported.
        const identifiers = new Set([entry.name]);
        const nearby = identifierNearby(sourceLines, node.loc.start.line, identifiers);
        const importMatch = isSourceModuleImported(
          entry.source_module,
          importedModules
        );
        if (!nearby && !importMatch) continue;

        // Per-line opt-out check.
        const perLine = checkPerLineOptOut(sourceLines, node.loc.start.line);
        if (perLine.ok) {
          // Valid opt-out — don't fire on this entry.
          break;
        }
        if (perLine.malformed) {
          context.report({
            node,
            messageId: "malformedOptOut",
            data: {
              reasonLength: perLine.malformed.reasonLength,
              minLength: MIN_OPTOUT_REASON_CHARS,
            },
          });
          // Fall through and ALSO report the underlying ssot-pin so the
          // malformed comment doesn't act as a free pass. Same posture
          // as backend.
        }

        context.report({
          node,
          messageId: "hardcoded",
          data: {
            value: typeof value === "string" ? `'${value}'` : String(value),
            sourceModule: entry.source_module,
            name: entry.name,
          },
        });
        // First entry that survives narrowing wins — break to avoid
        // firing N times on a literal that happens to match multiple
        // registry entries.
        break;
      }
    }

    return {
      Program(node) {
        importedModules = collectImportedModules(node);
        programVisited = true;

        // Emit malformed file opt-out finding (if applicable) at the
        // program level so it's anchored to a real source location.
        if (optOut.malformed) {
          context.report({
            loc: { start: optOut.malformed, end: optOut.malformed },
            messageId: "malformedFileOptOut",
            data: {
              reasonLength: optOut.reason.length,
              minLength: MIN_OPTOUT_REASON_CHARS,
            },
          });
        }
      },
      Literal: evaluateLiteral,
    };
  },
};

// Test seam — exposed only for unit tests (RuleTester). Production
// callers ignore.
module.exports._setRegistryForTests = _setRegistryForTests;
module.exports._resetDeprecationWarning = function () {
  _deprecationWarned = false;
};
module.exports._setDeprecationWarned = function () {
  _deprecationWarned = true;
};
module.exports._isDeprecationWarned = function () {
  return _deprecationWarned;
};
