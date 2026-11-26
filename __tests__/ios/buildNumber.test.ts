// Phase 210C item 4 — build 2 (K148). Build 1 is on TestFlight; the next
// upload needs the next build number. The version shown to people stays
// 1.0.

export {};

declare const __dirname: string;

const fs = require('fs') as {readFileSync(p: string, e: string): string};
const path = require('path') as {join(...parts: string[]): string};

const PBXPROJ = path.join(
  __dirname, '..', '..', 'ios', 'MotoDiag.xcodeproj', 'project.pbxproj',
);

function values(key: string): string[] {
  const text = fs.readFileSync(PBXPROJ, 'utf8');
  return Array.from(
    text.matchAll(new RegExp(`\\b${key} = ([^;]+);`, 'g')),
    (m) => m[1],
  );
}

it('CURRENT_PROJECT_VERSION is 2 in both build configurations', () => {
  expect(values('CURRENT_PROJECT_VERSION')).toEqual(['2', '2']);
});

it('MARKETING_VERSION stays 1.0 in both build configurations', () => {
  expect(values('MARKETING_VERSION')).toEqual(['1.0', '1.0']);
});
