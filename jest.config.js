module.exports = {
  preset: '@react-native/jest-preset',
  // Phase 191C Commit 3 (2026-05-04): exclude eslint-plugin-motodiag/
  // from jest collection. The plugin uses ESLint's RuleTester (its own
  // discipline; see eslint-plugin-motodiag/rules/__tests__/*.test.js)
  // which jest tries to collect as zero-test files and fails. The
  // plugin's tests are runnable via `node <path>/<rule>.test.js`
  // directly (RuleTester throws on case failure).
  // Phase 196 (2026-05-17): FakeObdProvider.ts is a test DOUBLE
  // imported by the obd test suites — not a suite itself. Exclude it
  // from collection so Jest doesn't fail it as a zero-test file.
  // (testPathIgnorePatterns affects suite discovery only — the obd
  // suites can still import it.)
  testPathIgnorePatterns: [
    '/node_modules/',
    '/eslint-plugin-motodiag/',
    '/__tests__/obd/FakeObdProvider\\.ts$',
  ],
};
