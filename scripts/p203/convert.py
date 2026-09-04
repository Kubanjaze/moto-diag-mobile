#!/usr/bin/env python3
"""Phase 203 — mechanical StyleSheet -> themed-styles conversion.

Does the parts that are safe to automate:
  1. `StyleSheet.create({`  ->  `createThemedStyles((t) => ({`
  2. its closing `});`      ->  `}));`
  3. `const styles =`       ->  `const useStyles =`
  4. hex literals           ->  `t.<token>`
  5. adds the createThemedStyles import

It deliberately does NOT try to insert `const styles = useStyles();`
into components. That needs to know which functions are components and
which are plain render helpers (helpers cannot call hooks and must take
`styles` as a parameter instead). tsc names every one of those sites
precisely, so the remaining work is driven by the compiler rather than
by a regex guessing at React semantics.
"""
import re
import sys

# Role mapping. Derived from the Step 0 audit's role table; every value
# with a count >= 3 in the app (excluding src/theme/) is covered.
COLOR = {
    # surfaces
    '#fff': 't.surface', '#ffffff': 't.surface', '#fafafa': 't.surface',
    '#f9f9fb': 't.surface', '#f9f9f9': 't.surface',
    '#f5f5f7': 't.background', '#f7f8fa': 't.background',
    '#f3f3f3': 't.surfaceSunken', '#f1f1f1': 't.surfaceSunken',
    '#f0f0f0': 't.surfaceSunken', '#eef': 't.surfaceSunken',
    # text
    '#111': 't.textPrimary', '#000': 't.textPrimary',
    '#222': 't.textPrimary', '#0d0d0f': 't.textPrimary',
    '#333': 't.textSecondary', '#444': 't.textSecondary',
    '#555': 't.textSecondary',
    '#666': 't.textMuted', '#777': 't.textMuted', '#888': 't.textMuted',
    '#999': 't.textDisabled', '#aaa': 't.textDisabled',
    '#bbb': 't.textDisabled',
    # lines
    '#ddd': 't.border', '#ccc': 't.border', '#e0e0e0': 't.border',
    '#e6e6e6': 't.border', '#dde': 't.border',
    '#eee': 't.divider', '#e6e6ea': 't.divider',
    # intent
    '#007aff': 't.accent', '#1976d2': 't.accent', '#0d47a1': 't.accentPressed',
    '#1a4f9c': 't.accentPressed', '#1a3e6e': 't.accentPressed',
    '#b00020': 't.danger', '#e63946': 't.danger', '#ff5050': 't.danger',
    '#b42318': 't.danger', '#a00': 't.danger', '#700': 't.danger',
    '#1b7c2f': 't.success', '#5a8f5a': 't.success', '#5caa5c': 't.success',
    '#3a7': 't.success', '#1a7f37': 't.success',
    '#d39e00': 't.warning', '#b35c00': 't.warning', '#a85e00': 't.warning',
    '#8a6d00': 't.warning', '#8a5b00': 't.warning', '#d05a2e': 't.warning',
    # controls / chrome
    '#8e8e93': 't.tabInactive',
    '#e0eaff': 't.controlSecondaryBg', '#e8f1ff': 't.controlSecondaryBg',
    '#e6efff': 't.controlSecondaryBg', '#e3f0ff': 't.controlSecondaryBg',
    '#9ec5ff': 't.accent', '#7aa6ff': 't.accent', '#5a8fc8': 't.accent',
    '#7a5ac8': 't.accent',
    # severity family
    '#fee': 't.severity.critical.bg', '#ffd6d6': 't.severity.critical.bg',
    '#fca7a7': 't.severity.critical.border',
    '#a00000': 't.severity.critical.fg', '#7a1320': 't.severity.critical.fg',
    '#3a0a0a': 't.severity.critical.bg',
    '#fff4e0': 't.severity.high.bg', '#fff0d6': 't.severity.high.bg',
    '#ffe0d6': 't.severity.high.bg', '#7a4400': 't.severity.high.fg',
    '#7a5500': 't.severity.high.fg', '#f0e0a0': 't.severity.high.border',
    '#fff8d0': 't.severity.medium.bg', '#fff4d6': 't.severity.medium.bg',
    '#fff8e6': 't.severity.medium.bg', '#7a5c00': 't.severity.medium.fg',
    '#e6cc66': 't.severity.medium.border', '#ffb454': 't.severity.medium.fg',
    '#e3f5e3': 't.severity.low.bg', '#e3f5e0': 't.severity.low.bg',
    '#f4faf4': 't.severity.low.bg', '#1b5e20': 't.severity.low.fg',
    # symptom-source family
    '#e3f0fa': 't.symptomSource.keyword.bg',
    '#e3f0fb': 't.symptomSource.keyword.bg',
    '#cae3f8': 't.symptomSource.keyword.border',
    '#f0e3fa': 't.symptomSource.claude.bg',
    '#dcc4f5': 't.symptomSource.claude.border',
    # scrims
    'rgba(0,0,0,0.4)': 't.scrim', 'rgba(0,0,0,0.45)': 't.scrim',
    'rgba(0,0,0,0.5)': 't.scrim', 'rgba(0,0,0,0.6)': 't.scrim',
    'rgba(0,0,0,0.65)': 't.scrim', 'rgba(0,0,0,0.7)': 't.scrim',
    'rgba(0,0,0,0.8)': 't.scrim',
}

