// Phase 203 — the regression guard for the whole conversion.
//
// 596 hex literals were removed from 35 files. Nothing else in the
// suite asserts a colour, so without this test the very next screen
// someone writes can quietly reintroduce a hardcoded palette that looks
// fine in light mode and is unreadable in dark.
//
// Scans source rather than rendering: the failure mode is a literal in
// a file, and a grep finds it in every code path including the ones no
// test renders.

// Node built-ins via require with local types: the React Native
// tsconfig has no @types/node, and pulling it in for one test would
// widen the type surface of the whole app.
declare const __dirname: string;

interface Dirent {
  name: string;
  isDirectory(): boolean;
}
const fs = require('fs') as {
  readdirSync(p: string, o: {withFileTypes: true}): Dirent[];
  readFileSync(p: string, e: string): string;
};
const path = require('path') as {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
};

const SRC = path.join(__dirname, '..', '..', 'src');

/** The one place colours are allowed to be literals. */
const ALLOWED_PREFIX = path.join(SRC, 'theme');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry: Dirent) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = walk(SRC).filter((f) => !f.startsWith(ALLOWED_PREFIX));

describe('no hardcoded colours outside src/theme', () => {
  it('finds source files to check (guards against a broken glob)', () => {
    // A test that scans nothing passes for the wrong reason.
    expect(files.length).toBeGreaterThan(30);
  });

  it.each([
    ['hex', /['"]#[0-9a-fA-F]{3,8}['"]/g],
    ['rgb / rgba', /['"]rgba?\([^)]*\)['"]/g],
    ['hsl', /['"]hsla?\([^)]*\)['"]/g],
  ])('has no %s literals', (_label, pattern) => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const matches = source.match(pattern);
      if (matches) {
        offenders.push(
          `${path.relative(SRC, file)}: ${[...new Set(matches)].join(', ')}`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('readability floors hold across the app', () => {
  it('declares no font size below 13', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const m of source.matchAll(/fontSize: (\d+)/g)) {
        if (Number(m[1]) < 13) {
          offenders.push(`${path.relative(SRC, file)}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('declares no interactive minHeight below 48', () => {
    // The roadmap's stated principle: "Big touch targets — 48dp
    // minimum for gloves / greasy hands." Five call sites broke it
    // before this phase.
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const m of source.matchAll(/minHeight: (\d+)/g)) {
        if (Number(m[1]) < 48) {
          offenders.push(`${path.relative(SRC, file)}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
