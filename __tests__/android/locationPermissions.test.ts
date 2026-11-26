// Phase 210C item 3 — Android matches iOS on location (K148).
//
// The app needs a location permission only for Bluetooth scans on
// Android 11 and older (API 30). react-native-ble-plx declares
// ACCESS_COARSE_LOCATION and ACCESS_FINE_LOCATION with no limit, and
// react-native-bluetooth-classic declares ACCESS_FINE_LOCATION with no
// limit, so without tools:node="replace" the merged manifest would ask
// for location on Android 12 and up too. No machine here builds
// Android, so the app's own manifest is the check.

export {};

declare const __dirname: string;

const fs = require('fs') as {readFileSync(p: string, e: string): string};
const path = require('path') as {join(...parts: string[]): string};

const MANIFEST = path.join(
  __dirname, '..', '..', 'android', 'app', 'src', 'main',
  'AndroidManifest.xml',
);

const manifest = fs.readFileSync(MANIFEST, 'utf8');

function permission(name: string): string[] {
  const re = new RegExp(
    `<uses-permission\\s[^>]*android:name="android\\.permission\\.${name}"[^>]*/>`,
    'g',
  );
  return manifest.match(re) ?? [];
}

it('declares the tools namespace on the manifest element', () => {
  expect(manifest).toMatch(
    /<manifest\s[^>]*xmlns:tools="http:\/\/schemas\.android\.com\/tools"/,
  );
});

it.each(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'])(
  '%s is declared once, capped at Android 11, replacing the libraries\' own',
  (name) => {
    const decls = permission(name);
    expect(decls).toHaveLength(1);
    expect(decls[0]).toContain('android:maxSdkVersion="30"');
    expect(decls[0]).toContain('tools:node="replace"');
  },
);

it('BLUETOOTH_SCAN keeps neverForLocation', () => {
  const decls = permission('BLUETOOTH_SCAN');
  expect(decls).toHaveLength(1);
  expect(decls[0]).toContain('android:usesPermissionFlags="neverForLocation"');
});
