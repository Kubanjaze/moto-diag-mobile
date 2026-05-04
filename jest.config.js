module.exports = {
  preset: '@react-native/jest-preset',
  // Phase 191C Commit 3 (2026-05-04): exclude eslint-plugin-motodiag/
  // from jest collection. The plugin uses ESLint's RuleTester (its own
  // discipline; see eslint-plugin-motodiag/rules/__tests__/*.test.js)
  // which jest tries to collect as zero-test files and fails. The
  // plugin's tests are runnable via `node <path>/<rule>.test.js`
  // directly (RuleTester throws on case failure).
  testPathIgnorePatterns: ['/node_modules/', '/eslint-plugin-motodiag/'],
};
