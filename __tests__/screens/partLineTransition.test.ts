// Phase 201 follow-up — a part line must be advanceable from the app.
//
// The gap this guards: `transitionLine` existed in useWorkOrderParts and
// was tested, but NO SCREEN EVER CALLED IT, and WorkOrderDetailScreen
// never passed `onPartPress`, so every row rendered `disabled`. The
// Order button's own alert meanwhile told the mechanic to "mark each one
// received when it turns up" — an instruction the app made impossible to
// follow. Function present, wiring absent: the F9 integration gap, found
// only when Phase 201's device leg finally ran at the Gate 10 sweep.
//
// It also gated a notification: marking a part received is what fires
// `parts_arrived`, the producer Phase 201 was written to supply for
// Phase 199's dangling event.

export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {readFileSync: (p: string, e: string) => string};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as {join: (...p: string[]) => string};

const SCREEN = path.join(
  __dirname, '..', '..', 'src', 'screens', 'WorkOrderDetailScreen.tsx',
);

describe('the receive step is reachable from the app', () => {
  it('WorkOrderDetailScreen passes onPartPress to the section card', () => {
    const src = fs.readFileSync(SCREEN, 'utf8');
    // Without this the component renders every row `disabled`.
    expect(src).toContain('onPartPress=');
  });

  it('and actually calls transitionLine', () => {
    const src = fs.readFileSync(SCREEN, 'utf8');
    expect(src).toContain('transitionLine(');
  });
});

// The status → next-action mapping, in the shape the screen uses.
type Status = 'open' | 'ordered' | 'received' | 'installed' | 'cancelled';

function nextAction(status: Status): 'received' | 'installed' | null {
  if (status === 'ordered') return 'received';
  if (status === 'received') return 'installed';
  return null;
}

describe('tapping a part advances only where the lifecycle allows', () => {
  it('ordered → received', () => {
    expect(nextAction('ordered')).toBe('received');
  });

  it('received → installed', () => {
    expect(nextAction('received')).toBe('installed');
  });

  it('open does not advance — the Order button owns that step', () => {
    // Open lines ARE the cart. Advancing one by tap would bypass the
    // bulk Order action and split the mechanic's mental model.
    expect(nextAction('open')).toBeNull();
  });

  it.each<Status>(['installed', 'cancelled'])(
    'the terminal state %s does not advance', (status) => {
      expect(nextAction(status)).toBeNull();
    },
  );
});
