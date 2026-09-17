// Phase 209B item 1 — one place decides which server the app talks to.
//
// Before this phase an emulator address sat in client.ts as a string
// literal, and a second copy of the resolution logic lived in the audio
// hook. Either one alone could send a request somewhere Settings never
// chose. Two rules keep that from coming back:
//
//   1. No string in src/ holds a server address, and none builds one
//      from a hardcoded scheme (`http://${ip}`). Hosts under the
//      documentation-reserved names (example.com, *.test — RFC 2606/6761)
//      are exempt: they are placeholders, and can never be a server.
//   2. Only src/api/serverUrl.ts reads `API_BASE_URL`.
//
// Both look at code only, through the TypeScript parser. A URL in a
// comment is a mention, not a use, and must not count either way.

import ts from 'typescript';

// Node built-ins via require with local types, as in
// __tests__/theme/noHardcodedColors.test.ts: the app's tsconfig has no
// @types/node.
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
  resolve(...parts: string[]): string;
  relative(from: string, to: string): string;
};

const SRC = path.resolve(__dirname, '../../src');
const RESOLVER = path.join(SRC, 'api', 'serverUrl.ts');

/** Non-server URLs that may appear in code, with the reason. Empty today. */
const ALLOWED_URL_LITERALS: Record<string, string> = {};

const URL_HOST = /https?:\/\/([a-z0-9][a-z0-9.-]*)/gi;
const SCHEME_AT_END = /https?:\/\/$/i;

function isReservedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    /(^|\.)example\.(com|net|org)$/.test(h) ||
    /\.(test|example|invalid)$/.test(h)
  );
}

function holdsServerAddress(node: ts.Node & {text: string}): boolean {
  if (node.text in ALLOWED_URL_LITERALS) {
    return false;
  }
  const hosts = [...node.text.matchAll(URL_HOST)].map((m) => m[1]);
  if (hosts.some((host) => !isReservedHost(host))) {
    return true;
  }
  // `http://${ip}:8000` — the address is assembled, the scheme is fixed.
  return (
    (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) &&
    SCHEME_AT_END.test(node.text)
  );
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry: Dirent) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

interface Finding {
  line: number;
  text: string;
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function urlLiterals(fileName: string, text: string): Finding[] {
  const sf = parse(fileName, text);
  const found: Finding[] = [];
  walk(sf, (node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (holdsServerAddress(node)) {
        found.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          text: node.text,
        });
      }
    }
  });
  return found;
}

function apiBaseUrlReads(fileName: string, text: string): Finding[] {
  const sf = parse(fileName, text);
  const found: Finding[] = [];
  walk(sf, (node) => {
    const named =
      (ts.isIdentifier(node) && node.text === 'API_BASE_URL') ||
      (ts.isStringLiteralLike(node) && node.text === 'API_BASE_URL');
    if (named) {
      found.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        text: node.getText(sf),
      });
    }
  });
  return found;
}

function report(perFile: Array<[string, Finding[]]>): string {
  return perFile
    .filter(([, f]) => f.length > 0)
    .flatMap(([file, f]) =>
      f.map((x) => `${path.relative(SRC, file)}:${x.line}  ${x.text}`),
    )
    .join('\n');
}

describe('the server address has one source', () => {
  const files = sourceFiles(SRC);

  it('finds the source tree', () => {
    expect(files).toContain(RESOLVER);
    expect(files.length).toBeGreaterThan(50);
  });

  it('holds no server address in code anywhere in src/', () => {
    const perFile = files.map(
      (f): [string, Finding[]] => [f, urlLiterals(f, fs.readFileSync(f, 'utf8'))],
    );
    expect(report(perFile)).toBe('');
  });

  it('reads API_BASE_URL only in serverUrl.ts', () => {
    const perFile = files
      .filter((f) => f !== RESOLVER)
      .map((f): [string, Finding[]] => [
        f,
        apiBaseUrlReads(f, fs.readFileSync(f, 'utf8')),
      ]);
    expect(report(perFile)).toBe('');
  });

  it('does read it in serverUrl.ts (otherwise rule 2 guards nothing)', () => {
    expect(
      apiBaseUrlReads(RESOLVER, fs.readFileSync(RESOLVER, 'utf8')).length,
    ).toBeGreaterThan(0);
  });
});

describe('the scanner is not fooled', () => {
  it('catches a URL literal', () => {
    expect(urlLiterals('a.ts', "export const U = 'http://10.0.2.2:8000';")).toHaveLength(1);
  });

  it('catches one inside a template literal', () => {
    expect(
      urlLiterals('a.ts', 'const u = `https://${host}/v1`; const v = `x${a}http://b`;'),
    ).toHaveLength(2);
  });

  it('catches one in JSX', () => {
    expect(
      urlLiterals('a.tsx', 'const x = <Link href="https://motodiag.app" />;'),
    ).toHaveLength(1);
  });

  it('catches an address assembled behind a fixed scheme', () => {
    expect(urlLiterals('a.ts', 'const u = `http://${ip}:8000`;')).toHaveLength(1);
  });

  it('passes a reserved placeholder host and a bare mention of the scheme', () => {
    expect(
      urlLiterals(
        'a.ts',
        "const a = 'e.g. https://api.example.com';\n" +
          "const b = 'https://build.example.test';\n" +
          "const c = 'Use https:// for this.';\n" +
          "const d = 'must start with https://.';\n",
      ),
    ).toHaveLength(0);
  });

  it('does not treat a look-alike as reserved', () => {
    expect(
      urlLiterals(
        'a.ts',
        "const a = 'https://example.com.evil.io'; const b = 'https://myexample.com';",
      ),
    ).toHaveLength(2);
  });

  it('ignores a URL that is only mentioned in a comment', () => {
    expect(
      urlLiterals('a.ts', '// see http://10.0.2.2:8000\n/* https://x */ const a = 1;'),
    ).toHaveLength(0);
  });

  it('catches Config.API_BASE_URL and Config["API_BASE_URL"], not a comment', () => {
    const code =
      "// API_BASE_URL is read elsewhere\n" +
      'const a = Config.API_BASE_URL;\n' +
      "const b = Config['API_BASE_URL'];\n" +
      'const {API_BASE_URL} = Config;\n';
    expect(apiBaseUrlReads('a.ts', code).map((f) => f.line)).toEqual([2, 3, 4]);
  });
});
