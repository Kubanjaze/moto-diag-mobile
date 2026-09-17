// Phase 209B item 1 — a Release build must name its server.
//
// Two halves: the script's rules, and the proof that Xcode actually runs
// it. A check nothing calls is the failure this phase was about.

// Node built-ins via require with local types, as in
// __tests__/theme/noHardcodedColors.test.ts: the app's tsconfig has no
// @types/node. The empty export keeps this file a module, so these
// names don't collide with that file's.
export {};
declare const __dirname: string;
declare const process: {execPath: string; env: Record<string, string | undefined>};

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
interface SpawnOptions {
  encoding: 'utf8';
  cwd?: string;
  env: Record<string, string | undefined>;
}
const {execFileSync, spawnSync} = require('child_process') as {
  execFileSync(file: string, args: string[], o: SpawnOptions): string;
  spawnSync(file: string, args: string[], o: SpawnOptions): SpawnResult;
};
const fs = require('fs') as {
  mkdtempSync(prefix: string): string;
  mkdirSync(p: string): void;
  rmSync(p: string, o: {recursive: boolean; force: boolean}): void;
  writeFileSync(p: string, text: string): void;
  readFileSync(p: string, e: string): string;
  copyFileSync(from: string, to: string): void;
};
const os = require('os') as {tmpdir(): string};
const path = require('path') as {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  dirname(p: string): string;
};

const REPO = path.resolve(__dirname, '../..');
const SCRIPT = path.join(REPO, 'scripts', 'check-release-env.js');
const PBXPROJ = path.join(REPO, 'ios', 'MotoDiag.xcodeproj', 'project.pbxproj');

const {checkReleaseEnv, parseEnv} = require(SCRIPT) as {
  checkReleaseEnv: (
    root: string,
    env?: Record<string, string | undefined>,
    marker?: string,
  ) => {ok: boolean; message: string};
  parseEnv: (text: string) => Record<string, string>;
};

let root: string;
let marker: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-env-'));
  // Never the real /tmp/envfile: react-native-config would compile in
  // whatever a leftover one names.
  marker = path.join(root, 'no-such-marker');
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

function writeEnv(name: string, text: string): string {
  const file = path.join(root, name);
  fs.writeFileSync(file, text);
  return file;
}

describe('check-release-env rules', () => {
  it.each([
    ['API_BASE_URL=https://api.example.com\n'],
    ['export API_BASE_URL="https://api.example.com"\n'],
    ["API_BASE_URL='https://host.tailnet.ts.net'\n"],
    ['# comment\n\nAPI_BASE_URL=https://example.com:8443/motodiag\nOTHER=1\n'],
  ])('passes %j', (text) => {
    writeEnv('.env', text);
    expect(checkReleaseEnv(root, {}, marker).ok).toBe(true);
  });

  it.each([
    ['unset', 'OTHER=1\n', /is not set/],
    ['empty', 'API_BASE_URL=\n', /is not set/],
    ['the .env.example placeholder', 'API_BASE_URL=https://api.<your-domain>\n', /placeholder/],
    ['plain http, even localhost', 'API_BASE_URL=http://localhost:8000\n', /must be an https/],
    ['a LAN address over http', 'API_BASE_URL=http://192.168.1.20:8000\n', /must be an https/],
    ['credentials', 'API_BASE_URL=https://u:p@api.example.com\n', /must be an https/],
    ['a query string', 'API_BASE_URL=https://api.example.com?x=1\n', /must be an https/],
    ['a trailing comment', 'API_BASE_URL=https://api.example.com # prod\n', /must be an https/],
  ])('fails when the value is %s', (_label, text, message) => {
    writeEnv('.env', text);
    const result = checkReleaseEnv(root, {}, marker);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
  });

  it('fails when there is no env file at all', () => {
    // An absolute ENVFILE: a bare `.env` also falls back to the working
    // directory (ReadDotEnv.rb does too), which here is the repo itself.
    const result = checkReleaseEnv(
      root,
      {ENVFILE: path.join(root, '.env.missing')},
      marker,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });

  it('checks the file ENVFILE names, as react-native-config does', () => {
    writeEnv('.env', 'API_BASE_URL=https://api.example.com\n');
    writeEnv('.env.prod', 'OTHER=1\n');
    expect(checkReleaseEnv(root, {ENVFILE: '.env.prod'}, marker).ok).toBe(false);
  });

  it('lets a /tmp/envfile marker override ENVFILE, as react-native-config does', () => {
    writeEnv('.env', 'OTHER=1\n');
    writeEnv('.env.staging', 'API_BASE_URL=https://staging.example.com\n');
    fs.writeFileSync(marker, '.env.staging\n');
    const result = checkReleaseEnv(root, {ENVFILE: '.env'}, marker);
    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining('staging.example.com'),
    });
  });

  it('parses the way ReadDotEnv.rb does', () => {
    expect(parseEnv('A=1\nexport B="two"\n# C=3\n\nD=\n')).toEqual({
      A: '1',
      B: 'two',
      D: '',
    });
  });
});

