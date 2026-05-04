"use strict";

/**
 * F9 subspecies (i): closure-state capture in native callbacks.
 *
 * Function literals passed as values inside `*Ref.current.*` member
 * calls capture useState/useReducer values at REGISTRATION time, not
 * FIRE time. The fix pattern is useRef.
 *
 * See docs/patterns/f9-mock-vs-runtime-drift.md subspecies (i).
 *
 * Anti-example (Phase 191 Commit 3 closure-state bug):
 *
 *   const [state, dispatch] = useReducer(recordingTransition, initial);
 *   cameraRef.current?.startRecording({
 *     onRecordingFinished: video => {
 *       const wasInterrupted = state.kind === 'stopping';  // BUG
 *     },
 *   });
 *
 * Fix:
 *
 *   const interruptedRef = useRef(false);
 *   cameraRef.current?.startRecording({
 *     onRecordingFinished: video => {
 *       const wasInterrupted = interruptedRef.current;  // OK
 *     },
 *   });
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow function literals passed as values inside `*Ref.current.*` " +
        "member calls from capturing useState/useReducer state at " +
        "registration time. Use useRef pattern instead. See " +
        "docs/patterns/f9-mock-vs-runtime-drift.md subspecies (i).",
      recommended: true,
    },
    schema: [],
    messages: {
      closureCapture:
        "Callback registered with `{{receiverChain}}` captures " +
        "`{{stateName}}` at registration time, not fire time. The " +
        "callback will see the snapshot from when it was registered, " +
        "not the current value at fire time. Use `useRef` to read the " +
        "current value at fire time. See docs/patterns/" +
        "f9-mock-vs-runtime-drift.md subspecies (i).",
    },
  },

  create(context) {
    // Track useState/useReducer-declared bindings in scope.
    // Map: identifier name -> 'useState' | 'useReducer'
    const stateBindings = new Map();

    // Track useRef-declared bindings (for the .current exemption check).
    const refBindings = new Set();

    function isStateHook(callExpr) {
      // useState(...) or React.useState(...)
      const callee = callExpr.callee;
      if (callee.type === "Identifier") {
        return callee.name === "useState" || callee.name === "useReducer";
      }
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        return callee.property.name === "useState" || callee.property.name === "useReducer";
      }
      return false;
    }

    function isRefHook(callExpr) {
      const callee = callExpr.callee;
      if (callee.type === "Identifier") return callee.name === "useRef";
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        return callee.property.name === "useRef";
      }
      return false;
    }

    function recordStateBinding(varDecl) {
      // const [state, setState] = useState(...) -> state is the getter
      // const [state, dispatch] = useReducer(...) -> state is the getter
      // We only flag READS of `state`; setters/dispatch are fine.
      if (varDecl.id.type !== "ArrayPattern") return;
      const init = varDecl.init;
      if (!init || init.type !== "CallExpression") return;
      if (!isStateHook(init)) return;
      const elements = varDecl.id.elements;
      if (!elements[0] || elements[0].type !== "Identifier") return;
      const hookName =
        (init.callee.type === "Identifier" && init.callee.name) ||
        (init.callee.type === "MemberExpression" &&
          init.callee.property.type === "Identifier" &&
          init.callee.property.name) ||
        null;
      if (!hookName) return;
      stateBindings.set(elements[0].name, hookName);
    }

    function recordRefBinding(varDecl) {
      // const fooRef = useRef(...)
      if (varDecl.id.type !== "Identifier") return;
      const init = varDecl.init;
      if (!init || init.type !== "CallExpression") return;
      if (!isRefHook(init)) return;
      refBindings.add(varDecl.id.name);
    }

    // Receiver chain check: is `expr` a CallExpression whose callee
    // chain contains `.current.`? E.g.,
    //   cameraRef.current.startRecording  -> yes
    //   cameraRef.current?.startRecording  -> yes (with optional chaining)
    function callReceiverContainsRefCurrent(callExpr) {
      let node = callExpr.callee;
      // Unwrap a top-level ChainExpression (optional chaining).
      if (node && node.type === "ChainExpression") {
        node = node.expression;
      }
      while (
        node &&
        (node.type === "MemberExpression" ||
          node.type === "ChainExpression" ||
          node.type === "OptionalMemberExpression" ||
          node.type === "OptionalCallExpression" ||
          node.type === "CallExpression")
      ) {
        if (node.type === "ChainExpression") {
          node = node.expression;
          continue;
        }
        if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
          node = node.callee;
          continue;
        }
        // Look for `.current` along the chain
        if (
          node.property &&
          node.property.type === "Identifier" &&
          node.property.name === "current"
        ) {
          // The object before `.current` should be a Ref (we accept
          // any Identifier here; refBindings membership is a stronger
          // check but relaxed for fewer false negatives - heuristic).
          return true;
        }
        node = node.object;
      }
      return false;
    }

    // Build the receiver-chain text for diagnostic messages.
    function receiverChainText(callExpr) {
      const sourceCode = context.getSourceCode();
      return sourceCode.getText(callExpr.callee);
    }

    // Walk a function literal body and find Identifier reads whose
    // name is in stateBindings AND not preceded by `.current` (which
    // would mean it's a ref access, not a state read).
    function findStateCaptures(funcNode) {
      const captures = [];
      const visited = new WeakSet();

      function walk(node, parent) {
        if (!node || visited.has(node)) return;
        visited.add(node);

        // Skip nested function literals - their captures are their
        // own concern.
        if (
          (node.type === "FunctionDeclaration" ||
            node.type === "FunctionExpression" ||
            node.type === "ArrowFunctionExpression") &&
          node !== funcNode
        ) {
          return;
        }

        if (node.type === "Identifier" && stateBindings.has(node.name)) {
          // Check if this Identifier is the OBJECT of a MemberExpression
          // whose property is `current` - then it's a ref access pattern,
          // not a state read. (But state bindings shouldn't ever be
          // refs; this is defensive.)
          const isRefAccess =
            parent &&
            parent.type === "MemberExpression" &&
            parent.object === node &&
            parent.property.type === "Identifier" &&
            parent.property.name === "current";
          // Skip if this Identifier is the property of a MemberExpression
          // (i.e. obj.state, where state is just a property name, not
          // the captured binding).
          const isPropertyName =
            parent &&
            parent.type === "MemberExpression" &&
            parent.property === node &&
            !parent.computed;
          if (!isRefAccess && !isPropertyName) {
            captures.push(node);
          }
        }

        // Recurse children
        for (const key in node) {
          if (key === "parent" || key === "loc" || key === "range") continue;
          const value = node[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              if (child && typeof child === "object" && child.type) {
                walk(child, node);
              }
            }
          } else if (value && typeof value === "object" && value.type) {
            walk(value, node);
          }
        }
      }

      walk(funcNode.body, funcNode);
      return captures;
    }

    return {
      VariableDeclarator(node) {
        recordStateBinding(node);
        recordRefBinding(node);
      },

      CallExpression(node) {
        if (!callReceiverContainsRefCurrent(node)) return;
        // Look at arguments - find ObjectExpressions; for each
        // property whose value is a function literal, run the capture
        // check.
        for (const arg of node.arguments) {
          if (arg.type !== "ObjectExpression") continue;
          for (const prop of arg.properties) {
            if (prop.type !== "Property") continue;
            const value = prop.value;
            if (
              value.type !== "ArrowFunctionExpression" &&
              value.type !== "FunctionExpression"
            ) {
              continue;
            }
            const captures = findStateCaptures(value);
            for (const capture of captures) {
              context.report({
                node: capture,
                messageId: "closureCapture",
                data: {
                  receiverChain: receiverChainText(node),
                  stateName: capture.name,
                },
              });
            }
          }
        }
      },
    };
  },
};
