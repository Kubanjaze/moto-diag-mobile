#!/usr/bin/env python3
"""Phase 203 — thread `styles` through module-scope render helpers.

A themed stylesheet is a hook result, so a module-scope helper can no
longer close over it. Each helper that uses `styles` gains it as a first
parameter and every call site is updated. React components (uppercase
names) get `const styles = useStyles();` instead — they can call hooks.

tsc verifies the result; this only does the mechanical part.
"""
import re
import sys

STYLE_T = 'ReturnType<typeof useStyles>'


def helper_bodies(src: str):
    """Yield (name, decl_start, body_start, body_end) for top-level fns."""
    for m in re.finditer(r'^(export )?function (\w+)(<[^>]*>)?\(', src, re.M):
        name = m.group(2)
        # body spans to the next top-level function or EOF
        nxt = re.search(r'^(export )?function ', src[m.end():], re.M)
        end = m.end() + (nxt.start() if nxt else len(src) - m.end())
        yield name, m.start(), m.end(), end


def main(path: str) -> None:
    src = open(path).read()
    if 'useStyles' not in src:
        print(f'SKIP {path} (not converted)'); return

    components, helpers = [], []
    for name, decl, body_start, end in helper_bodies(src):
        if 'styles.' not in src[body_start:end]:
            continue
        (components if name[0].isupper() else helpers).append(name)

    # 1. components get the hook call
    for name in components:
        m = re.search(
            r'((?:export )?function ' + name + r'(?:<[^>]*>)?\((?:[^{]|\n)*?\)\s*(?::\s*[\w.<>\[\]| ]+\s*)?\{\n)',
            src)
        if m and 'const styles = useStyles();' not in src[m.end():m.end() + 60]:
            src = src[:m.end()] + '  const styles = useStyles();\n' + src[m.end():]

    # 2. helpers take styles as a first parameter
    for name in helpers:
        src = re.sub(
            r'(function ' + name + r'(?:<[^>]*>)?\()',
            r'\g<1>\n  styles: ' + STYLE_T + ',',
            src, count=1)
        # 3. call sites (skip the declaration itself)
        src = re.sub(r'(?<!function )\b' + name + r'\(',
                     name + '(styles, ', src)
        # undo the damage to the declaration the previous sub may have done
        src = src.replace(
            f'function {name}(styles, \n  styles: {STYLE_T},',
            f'function {name}(\n  styles: {STYLE_T},')

    open(path, 'w').write(src)
    print(f'OK   {path}  components={components} helpers={helpers}')


if __name__ == '__main__':
    for target in sys.argv[1:]:
        main(target)
