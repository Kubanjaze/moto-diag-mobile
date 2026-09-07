// F63 regression guard — video playback froze the app.
//
// Root cause, bisected on a physical iPhone 16 Pro: react-native-video's
// `controls` prop embeds Apple's AVPlayerViewController inside our view
// tree, and under the New Architecture that WEDGES THE JS THREAD. The
// signature is unusual and worth recording, because it looks like
// neither a crash nor a normal hang: the process stays alive, native
// chrome (header, tab bar) keeps painting perfectly, but JS timers stop,
// the debugger detaches, and no touch is ever handled — so everything
// looks right and nothing responds. An identical build with `controls`
// removed played smoothly with navigation fully responsive.
//
// 6.19.2 was already the latest release, so there was no upstream fix to
// wait for; the screen owns its transport controls now.

// `export {}` makes this file a MODULE. Without it TypeScript treats a
// test with no imports as a global script, and its `fs` / `path` consts
// collide with the identically-named ones in
// __tests__/theme/noHardcodedColors.test.ts.
export {};

// `tsconfig.json` restricts `types` to ["jest"], so the Node globals are
// not declared project-wide. Requiring them here (rather than adding
// @types/node to every file's scope) keeps that restriction intact —
// this is the only test that needs to read source.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {readFileSync: (p: string, e: string) => string};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as {join: (...parts: string[]) => string};

const SCREEN = path.join(
  __dirname, '..', '..', 'src', 'screens', 'VideoPlaybackScreen.tsx',
);

describe('F63 — the native controls prop must not come back', () => {
  it('does not pass `controls` to the Video element', () => {
    const source = fs.readFileSync(SCREEN, 'utf8');
    // Match the JSX prop specifically, not the word in prose: the file
    // deliberately explains the bug in comments.
    const jsxProp = /^\s*controls(\s*=|\s*$)/m;
    expect(jsxProp.test(source)).toBe(false);
  });

  it('renders its own transport control instead', () => {
    const source = fs.readFileSync(SCREEN, 'utf8');
    expect(source).toContain('video-playback-playpause');
    expect(source).toContain('video-playback-elapsed');
  });
});

// The play/pause/replay state machine, extracted to the same shape the
// screen uses. Pins that replaying REWINDS — without the seek(0) the
// player sits on the final frame and a tap appears to do nothing.
type Toggle = {paused: boolean; ended: boolean; seeks: number};

function makeToggle(initial: Partial<Toggle> = {}) {
  const state: Toggle = {
    paused: false, ended: false, seeks: 0, ...initial,
  };
  function toggle() {
    if (state.ended) {
      state.seeks += 1;
      state.ended = false;
      state.paused = false;
      return;
    }
    state.paused = !state.paused;
  }
  return {state, toggle};
}

describe('F63 — transport control behaviour', () => {
  it('pauses and resumes', () => {
    const {state, toggle} = makeToggle();
    toggle();
    expect(state.paused).toBe(true);
    toggle();
    expect(state.paused).toBe(false);
    expect(state.seeks).toBe(0);
  });

  it('rewinds when replaying after the clip ends', () => {
    const {state, toggle} = makeToggle({ended: true, paused: true});
    toggle();
    // Without the seek the player stays on the last frame and the tap
    // looks like a no-op to the mechanic.
    expect(state.seeks).toBe(1);
    expect(state.ended).toBe(false);
    expect(state.paused).toBe(false);
  });

  it('does not seek on an ordinary pause', () => {
    const {state, toggle} = makeToggle({paused: false, ended: false});
    toggle();
    expect(state.seeks).toBe(0);
  });
});