IMPORT = "import {createThemedStyles} from '{rel}/theme/createThemedStyles';\n"


def convert(path: str, rel: str) -> tuple[bool, list[str]]:
    src = open(path).read()
    if 'StyleSheet.create' not in src:
        return False, ['no StyleSheet.create']
    if 'createThemedStyles' in src:
        return False, ['already converted']

    unmapped: list[str] = []

    # 1-3: the wrapper. Only the `const styles = StyleSheet.create({`
    # form is handled; anything else is reported for manual work.
    m = re.search(r'const styles = StyleSheet\.create\(\{', src)
    if not m:
        return False, ['unrecognised StyleSheet.create form']
    head = src[:m.start()]
    body = src[m.end():]
    # find the matching close: the create call ends the file's last `});`
    close = body.rfind('});')
    if close == -1:
        return False, ['could not find the closing });']
    sheet = body[:close]
    tail = body[close + 3:]

    # 4: colours, inside the sheet only.
    def swap(match: re.Match) -> str:
        raw = match.group(0)
        key = raw.lower()
        if key in COLOR:
            return COLOR[key]
        unmapped.append(raw)
        return raw

    sheet = re.sub(r"'(#[0-9a-fA-F]{3,8}|rgba\([^)]*\))'",
                   lambda mm: swap(re.match(r"#.*|rgba\(.*\)", mm.group(1))) or mm.group(0),
                   sheet)

    out = (head + 'const useStyles = createThemedStyles((t) => ({'
           + sheet + '}));' + tail)

    # 5: import, after the last import line.
    imports = list(re.finditer(r'^import [^\n]*;\n', out, re.M))
    if imports:
        at = imports[-1].end()
        out = out[:at] + IMPORT.replace('{rel}', rel) + out[at:]

    # StyleSheet may now be unused.
    if not re.search(r'StyleSheet\.\w', out):
        out = re.sub(r"import \{([^}]*)\} from 'react-native';",
                     lambda mm: "import {%s} from 'react-native';" % (
                         ', '.join(n.strip() for n in mm.group(1).split(',')
                                   if n.strip() != 'StyleSheet')),
                     out, count=1)
        out = re.sub(r"import \{\s*\} from 'react-native';\n", '', out)

    open(path, 'w').write(out)
    return True, sorted(set(unmapped))


if __name__ == '__main__':
    rel = sys.argv[1]
    for target in sys.argv[2:]:
        ok, notes = convert(target, rel)
        flag = 'OK  ' if ok else 'SKIP'
        print(f'{flag} {target}' + (f'  unmapped: {notes}' if notes else ''))
