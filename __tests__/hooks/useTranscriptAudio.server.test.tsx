// Phase 209B item 1 — transcript audio follows the server setting.
//
// The player takes a URL, so this hook builds one itself instead of
// going through the API client. It used to read the build-time value
// directly, with its own fallback address.

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => ({password: 'mdk_live_test'})),
  setGenericPassword: jest.fn(async () => ({})),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-audio-recorder-player', () => ({
  __esModule: true,
  default: {
    startPlayer: jest.fn(async (uri: string) => uri),
    stopPlayer: jest.fn(async () => ''),
    addPlayBackListener: jest.fn(),
    removePlayBackListener: jest.fn(),
    addPlaybackEndListener: jest.fn(),
    removePlaybackEndListener: jest.fn(),
  },
}));
jest.mock('../../src/services/audioStorageCache', () => ({
  audioStorageCache: {lookup: () => null},
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import Config from 'react-native-config';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {NO_SERVER_MESSAGE, setServerUrl} from '../../src/api/serverUrl';
import {
  useTranscriptAudio,
  type UseTranscriptAudioResult,
} from '../../src/hooks/useTranscriptAudio';

const config = Config as unknown as Record<string, string | undefined>;
const realFetch = globalThis.fetch;
let fetchMock: jest.Mock<Promise<Response>, [RequestInfo, RequestInit?]>;

beforeEach(() => {
  fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>(
    async () => new Response('', {status: 206}),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (AudioRecorderPlayer.startPlayer as jest.Mock).mockClear();
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  delete config.API_BASE_URL;
  await AsyncStorage.clear();
});

async function play(): Promise<UseTranscriptAudioResult> {
  let latest!: UseTranscriptAudioResult;
  function Harness() {
    latest = useTranscriptAudio(3, 9, 42);
    return null;
  }
  await act(async () => {
    ReactTestRenderer.create(<Harness />);
  });
  await act(async () => {
    await latest.play();
  });
  return latest;
}

const PATH = '/v1/shop/3/work-orders/9/transcripts/42/audio';

describe('transcript audio — which server', () => {
  it('streams from the server saved in Settings, not the build-time value', async () => {
    config.API_BASE_URL = 'https://build.example.test';
    await setServerUrl('https://settings.example.test');
    await play();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://settings.example.test${PATH}`);
    expect(AudioRecorderPlayer.startPlayer).toHaveBeenCalledWith(
      `https://settings.example.test${PATH}`,
      {'X-API-Key': 'mdk_live_test'},
    );
  });

  it('uses the build-time value when Settings has none', async () => {
    config.API_BASE_URL = 'https://build.example.test/';
    await play();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://build.example.test${PATH}`);
  });

  it('with no server, says to go to Settings rather than "offline"', async () => {
    const result = await play();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(AudioRecorderPlayer.startPlayer).not.toHaveBeenCalled();
    expect(result.error).toEqual({
      kind: 'stream_failed',
      status: null,
      message: NO_SERVER_MESSAGE,
      permanentlyGone: false,
    });
  });
});
