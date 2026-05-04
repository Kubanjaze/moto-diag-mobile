"use strict";

const { RuleTester } = require("eslint");
const rule = require("../no-closure-state-capture-in-native-callback");

// ESLint 8 legacy RuleTester config — top-level parserOptions, parser
// resolved via require.resolve(...). Phase 191C Commit 3 fix-cycle:
// Builder-C wrote flat-config-style `languageOptions` which ESLint 8
// rejects with "Unexpected top-level property 'languageOptions'".
const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run("no-closure-state-capture-in-native-callback", rule, {
  valid: [
    // Valid: callback uses useRef.current - clean
    {
      code: `
        function Component() {
          const ref = useRef(false);
          const cameraRef = useRef(null);
          cameraRef.current?.startRecording({
            onRecordingFinished: video => {
              const wasInterrupted = ref.current;
            },
          });
        }
      `,
    },
    // Valid: no callback at all
    {
      code: `
        function Component() {
          const cameraRef = useRef(null);
          cameraRef.current?.stopRecording();
        }
      `,
    },
    // Valid: callback doesn't reference state - fires the hook but reads nothing
    {
      code: `
        function Component() {
          const [state, setState] = useState(0);
          const cameraRef = useRef(null);
          cameraRef.current?.startRecording({
            onRecordingFinished: video => {
              console.log("done");
            },
          });
        }
      `,
    },
    // Valid: setState is called inside the callback (writes are fine; only reads are flagged)
    {
      code: `
        function Component() {
          const [count, setCount] = useState(0);
          const cameraRef = useRef(null);
          cameraRef.current?.startRecording({
            onRecordingFinished: video => {
              setCount(prev => prev + 1);
            },
          });
        }
      `,
    },
  ],

  invalid: [
    // The Phase 191 Commit 3 anti-example
    {
      code: `
        function Component() {
          const [state, dispatch] = useReducer(reducer, initial);
          const cameraRef = useRef(null);
          cameraRef.current?.startRecording({
            onRecordingFinished: video => {
              const wasInterrupted = state.kind === 'stopping';
            },
          });
        }
      `,
      errors: [{ messageId: "closureCapture" }],
    },
    // useState getter captured in callback inside startRecording
    {
      code: `
        function Component() {
          const [count, setCount] = useState(0);
          const cameraRef = useRef(null);
          cameraRef.current?.startRecording({
            onRecordingFinished: video => {
              const snapshot = count;
            },
          });
        }
      `,
      errors: [{ messageId: "closureCapture" }],
    },
  ],
});

console.log("PASS: no-closure-state-capture-in-native-callback");
