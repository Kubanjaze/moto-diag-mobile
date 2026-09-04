// Phase 203 — the conversion primitive.
//
// `StyleSheet.create({...})` at module scope is evaluated once at
// import time, which is exactly why 33 files of static styles could not
// react to a theme. This turns each of them into a hook with one line
// changed at the top of the file and one added in the component:
//
//     const useStyles = createThemedStyles((t) => ({
//       card: {backgroundColor: t.surface, borderColor: t.border},
//     }));
//
//     function MyComponent() {
//       const styles = useStyles();
//       ...
//     }
//
// The sheet is memoised per theme object, so a normal re-render costs
// nothing and flipping the scheme costs exactly one rebuild per mounted
// component. The cache is keyed on the theme identity rather than the
// scheme string so a future third scheme (high-contrast) needs no
// change here.

import {useMemo} from 'react';
import {StyleSheet} from 'react-native';

import type {Theme} from './tokens';
import {useTheme} from './useTheme';

type NamedStyles = Parameters<typeof StyleSheet.create>[0];

export function createThemedStyles<T extends NamedStyles>(
  factory: (theme: Theme) => T,
): () => T {
  // Module-level cache shared by every call site of this sheet: two
  // mounted instances of the same component in the same theme build
  // the StyleSheet once between them.
  const cache = new WeakMap<Theme, T>();

  return function useStyles(): T {
    const {theme} = useTheme();
    return useMemo(() => {
      const cached = cache.get(theme);
      if (cached) return cached;
      const created = StyleSheet.create(factory(theme)) as T;
      cache.set(theme, created);
      return created;
    }, [theme]);
  };
}
