// Phase 203 — bridge tokens into React Navigation's theme shape.
//
// NavigationContainer paints the area behind screens during
// transitions and on overscroll. Without this it stays white and
// flashes against a dark app on every push — the classic tell that
// dark mode was bolted on.

import {DarkTheme, DefaultTheme, type Theme as NavTheme} from '@react-navigation/native';

import type {Theme} from './tokens';

export function toNavigationTheme(theme: Theme): NavTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: theme.accent,
      background: theme.background,
      card: theme.surface,
      text: theme.textPrimary,
      border: theme.border,
      notification: theme.danger,
    },
  };
}
