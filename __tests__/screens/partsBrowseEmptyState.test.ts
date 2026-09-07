// The parts-browse empty state must say WHY it is empty.
//
// Catalog results are scoped to the work order's bike. On a Suzuki work
// order with a Harley-only catalog, an empty list is CORRECT — but the
// old copy said "try a looser search", which is advice that cannot work
// when the filter is the vehicle, not the query. That is how a correct
// empty result got reported during the Gate 10 sweep as "I can't add
// parts".
//
// Same failure family as the inert part rows and the bare upload error:
// feedback that reads as breakage.

export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {readFileSync: (p: string, e: string) => string};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as {join: (...p: string[]) => string};

const SCREEN = path.join(
  __dirname, '..', '..', 'src', 'screens', 'PartsBrowseScreen.tsx',
);

describe('parts browse empty state', () => {
  it('names the bike, so the scope of the filter is visible', () => {
    const src = fs.readFileSync(SCREEN, 'utf8');
    expect(src).toContain('${make} ${model}');
  });

  it('says a wider search will not help when the filter is the vehicle', () => {
    const src = fs.readFileSync(SCREEN, 'utf8');
    // The old copy sent the mechanic chasing the one thing that cannot
    // fix it.
    expect(src).toMatch(/wider search will not help/);
  });

  it('still offers the search hint when there is no vehicle context', () => {
    const src = fs.readFileSync(SCREEN, 'utf8');
    // Without a make/model the query IS the only filter, so the looser
    // search advice is correct there and must survive.
    expect(src).toContain('Try a looser search');
  });
});