describe('check-release-env as a command', () => {
  it('exits 0 and says which file it read', () => {
    writeEnv('.env', 'API_BASE_URL=https://api.example.com\n');
    const out = execFileSync(process.execPath, [SCRIPT, root], {
      encoding: 'utf8',
      env: {PATH: process.env.PATH},
    });
    expect(out).toMatch(/API_BASE_URL ok: https:\/\/api\.example\.com/);
  });

  it('exits 1 with an Xcode-visible "error:" line', () => {
    writeEnv('.env', 'OTHER=1\n');
    const run = spawnSync(process.execPath, [SCRIPT, root], {
      encoding: 'utf8',
      env: {PATH: process.env.PATH},
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^error: check-release-env: API_BASE_URL is not set/);
  });
});

describe('Xcode runs it', () => {
  const project = fs.readFileSync(PBXPROJ, 'utf8');
  const phaseId = /(\w{24}) \/\* Check release server URL \*\/ = \{/.exec(project)?.[1];

  function phaseBody(): string {
    const block = project.slice(
      project.indexOf(`${phaseId} /* Check release server URL */ = {`),
    );
    const script = /shellScript = "((?:[^"\\]|\\.)*)";/.exec(block)?.[1] ?? '';
    return script
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  /** Run the phase exactly as written in the project, in a scratch
   *  project laid out like this one (ios/ next to scripts/). */
  function runPhase(configuration: string, envText: string | null) {
    fs.mkdirSync(path.join(root, 'ios'));
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'check-release-env.js'));
    if (envText !== null) {
      writeEnv('.env', envText);
    }
    const phaseFile = path.join(root, 'phase.sh');
    fs.writeFileSync(phaseFile, phaseBody());
    return spawnSync('/bin/sh', [phaseFile], {
      encoding: 'utf8',
      cwd: root,
      env: {
        PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
        CONFIGURATION: configuration,
        SRCROOT: path.join(root, 'ios'),
      },
    });
  }

  it('the phase as written fails a Release build with no server', () => {
    const run = runPhase('Release', 'OTHER=1\n');
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/error: check-release-env: API_BASE_URL is not set/);
  });

  it('the phase as written passes a Release build with an https server', () => {
    const run = runPhase('Release', 'API_BASE_URL=https://api.example.com\n');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/API_BASE_URL ok/);
  });

  it('the phase as written leaves a Debug build alone', () => {
    expect(runPhase('Debug', null).status).toBe(0);
  });

  it('defines the build phase', () => {
    expect(phaseId).toBeDefined();
  });

  it('puts it in the app target, ahead of compiling anything', () => {
    const phases = /buildPhases = \(([^)]*)\);/.exec(
      project.slice(project.indexOf('/* Begin PBXNativeTarget section */')),
    )?.[1];
    expect(phases).toBeDefined();
    const ids = [...phases!.matchAll(/(\w{24}) \/\*/g)].map((m) => m[1]);
    expect(ids[0]).toBe(phaseId);
    expect(project).toMatch(new RegExp(`${ids[1]} /\\* \\[CP\\] Check Pods Manifest\\.lock \\*/`));
  });

  it('runs the script, for Release only, and fails the build on failure', () => {
    const block = project.slice(
      project.indexOf(`${phaseId} /* Check release server URL */ = {`),
    );
    const body = phaseBody();
    expect(body).toMatch(/^set -e$/m);
    expect(body).toMatch(/if \[ "\$CONFIGURATION" != "Release" \]; then\n\s*exit 0/);
    expect(body).toMatch(/"\$NODE_BINARY" "\$SRCROOT\/\.\.\/scripts\/check-release-env\.js"/);
    expect(block.slice(0, block.indexOf('};'))).toMatch(/alwaysOutOfDate = 1;/);
  });
});
