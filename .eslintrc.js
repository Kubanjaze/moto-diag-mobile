module.exports = {
  root: true,
  extends: '@react-native',
  plugins: ['motodiag'],
  rules: {
    // F9 mock-vs-runtime-drift mitigation rules.
    // Severity bumped warn → error at Phase 191C Commit 5b after the
    // clean-baseline cleanup pass (5a) reduced findings to 0 on master.
    // Phase 191D Commit 3 added the generalized SSOT-constants rule at
    // error severity from day one (the narrow rule above is now a
    // stub-redirect to the generalized rule for back-compat through
    // Phase 200+).
    // See docs/patterns/f9-mock-vs-runtime-drift.md.
    'motodiag/no-closure-state-capture-in-native-callback': 'error',
    'motodiag/no-hardcoded-model-ids-in-tests': 'error',
    'motodiag/no-hardcoded-ssot-constants-in-tests': 'error',
    'motodiag/no-loose-typed-async-mock-returns': 'error',
  },
};
