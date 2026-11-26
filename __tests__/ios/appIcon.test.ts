// Phase 210B item 1 — the app has an icon Apple accepts.
//
// Apple refuses an upload with no app icon, and refuses an icon with
// transparency. The icon set is Xcode's single-size form: one 1024 by
// 1024 picture, from which Xcode makes every size at build time. The
// picture is the website's M (K146), taken from the backend's 210B
// branch by its sha256 and not edited.

// Node built-ins via require with local types, as in
// __tests__/api/serverAddressSsot.test.ts: the app's tsconfig has no
// @types/node. The empty export makes this file a module, so these
// names do not clash with the other tests' copies.
export {};

declare const __dirname: string;

interface Buf {
  length: number;
  readUInt32BE(offset: number): number;
  [index: number]: number;
  subarray(start: number, end: number): Buf;
  toString(encoding: string): string;
}
const fs = require('fs') as {
  existsSync(p: string): boolean;
  readFileSync(p: string): Buf;
  readdirSync(p: string): string[];
};
const path = require('path') as {join(...parts: string[]): string};
const crypto = require('crypto') as {
  createHash(alg: string): {
    update(b: Buf): {digest(enc: string): string};
  };
};

const ICON_SET = path.join(
  __dirname, '..', '..', 'ios', 'MotoDiag', 'Images.xcassets',
  'AppIcon.appiconset',
);
const ICON_FILE = 'AppIcon-1024.png';
const ICON_SHA256 =
  '09d3db160b451cf2862ef8579f7489ff67f67bac02e798b6ffe5c5a94e1f3430';

interface IconImage {
  filename?: string;
  idiom?: string;
  platform?: string;
  size?: string;
}

function contents(): {images: IconImage[]} {
  return JSON.parse(
    fs.readFileSync(path.join(ICON_SET, 'Contents.json')).toString('utf8'),
  );
}

it('the icon set is the single-size form: one universal iOS 1024 image', () => {
  const images = contents().images;
  expect(images).toHaveLength(1);
  expect(images[0]).toEqual({
    filename: ICON_FILE,
    idiom: 'universal',
    platform: 'ios',
    size: '1024x1024',
  });
});

it('the icon set holds exactly one picture, the one Contents.json names', () => {
  const pictures = fs
    .readdirSync(ICON_SET)
    .filter((name) => name !== 'Contents.json');
  expect(pictures).toEqual([ICON_FILE]);
  expect(fs.existsSync(path.join(ICON_SET, ICON_FILE))).toBe(true);
});

it('the picture is a 1024 by 1024 PNG with no alpha channel (colour type 2)', () => {
  const png = fs.readFileSync(path.join(ICON_SET, ICON_FILE));
  // PNG signature, then the IHDR chunk: length (4), "IHDR" (4),
  // width (4), height (4), bit depth (1), colour type (1).
  expect(Array.from({length: 8}, (_, i) => png[i])).toEqual(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  expect(png.subarray(12, 16).toString('latin1')).toBe('IHDR');
  expect(png.readUInt32BE(16)).toBe(1024);
  expect(png.readUInt32BE(20)).toBe(1024);
  expect(png[25]).toBe(2);
});

it("the picture is K146's, by its sha256", () => {
  const png = fs.readFileSync(path.join(ICON_SET, ICON_FILE));
  expect(crypto.createHash('sha256').update(png).digest('hex')).toBe(
    ICON_SHA256,
  );
});
