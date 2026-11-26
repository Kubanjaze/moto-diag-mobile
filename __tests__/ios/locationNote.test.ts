// Phase 210C item 2 — Apple's location note on build 1 (K148).
//
// Apple flagged build 1 with ITMS-90683: no NSLocationWhenInUseUsageDescription.
// The app never asks for a location; the request came from
// react-native-vision-camera's location code, which its podspec builds
// unless the Podfile sets $VCEnableLocation = false. The fix removes the
// cause; no location purpose string is added, because the app does not
// use location.

// Node built-ins via require with local types, as in
// __tests__/ios/bundleId.test.ts: the app's tsconfig has no @types/node.
export {};

declare const __dirname: string;

const fs = require('fs') as {
  readFileSync(p: string, e?: string): string & {length: number};
};
const path = require('path') as {join(...parts: string[]): string};
const crypto = require('crypto') as {
  createHash(alg: string): {
    update(data: unknown): {digest(enc: string): string};
  };
};

const IOS = path.join(__dirname, '..', '..', 'ios');
const PODFILE = path.join(IOS, 'Podfile');
const LOCK = path.join(IOS, 'Podfile.lock');
const INFO_PLIST = path.join(IOS, 'MotoDiag', 'Info.plist');

describe('ios/Podfile', () => {
  const podfile = fs.readFileSync(PODFILE, 'utf8');

  it('sets $VCEnableLocation = false', () => {
    expect(podfile).toMatch(/^\$VCEnableLocation = false\s*$/m);
  });

  it('sets it above the line that resolves react_native_pods.rb', () => {
    const flag = podfile.indexOf('$VCEnableLocation = false');
    const resolve = podfile.indexOf('react_native_pods.rb');
    expect(flag).toBeGreaterThanOrEqual(0);
    expect(resolve).toBeGreaterThan(flag);
  });
});

describe('ios/Podfile.lock', () => {
  const lock = fs.readFileSync(LOCK, 'utf8');

  it("records VisionCamera's checksum with location off", () => {
    expect(lock).toMatch(
      /^ {2}VisionCamera: b51af005669c6642dd1b4fca434eda4c1778de87$/m,
    );
  });

  it('records the SHA-1 of ios/Podfile as PODFILE CHECKSUM', () => {
    const bytes = (require('fs') as {readFileSync(p: string): unknown})
      .readFileSync(PODFILE);
    const sha1 = crypto.createHash('sha1').update(bytes).digest('hex');
    const m = lock.match(/^PODFILE CHECKSUM: ([0-9a-f]{40})$/m);
    expect(m?.[1]).toBe(sha1);
  });
});

describe('ios/MotoDiag/Info.plist', () => {
  it('has no key beginning NSLocation', () => {
    const plist = fs.readFileSync(INFO_PLIST, 'utf8');
    expect(plist).not.toMatch(/<key>NSLocation/);
  });
});
