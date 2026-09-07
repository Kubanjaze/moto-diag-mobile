# App Store listing

Draft metadata for App Store Connect. **Nothing here has been
submitted.** Character counts are Apple's limits and are asserted by
`tests/test_phase208_docs.py` in the backend repo, because finding out
your app name is 31 characters at upload time is a wasted round trip.

## App information

| Field | Value | Limit |
|---|---|---|
| **Name** | `MotoDiag` | 30 |
| **Subtitle** | `Motorcycle diagnostics & shop` | 30 |
| **Bundle ID** | `com.bandithero.motodiag` | — |
| **Primary category** | Business | — |
| **Secondary category** | Productivity | — |
| **Age rating** | 4+ | — |

Category note: this is a professional tool for shops, not a consumer
utility. Business ranks it against other trade software rather than
against maintenance-log apps for riders, which is the comparison that
flatters it least but converts best.

## Promotional text

*Editable without a new build — use it for what's new this month.*

```
Now with customer share links: send a clean diagnostic report by text
message, no app or account needed on their end.
```

(117 / 170)

## Description

```
MotoDiag is a diagnostic and shop-management tool for motorcycle
mechanics. Read the bike, work the job, bill it, and send the customer
something they can actually read.

DIAGNOSE
Look up any OBD-II fault code, with make-specific detail where it
matters — a code means something narrower on a Harley than it does in
general. Search by symptom when you don't have a code. Browse a curated
knowledge base of real failures on real bikes, with the fix. It works
offline, because shop Wi-Fi does not reach the back bay.

READ THE BIKE
Connect a Bluetooth OBD-II adapter to pull stored fault codes, watch
live sensor data, and record a session you can replay later. Adapter
compatibility is its own knowledge base, because "OBD-II adapter"
covers a lot of ground that does not include most motorcycles.

RUN THE JOB
Intake to invoice, from your hand at the bike instead of a desk in the
other room. Work orders with a triage queue that ranks what to do next.
Parts tracked from ordered to received to installed. Clock in and out
against a job so labour is what happened, not what someone remembered.
Photos and voice notes attached to the work order, transcribed
automatically.

TELL THE CUSTOMER
Generate a diagnostic report or an invoice as a PDF, or send a link
that opens in any browser with no account and no app install. Links
expire, can be revoked, and show the customer view — not your internal
notes or your margins.

BUILT FOR THE FLEET YOU ACTUALLY SEE
Deepest coverage on Harley-Davidson, Honda, Yamaha, Kawasaki and
Suzuki, with generic OBD-II support for everything else.

REQUIRES A MOTODIAG BACKEND
MotoDiag runs against your own MotoDiag server — your shop's data stays
on infrastructure you control. Setup instructions are on GitHub.
```

(1,746 / 4,000)

## Keywords

```
motorcycle,mechanic,obd2,diagnostic,repair,shop,workorder,invoice,dtc,scanner,moto,garage
```

(89 / 100)

No spaces after commas — Apple counts them. Words already in the app
name or subtitle are indexed anyway and are wasted here, which is why
"diagnostics" appears in the subtitle and "diagnostic" in keywords
rather than both in one place.

## Support URLs

| Field | Value |
|---|---|
| **Support URL** | `https://github.com/Kubanjaze/moto-diag/issues` |
| **Marketing URL** | `https://github.com/Kubanjaze/moto-diag` |
| **Privacy policy URL** | ⚠️ **Required before submission — does not exist yet.** See blockers. |

## App privacy questionnaire

Apple asks what you collect. The honest answers, derived from what the
app actually does:

