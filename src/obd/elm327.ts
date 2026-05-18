// Phase 196 — ELM327 protocol handshake + response framing.
//
// The ELM327 is a serial AT-command chip. Over BLE (or classic-BT, or
// Wi-Fi) it behaves identically at the protocol layer: you write a
// text command terminated by a carriage return (`\r`), and the chip
// streams back a text response terminated by the `>` prompt
// character. The `>` is the chip telling you "I am ready for the next
// command".
//
// This module is TRANSPORT-AGNOSTIC. It never touches BLE — it only
// knows about a `writeCommand(cmd) => Promise<string>` function (the
// `ObdProvider.writeCommand` surface). That is what lets 196B
// (classic-BT) and 196C (Wi-Fi) reuse the handshake verbatim: the
// handshake is part of the transport-shared layer, built once here.
//
// Init sequence (plan Step 2):
//   ATZ   — reset the chip. Response carries the identifying banner,
//           e.g. "ELM327 v1.5" (genuine) or a clone variant.
//   ATE0  — echo off. Without this the chip echoes every command back
//           into the response stream, doubling what we have to parse.
//   ATL0  — linefeeds off. Responses come `\r`-delimited only.
//   ATSP0 — set protocol to 0 = auto-detect. The chip negotiates the
//           OBD protocol (CAN / ISO / KWP / ...) with the ECU on the
//           first OBD request.
//
// Clone tolerance (Risk 1): the ~$13 clones vary wildly in their
// banner string ("ELM327 v1.5", "ELM327 v2.1", "OBDII to RS232
// Interpreter", "ELM327 v1.5 OBDII"). We recognize the *family*, not
// an exact version. A response that contains no ELM marker at all →
// the connected device is not an OBD adapter → `handshake_failed`.

/** The ELM327 prompt character. The chip emits this when it is ready
 *  for the next command; it terminates every response. */
export const ELM_PROMPT = '>';

/** Carriage return — every command sent to the chip is terminated
 *  with this. */
export const ELM_COMMAND_TERMINATOR = '\r';

/** The init command sequence, in order. Exported so tests + the
 *  FakeObdProvider reference the canonical list rather than
 *  literal-pinning it (Phase 191D SSOT discipline). */
export const ELM327_INIT_SEQUENCE: ReadonlyArray<string> = [
  'ATZ',
  'ATE0',
  'ATL0',
  'ATSP0',
];

/** Substrings (case-insensitive) that mark a response as coming from
 *  an ELM327-family chip. Genuine chips say "ELM327"; many clones say
 *  "OBDII"/"OBD II" in their banner. Either is accepted — the
 *  handshake recognizes the family, not an exact version (Risk 1). */
const ELM_FAMILY_MARKERS: ReadonlyArray<string> = [
  'ELM327',
  'ELM 327',
  'OBDII',
  'OBD II',
  'OBD-II',
];

/** Result of the handshake. On success the recognized banner is
 *  carried through so the screen can show "ELM327 v1.5"; on failure
 *  the reason is carried so the caller can build a `handshake_failed`
 *  ObdConnectionError. */
export type Elm327HandshakeResult =
  | {ok: true; banner: string; rawResponses: string[]}
  | {ok: false; reason: string; rawResponses: string[]};

/** Append a freshly-received chunk to an accumulator and report
 *  whether a full response (terminated by the `>` prompt) has now
 *  arrived. ELM327 responses can arrive in multiple BLE notify
 *  chunks; the caller accumulates until `complete` is true.
 *
 *  Returns the framed `response` (prompt + trailing whitespace
 *  stripped) and any `remainder` that belongs to the next response
 *  (rare, but a fast chip can pipeline). */
export function appendChunk(
  accumulated: string,
  chunk: string,
): {accumulated: string; complete: boolean; response: string; remainder: string} {
  const next = accumulated + chunk;
  const promptIndex = next.indexOf(ELM_PROMPT);
  if (promptIndex === -1) {
    return {accumulated: next, complete: false, response: '', remainder: ''};
  }
  const response = next.slice(0, promptIndex);
  const remainder = next.slice(promptIndex + ELM_PROMPT.length);
  return {
    accumulated: '',
    complete: true,
    response: normalizeResponse(response),
    remainder,
  };
}

/** Normalize a raw ELM327 response: strip the trailing `>` prompt if
 *  present, collapse `\r`/`\n` runs to single spaces, trim. The chip
 *  delimits multi-line responses with `\r`; for banner-matching +
 *  display a single trimmed line is what we want. */
export function normalizeResponse(raw: string): string {
  return raw
    .replace(new RegExp(`\\${ELM_PROMPT}\\s*$`), '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/** True iff `response` looks like it came from an ELM327-family chip.
 *  Case-insensitive family-marker match (Risk 1: tolerant, not
 *  exact-version). */
export function isElmBanner(response: string): boolean {
  const upper = response.toUpperCase();
  return ELM_FAMILY_MARKERS.some((marker) => upper.includes(marker));
}

/** Pull a tidy banner string out of the `ATZ` response for display.
 *  The `ATZ` reply often looks like "ATZ\rELM327 v1.5\r\r" (with echo
 *  on) or "ELM327 v1.5" (echo off). We strip a leading echoed `ATZ`,
 *  then return the first non-empty token-group. */
export function extractBanner(atzResponse: string): string {
  const cleaned = atzResponse.replace(/^ATZ\s*/i, '').trim();
  return cleaned.length > 0 ? cleaned : atzResponse.trim();
}

/** Run the full ELM327 init handshake.
 *
 *  `writeCommand` is the transport-neutral seam: it writes one AT
 *  command and resolves with the chip's framed response (prompt
 *  already stripped). It is supplied by whichever ObdProvider is in
 *  play — BLE today, classic-BT / Wi-Fi in 196B / 196C — so this
 *  function is identical across all transports.
 *
 *  Behavior:
 *  - Sends ATZ first; the response MUST contain an ELM family marker
 *    or the handshake fails with `reason` describing the mismatch.
 *  - Sends ATE0 / ATL0 / ATSP0 in order. These are configuration
 *    commands; a chip that answered ATZ as ELM but errors on a config
 *    command is treated as a (degraded) success — the link is a
 *    genuine adapter, which is all Phase 196 asserts (plan Q2). The
 *    config-command response is still recorded in `rawResponses`.
 *  - Any thrown error from `writeCommand` (timeout, transport drop)
 *    aborts and fails the handshake. */
export async function runElm327Handshake(
  writeCommand: (command: string) => Promise<string>,
): Promise<Elm327HandshakeResult> {
  const rawResponses: string[] = [];
  let banner = '';

  try {
    for (const command of ELM327_INIT_SEQUENCE) {
      const response = await writeCommand(command);
      rawResponses.push(response);

      if (command === 'ATZ') {
        if (!isElmBanner(response)) {
          return {
            ok: false,
            reason:
              response.trim().length === 0
                ? 'The adapter did not respond to the ELM327 reset command (ATZ).'
                : `The device answered "${response.trim()}" — not a recognizable ELM327 OBD-II adapter.`,
            rawResponses,
          };
        }
        banner = extractBanner(response);
      }
    }
  } catch (thrown) {
    const detail = thrown instanceof Error ? thrown.message : String(thrown);
    return {
      ok: false,
      reason: `The ELM327 handshake failed: ${detail}`,
      rawResponses,
    };
  }

  return {ok: true, banner, rawResponses};
}
