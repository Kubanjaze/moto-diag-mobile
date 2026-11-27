// Phase 409 (backend) — the app explains the public address's 100 MB
// limit in its own words.
//
// Through the public address (api.getmekno.com, a Cloudflare Tunnel),
// a request body over 100 MB is refused by Cloudflare with its own
// HTML 413 page before the server sees it. The server's own 413 is a
// ProblemDetail. The upload hook names the first; the screen turns it
// into plain words and never shows Cloudflare's page.

import {
  classifyUploadError,
  quotaExceededCopy,
} from '../../src/screens/videoCaptureHelpers';
import {
  CONNECTION_UPLOAD_LIMIT_MB,
  VIDEO_TOO_LARGE_FOR_CONNECTION,
} from '../../src/types/video';

describe('the connection limit, in the screen', () => {
  it('is 100 MB', () => {
    expect(CONNECTION_UPLOAD_LIMIT_MB).toBe(100);
  });

  it('classifies the hook’s connection error as its own cap', () => {
    expect(
      classifyUploadError({
        type: 'about:blank',
        title: VIDEO_TOO_LARGE_FOR_CONNECTION,
        status: 413,
        detail: '',
      }),
    ).toEqual({kind: 'quota_exceeded', cap: 'connection', message: ''});
  });

  it('keeps the server’s own 413 as the size cap (the control)', () => {
    expect(
      classifyUploadError({
        type: 'https://motodiag.dev/problems/video-too-large',
        title: 'video-too-large',
        status: 413,
        detail: 'video exceeds 512 MB',
      }),
    ).toEqual({
      kind: 'quota_exceeded',
      cap: 'size',
      message: 'video exceeds 512 MB',
    });
  });

  it('says it in plain words: the limit, a shorter clip, the video kept', () => {
    const copy = quotaExceededCopy('connection', '');
    expect(copy).toContain('over 100 MB');
    expect(copy).toContain('Record a shorter clip');
    expect(copy).toContain('still saved on this phone');
    expect(copy).not.toMatch(/cloudflare|413|<html/i);
  });

  it('shows no server message after it, even if one is passed', () => {
    expect(quotaExceededCopy('connection', '<html>413</html>')).not.toContain(
      '<html>',
    );
  });
});
