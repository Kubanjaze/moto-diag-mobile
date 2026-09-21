#!/usr/bin/env python3
"""Phase 203 — insert `const styles = useStyles();` into components.

Brace-matching rather than regex: signatures in this codebase span
several lines and destructure nested object types, which a pattern
cannot reliably close over. Walks from the function name to its
parameter list, matches parens, finds the body's opening brace, and
inserts on the next line.

Only touches functions whose body actually references `styles.` and
whose name starts uppercase (React components — plain helpers cannot
call hooks and are handled by thread_styles.py).
"""
import re
import sys

MARK = '  const styles = useStyles();\n'


def body_start(src: str, at: int) -> int | None:
    """Given the index of the '(' opening a param list, return the index
    just after the '{' that opens the function body."""
    depth = 0
    i = at
    while i < len(src):
        c = src[i]
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                brace = src.find('{', i)
                if brace == -1:
                    return None
                return brace + 1
        i += 1
    return None


def process(path: str) -> None:
    src = open(path).read()
    if 'useStyles' not in src:
        print(f'SKIP {path}'); return
    added = []
    # iterate from the end so earlier offsets stay valid
    decls = list(re.finditer(r'^(?:export )?function ([A-Z]\w*)\s*(?:<[^>]*>)?\(',
                             src, re.M))
    for m in reversed(decls):
        name = m.group(1)
        start = body_start(src, m.end() - 1)
        if start is None:
            continue
        nxt = re.search(r'^(?:export )?function ', src[start:], re.M)
        end = start + (nxt.start() if nxt else len(src) - start)
        segment = src[start:end]
        if 'styles.' not in segment or 'const styles = useStyles();' in segment:
            continue
        # skip a leading newline so the insert lands on its own line
        offset = 1 if src[start] == '\n' else 0
        src = src[:start + offset] + MARK + src[start + offset:]
        added.append(name)
    open(path, 'w').write(src)
    print(f'OK   {path}  {list(reversed(added))}')


if __name__ == '__main__':
    for target in sys.argv[1:]:
        process(target)
