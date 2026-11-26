// Phase 210B item 2 — the app shows a person the name Mekno.
//
// Pins the home stack's title, the Bluetooth permission sentence, and
// the camera and microphone permission panes. The home screen's heading
// is pinned in HomeSmokeWording.test.tsx, Info.plist's words in
// __tests__/ios/appName.test.ts, and the two server-address sentences in
// __tests__/api/serverUrl.test.ts.

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children: React.ReactNode}) => children,
}));

// The home stack: its navigator renders its screens' props only, and
// each screen module is a stand-in, so no native module loads.
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({children}: {children: React.ReactNode}) => children,
    Screen: () => null,
  }),
}));
jest.mock('../../src/screens/HomeScreen', () => ({HomeScreen: () => null}));
jest.mock('../../src/screens/SettingsScreen', () => ({SettingsScreen: () => null}));
jest.mock('../../src/screens/PlanScreen', () => ({PlanScreen: () => null}));
jest.mock('../../src/screens/DTCSearchScreen', () => ({DTCSearchScreen: () => null}));
jest.mock('../../src/screens/DTCDetailScreen', () => ({DTCDetailScreen: () => null}));
jest.mock('../../src/screens/ObdConnectScreen', () => ({ObdConnectScreen: () => null}));
jest.mock('../../src/screens/LiveDataScreen', () => ({LiveDataScreen: () => null}));

// The capture screens, with permission denied, so each shows its pane.
jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraDevice: () => undefined,
}));
jest.mock('../../src/hooks/useCameraPermissions', () => ({
  useCameraPermissions: () => ({
    camera: 'denied', microphone: 'denied', status: 'denied',
    request: jest.fn(async () => {}),
  }),
}));
jest.mock('../../src/hooks/useWorkOrderPhotos', () => ({
  useWorkOrderPhotos: () => ({addPhoto: jest.fn()}),
}));
jest.mock('react-native-audio-recorder-player', () => ({}));
jest.mock('@react-native-voice/voice', () => ({
  __esModule: true,
  default: {
    destroy: jest.fn(async () => {}),
    removeAllListeners: jest.fn(),
    stop: jest.fn(async () => {}),
  },
}));
jest.mock('../../src/hooks/useMicrophonePermissions', () => ({
  useMicrophonePermissions: () => ({
    microphone: 'denied', speechRecognition: 'denied', status: 'denied',
    request: jest.fn(async () => {}),
  }),
}));
jest.mock('../../src/hooks/useWorkOrderTranscripts', () => ({
  useWorkOrderTranscripts: () => ({addTranscript: jest.fn()}),
}));

import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {HomeStack} from '../../src/navigation/HomeStack';
import {describeObdError} from '../../src/obd/obdErrors';
import {PhotoCaptureScreen} from '../../src/screens/PhotoCaptureScreen';
import {VoiceCaptureScreen} from '../../src/screens/VoiceCaptureScreen';
import {withTheme} from '../withTheme';

// Made-up ids; the screens read only these.
const captureProps = {
  navigation: {goBack: jest.fn(), navigate: jest.fn()},
  route: {key: 'k', name: 'Capture', params: {shopId: 1, woId: 2}},
} as unknown as React.ComponentProps<typeof PhotoCaptureScreen> &
  React.ComponentProps<typeof VoiceCaptureScreen>;

async function textsOf(element: React.ReactElement): Promise<string> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(withTheme(element));
  });
  const words = tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''))
    .join('\n')
    .replace(/\s+/g, ' ');
  await act(async () => {
    tree.unmount();
  });
  return words;
}

it("the home stack's title is Mekno", async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<HomeStack />);
  });
  const home = tree.root
    .findAll(n => n.props.name === 'Home' && n.props.options !== undefined)[0];
  expect(home.props.options.title).toBe('Mekno');
});

it('the Bluetooth permission sentence names Mekno', () => {
  const copy = describeObdError({kind: 'ble_unauthorized', message: ''});
  expect(copy.message).toMatch(/^Mekno needs Bluetooth permission/);
});

it('the camera permission pane names Mekno', async () => {
  const words = await textsOf(<PhotoCaptureScreen {...captureProps} />);
  expect(words).toContain('Mekno needs camera access');
  expect(words).not.toContain('MotoDiag');
});

it('the microphone permission pane names Mekno', async () => {
  const words = await textsOf(<VoiceCaptureScreen {...captureProps} />);
  expect(words).toContain('Mekno needs microphone access');
  expect(words).not.toContain('MotoDiag');
});
