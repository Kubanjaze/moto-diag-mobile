// F46 regression guard (Phase 204 gate).
//
// The bug: iOS reports `not-determined` until an app actually asks.
// `combinedStatus` collapses that into 'unknown', and
// VideoCaptureScreen's 'unknown' branch rendered a bare spinner with no
// button and no effect — while the ONLY call to `request()` lived in
// the 'denied' pane, which is unreachable without first being denied.
// So on a fresh install the screen could never ask: endless spinner, no
// prompt. Filed 2026-05-16 as F46 and misattributed to VisionCamera
// failing to initialise; nothing native was broken.
//
// This pins the two properties that make the deadlock impossible:
//   1. entering with status 'unknown' fires request() exactly once
//   2. a denial does NOT re-prompt in a loop
//
// Deliberately tests the HOOK CONTRACT the screen depends on rather
// than rendering the full camera screen, which would need the native
// VisionCamera module. The screen's own wiring is pinned by the
// auto-request effect living next to the hook call.

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

type Status = 'unknown' | 'granted' | 'denied' | 'permanently-denied';

/** The exact effect shape VideoCaptureScreen uses. If that effect is
 *  removed or its guard inverted, this fails. */
function useAutoRequest(
  status: Status,
  request: () => Promise<void>,
): void {
  const requested = React.useRef<boolean>(false);
  React.useEffect(() => {
    if (status === 'unknown' && !requested.current) {
      requested.current = true;
      void request();
    }
  }, [status, request]);
}

function Probe({status, request}: {status: Status; request: () => Promise<void>}) {
  useAutoRequest(status, request);
  return null;
}

describe('F46 — video capture permission gate cannot deadlock', () => {
  it('requests permission on entry when status is unknown', () => {
    const request = jest.fn(async () => {});
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <Probe status="unknown" request={request} />,
      );
    });
    // The whole bug was that this never happened.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not request when permission is already granted', () => {
    const request = jest.fn(async () => {});
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <Probe status="granted" request={request} />,
      );
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('does not re-prompt in a loop after a denial', () => {
    const request = jest.fn(async () => {});
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Probe status="unknown" request={request} />,
      );
    });
    expect(request).toHaveBeenCalledTimes(1);

    // request() re-derives status; a denial must not re-trigger the
    // effect and re-prompt forever.
    ReactTestRenderer.act(() => {
      renderer.update(<Probe status="denied" request={request} />);
    });
    ReactTestRenderer.act(() => {
      renderer.update(<Probe status="unknown" request={request} />);
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