| Data type | Collected? | Notes |
|---|---|---|
| Contact info | **No** | Customer records live on the operator's own server. The app never sends them to us. |
| Health & fitness | No | |
| Financial info | **No** | Invoices are generated on the operator's server. No payment is taken in-app. |
| Location | **No** | No location APIs are used, and no location dependency is installed. The Info.plist previously declared `NSLocationWhenInUseUsageDescription` for a bay-tagging feature that was never built; it was removed in Phase 208, because declaring a permission you never request invites a review question you cannot answer. |
| Photos & video | **Not collected** | Camera and photo library are used to attach media to a work order on the operator's own backend. Nothing goes to a MotoDiag-operated server. |
| Audio | **Not collected** | Voice notes are recorded and transcribed against the operator's backend. |
| Identifiers | **No** | The APNs device token registers with the operator's backend, not ours. |
| Usage data | **No** | No analytics SDK is present. |
| Diagnostics | **No** | No crash-reporting SDK is present. |

The through-line: **MotoDiag operates no server.** Every deployment is
the shop's own. That makes "Data Not Collected" the accurate answer
across the board — but it also means the reviewer will ask what the app
talks to, so the description states the self-hosted requirement plainly
rather than letting them discover it at first launch.

Verify against the final binary's entitlements before filing. If an
analytics or crash SDK is ever added, this table is wrong that day.

## Permission strings

These ship in `ios/MotoDiag/Info.plist` and are what the user reads in
the permission prompt. Vague strings are a common rejection reason.

| Key | String |
|---|---|
| `NSCameraUsageDescription` | MotoDiag uses the camera to capture video of vehicle symptoms (engine startup, idle behavior, visible defects) for diagnostic records. |
| `NSMicrophoneUsageDescription` | MotoDiag uses the microphone to capture voice descriptions of vehicle symptoms during diagnostic work orders. |
| `NSSpeechRecognitionUsageDescription` | MotoDiag converts your spoken symptom descriptions into text for the diagnostic record. |
| `NSPhotoLibraryUsageDescription` | MotoDiag accesses your photo library to attach existing photos or videos to diagnostic work orders. |
| `NSPhotoLibraryAddUsageDescription` | MotoDiag saves diagnostic reports and photos you share to your photo library. |
| `NSBluetoothAlwaysUsageDescription` | MotoDiag connects to your Bluetooth OBD-II adapter to read live diagnostic data from the motorcycle's ECU. |
| `NSBluetoothPeripheralUsageDescription` | MotoDiag connects to your OBD-II adapter over Bluetooth to read live sensor data and fault codes. |

Seven, down from eight: `NSLocationWhenInUseUsageDescription` was
removed in Phase 208. It described tagging work orders with a bay
location — a feature that does not exist, backed by no dependency and no
API call. An undeclared-but-used permission crashes the app; a
declared-but-unused one just makes a reviewer ask why.

## Review notes

```
MotoDiag is a client for a self-hosted backend. It cannot be exercised
without a server, so a demo instance and API key are provided below.

Test account
  Server:  <staging URL>
  API key: <key>

The OBD features need physical Bluetooth hardware and cannot be
exercised in review. Every other feature — work orders, capture,
reports, share links — works against the demo server.
```

## Screenshots

Required: 6.9" and 6.5" displays, up to 10 each.

| # | Screen | Caption |
|---|---|---|
| 1 | Work order list | Your queue, ranked by what to do next |
| 2 | Work order detail | Parts, labour, photos, notes — one job, one screen |
| 3 | DTC detail | Fault codes with the fix, not just the definition |
| 4 | Live OBD data | Watch the bike while it misbehaves |
| 5 | Voice capture | Say it at the bike; it types itself |
| 6 | Report viewer | What the customer sees |

Capture at the largest required size and let App Store Connect scale.
Use real-looking data — placeholder text reads as an unfinished app.

## Blockers before submission

1. **Privacy policy URL** — required, does not exist. A static page is
   sufficient given "Data Not Collected", but it must exist and be
   reachable.
2. **Demo server for review** — the app is useless without a backend, so
   review will fail without one. This is the same host decision as F64.
3. **Screenshots** — none captured yet.
4. **Confirm the privacy table against the shipped binary**, not against
   this document.

See [`testflight.md`](./testflight.md) for the upload runbook.
