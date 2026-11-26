// Phase 210B item 2 — the name under the icon, and in every permission
// sentence iOS shows, is Mekno.
//
// The code's own names (MotoDiagApi, the ios/MotoDiag folder, the
// scheme) are not words a person reads and stay as they are.

// Node built-ins via require with local types, as in
// __tests__/api/serverAddressSsot.test.ts: the app's tsconfig has no
// @types/node. The empty export makes this file a module, so these
// names do not clash with the other tests' copies.
export {};

declare const __dirname: string;

const fs = require('fs') as {readFileSync(p: string, e: string): string};
const path = require('path') as {join(...parts: string[]): string};

const INFO_PLIST = path.join(
  __dirname, '..', '..', 'ios', 'MotoDiag', 'Info.plist',
);

function plist(): string {
  return fs.readFileSync(INFO_PLIST, 'utf8');
}

/** The <string> right after <key>name</key>, or null. */
function stringFor(key: string): string | null {
  const m = plist().match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`),
  );
  return m === null ? null : m[1];
}

it('the display name under the icon is Mekno', () => {
  expect(stringFor('CFBundleDisplayName')).toBe('Mekno');
});

it('no Info.plist string begins "MotoDiag"', () => {
  expect(plist()).not.toMatch(/<string>MotoDiag/);
});

it.each([
  'NSBluetoothAlwaysUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSSpeechRecognitionUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
])('%s begins "Mekno"', (key) => {
  expect(stringFor(key)).toMatch(/^Mekno /);
});
