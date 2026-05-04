module.exports = {
  root: true,
  extends: '@react-native',
  plugins: ['motodiag'],
  rules: {
    // F9 mock-vs-runtime-drift mitigation rules.
    // Severity is `warn` per Phase 191C plan v1.0.1 Correction B3 — Commit 5
    // bumps to `error` after a clean-baseline run on `main`.
    // See docs/patterns/f9-mock-vs-runtime-drift.md.
    'motodiag/no-closure-state-capture-in-native-callback': 'warn',
    'motodiag/no-hardcoded-model-ids-in-tests': 'warn',
    'motodiag/no-loose-typed-async-mock-returns': 'warn',
  },
};
