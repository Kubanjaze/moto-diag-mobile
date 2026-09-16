// Asking about a video must not require a locally cached copy.
//
// Found in use, not by a test: after a reinstall wiped the device cache, the
// video playback screen showed "Video not cached locally" and there was no way
// to ask a question about the clip -- while the backend had already answered a
// question about that exact video minutes earlier.
//
// The cause is an ordering accident. The uncached pane is an EARLY RETURN
// written at Phase 191B for *playback*. "Ask about this video" was added at
// Phase 244J, below that return. So Ask inherited a guard that predates it and
// has nothing to do with it: asking reads frames from the SERVER's copy and
// never touches the local file.
//
// Who this locked out: a fresh install, a second device, and any clip recorded
// by someone else -- exactly the cases where a question is most likely.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('react-native-video', () => 'Video');
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
}));

const mockVideos: Array<Record<string, unknown>> = [];
jest.mock('../../src/hooks/useSessionVideos', () => ({
  useSessionVideos: () => ({
    videos: mockVideos,
    addRecording: jest.fn(),
    deleteVideo: jest.fn(),
    refresh: jest.fn(),
    atCap: false,
    capReason: null,
    isLoading: false,
    error: null,
  }),
}));

jest.mock('../../src/api', () => ({
  api: {GET: jest.fn(), PATCH: jest.fn(), POST: jest.fn(), DELETE: jest.fn()},
  describeError: (e: unknown) => String(e),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {VideoPlaybackScreen} from '../../src/screens/VideoPlaybackScreen';
import {withTheme} from '../withTheme';

const baseVideo = {
  id: '5',
  sessionId: 6,
  fileUri: '/local/cached.mp4',
  remoteUrl: null,
  startedAt: '2026-09-10T00:00:00Z',
  durationMs: 12000,
  width: 1920,
  height: 1080,
  fileSizeBytes: 1024,
  interrupted: false,
};

function render() {
  const navigation = {goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn()};
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      withTheme(
        <VideoPlaybackScreen
          {...({
            navigation,
            route: {
              key: 'k',
              name: 'VideoPlayback',
              params: {sessionId: 6, videoId: '5'},
            },
          } as unknown as React.ComponentProps<typeof VideoPlaybackScreen>)}
        />,
      ),
    );
  });
  return {tree, navigation};
}

const askButtons = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(
    n =>
      typeof n.type !== 'string' &&
      n.props?.title === 'Ask about this video' &&
      typeof n.props?.onPress === 'function',
  );

beforeEach(() => {
  mockVideos.length = 0;
});

describe('VideoPlaybackScreen — a video that is not cached locally', () => {
  it('still offers "Ask about this video"', () => {
    mockVideos.push({...baseVideo, fileUri: null});
    const {tree} = render();

    // The uncached pane is showing...
    const body = JSON.stringify(tree.toJSON());
    expect(body).toContain('Video not cached locally');

    // ...and Ask is reachable anyway, because it reads the server's copy.
    expect(askButtons(tree).length).toBeGreaterThan(0);
  });

  it('navigates to AskAboutVideo with the right ids from the uncached pane', () => {
    mockVideos.push({...baseVideo, fileUri: null});
    const {tree, navigation} = render();

    ReactTestRenderer.act(() => {
      askButtons(tree)[0].props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('AskAboutVideo', {
      sessionId: 6,
      videoId: 5,
    });
  });

  it('still offers Ask when the video IS cached (no regression)', () => {
    mockVideos.push({...baseVideo});
    const {tree} = render();
    expect(askButtons(tree).length).toBeGreaterThan(0);
  });
});
