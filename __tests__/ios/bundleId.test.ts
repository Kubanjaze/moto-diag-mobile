// Phase 210B item 5 — the iOS app's bundle ID is com.getmekno.app (K147).
//
// The App Store Connect record for Mekno takes this ID before its first
// upload. Android's applicationId is not this phase's and stays as it is.

// Node built-ins via require with local types, as in
// __tests__/api/serverAddressSsot.test.ts: the app's tsconfig has no
// @types/node. The empty export makes this file a module, so these
// names do not clash with the other tests' copies.
export {};

declare const __dirname: string;

const fs = require('fs') as {readFileSync(p: string, e: string): string};
const path = require('path') as {join(...parts: string[]): string};

const PBXPROJ = path.join(
  __dirname, '..', '..', 'ios', 'MotoDiag.xcodeproj', 'project.pbxproj',
);

function project(): string {
  return fs.readFileSync(PBXPROJ, 'utf8');
}

it('both PRODUCT_BUNDLE_IDENTIFIER lines say com.getmekno.app', () => {
  const ids = Array.from(
    project().matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
    (m) => m[1],
  );
  expect(ids).toEqual(['com.getmekno.app', 'com.getmekno.app']);
});

it('the old ID is gone from the project file', () => {
  expect(project()).not.toContain('com.bandithero.motodiag');
});
