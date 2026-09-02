// Phase 200 — useReportShareLink hook tests.
//
// Pins the split this hook is built around: MINT failures reject with
// a classified ShareLinkError (the screen alerts on them), while SHEET
// outcomes resolve (a dismiss is a normal exit, never an alert). Also
// pins that the shared payload actually carries the minted URL — the
// whole point of the phase is the customer receiving a working link.

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {open: jest.fn()},
}));

jest.mock('../../src/api/client', () => ({
  api: {POST: jest.fn()},
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Share from 'react-native-share';

import {api} from '../../src/api/client';
import {
  useReportShareLink,
  type ShareLinkError,
  type UseReportShareLinkResult,
} from '../../src/hooks/useReportShareLink';

const shareOpenMock = (Share as unknown as {open: jest.Mock}).open;
const postMock = (api as unknown as {POST: jest.Mock}).POST;

const URL = 'https://shop.example.com/v1/share/tok-abc';

function mounted(): {current: UseReportShareLinkResult} {
  const ref = {current: null as unknown as UseReportShareLinkResult};
  function Probe() {
    ref.current = useReportShareLink();
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(React.createElement(Probe));
  });
  return ref;
}

function mintOk() {
  postMock.mockResolvedValueOnce({
    data: {url: URL, token: 'tok-abc', id: 1, session_id: 7,
           expires_at: '2026-10-02T00:00:00+00:00'},
    error: undefined,
    response: {status: 201},
  });
}

function mintFails(status: number) {
  postMock.mockResolvedValueOnce({
    data: undefined,
    error: {detail: 'nope'},
    response: {status},
  });
}

beforeEach(() => {
  shareOpenMock.mockReset();
  postMock.mockReset();
});

describe('useReportShareLink — happy path', () => {
  it('mints then shares the minted URL', async () => {
    mintOk();
    shareOpenMock.mockResolvedValueOnce({success: true});
    const hook = mounted();

    let outcome: string | undefined;
    await ReactTestRenderer.act(async () => {
      outcome = await hook.current.shareLink(7);
    });

    expect(outcome).toBe('shared');
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe(
      '/v1/reports/session/{session_id}/share',
    );
    expect(postMock.mock.calls[0][1].params.path.session_id).toBe(7);
    const payload = shareOpenMock.mock.calls[0][0];
    expect(payload.url).toBe(URL);
    expect(payload.message).toContain(URL);
    expect(hook.current.lastUrl).toBe(URL);
  });

  it('treats a user cancel as dismissed, not an error', async () => {
    mintOk();
    shareOpenMock.mockRejectedValueOnce(new Error('User did not share'));
    const hook = mounted();

    let outcome: string | undefined;
    await ReactTestRenderer.act(async () => {
      outcome = await hook.current.shareLink(7);
    });

    expect(outcome).toBe('dismissed');
    expect(hook.current.error).toBeNull();
  });

  it('reports a genuine share-sheet failure as error', async () => {
    mintOk();
    shareOpenMock.mockRejectedValueOnce(new Error('activity not found'));
    const hook = mounted();

    let outcome: string | undefined;
    await ReactTestRenderer.act(async () => {
      outcome = await hook.current.shareLink(7);
    });

    expect(outcome).toBe('error');
    expect(hook.current.error).toContain('activity not found');
  });
});

describe('useReportShareLink — mint failures reject, classified', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not_found'],
    [500, 'server'],
    [400, 'network'],
  ])('HTTP %s classifies as %s', async (status, kind) => {
    mintFails(status as number);
    const hook = mounted();

    let caught: ShareLinkError | undefined;
    await ReactTestRenderer.act(async () => {
      await hook.current.shareLink(7).catch((e: ShareLinkError) => {
        caught = e;
      });
    });

    expect(caught?.kind).toBe(kind);
    // The share sheet must never open when there is no link to send.
    expect(shareOpenMock).not.toHaveBeenCalled();
  });

  it('classifies a transport-level throw as network', async () => {
    postMock.mockRejectedValueOnce(new Error('Network request failed'));
    const hook = mounted();

    let caught: ShareLinkError | undefined;
    await ReactTestRenderer.act(async () => {
      await hook.current.shareLink(7).catch((e: ShareLinkError) => {
        caught = e;
      });
    });

    expect(caught?.kind).toBe('network');
    expect(caught?.message).toContain('Network request failed');
    expect(shareOpenMock).not.toHaveBeenCalled();
  });

  it('leaves lastUrl untouched when the mint fails', async () => {
    mintFails(500);
    const hook = mounted();
    await ReactTestRenderer.act(async () => {
      await hook.current.shareLink(7).catch(() => undefined);
    });
    expect(hook.current.lastUrl).toBeNull();
  });
});
