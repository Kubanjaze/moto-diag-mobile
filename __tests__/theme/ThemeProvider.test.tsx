// Phase 203 — theme provider behaviour.
//
// Covers the tri-state resolution, persistence, and the failure mode
// that matters: storage throwing must not leave the app themeless.

const mockColorScheme = {value: 'light' as 'light' | 'dark' | null};
jest.mock('react-native', () => ({
  useColorScheme: () => mockColorScheme.value,
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ThemeProvider,
  THEME_PREFERENCE_KEY,
  type ThemePreference,
} from '../../src/theme/ThemeProvider';
import {useTheme, type ThemeContextValue} from '../../src/theme/useTheme';

const storage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  __store: Map<string, string>;
};

async function mount(
  initial?: ThemePreference,
): Promise<{current: ThemeContextValue}> {
  const ref = {current: null as unknown as ThemeContextValue};
  function Probe() {
    ref.current = useTheme();
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <ThemeProvider initialPreference={initial}>
        <Probe />
      </ThemeProvider>,
    );
  });
  return ref;
}

beforeEach(() => {
  mockColorScheme.value = 'light';
  storage.__store.clear();
  storage.getItem.mockClear();
  storage.setItem.mockClear();
});

describe('resolving the scheme', () => {
  it('follows the system when the preference is "system"', async () => {
    mockColorScheme.value = 'dark';
    const hook = await mount('system');
    expect(hook.current.scheme).toBe('dark');
    expect(hook.current.theme.scheme).toBe('dark');
  });

  it('treats an unknown system value as light', async () => {
    mockColorScheme.value = null;
    const hook = await mount('system');
    expect(hook.current.scheme).toBe('light');
  });

  it.each(['light', 'dark'] as const)(
    'an explicit %s preference overrides the system',
    async (preference) => {
      // The system says the opposite of what the mechanic asked for.
      mockColorScheme.value = preference === 'light' ? 'dark' : 'light';
      const hook = await mount(preference);
      expect(hook.current.scheme).toBe(preference);
      // The preference itself is preserved, not collapsed into scheme.
      expect(hook.current.preference).toBe(preference);
    },
  );
});

describe('persistence', () => {
  it('hydrates a stored preference on mount', async () => {
    storage.__store.set(THEME_PREFERENCE_KEY, 'dark');
    const hook = await mount();
    expect(hook.current.preference).toBe('dark');
    expect(hook.current.isLoading).toBe(false);
  });

  it('ignores a corrupt stored value and falls back to system', async () => {
    storage.__store.set(THEME_PREFERENCE_KEY, 'chartreuse');
    const hook = await mount();
    expect(hook.current.preference).toBe('system');
  });

  it('writes the choice under the motodiag:ui:theme key', async () => {
    const hook = await mount('system');
    await ReactTestRenderer.act(async () => {
      await hook.current.setPreference('dark');
    });
    expect(storage.setItem).toHaveBeenCalledWith(THEME_PREFERENCE_KEY, 'dark');
    expect(hook.current.scheme).toBe('dark');
  });

  it('still applies the choice when the write fails', async () => {
    // A failed write costs the user their choice next launch. A control
    // that appears not to respond is worse.
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    const hook = await mount('system');
    await ReactTestRenderer.act(async () => {
      await hook.current.setPreference('dark');
    });
    expect(hook.current.scheme).toBe('dark');
  });

  it('survives a read failure rather than rendering themeless', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('unavailable'));
    const hook = await mount();
    expect(hook.current.preference).toBe('system');
    expect(hook.current.theme).toBeTruthy();
    expect(hook.current.isLoading).toBe(false);
  });
});

describe('useTheme outside a provider', () => {
  it('throws rather than silently defaulting', async () => {
    // Same contract as useApiKey: a component wired in without its
    // provider should fail loudly, not render in the wrong palette.
    function Orphan() {
      useTheme();
      return null;
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      ReactTestRenderer.act(() => {
        ReactTestRenderer.create(<Orphan />);
      });
    }).toThrow(/must be used inside <ThemeProvider>/);
    spy.mockRestore();
  });
});
