# Wireless dev loop — PARKED 2026-07-01 (cable route chosen)

**Status:** Parked, not abandoned. Setup work is done and keeps; resume from here whenever wireless is useful (dev from a different network, forgotten cable, etc.). Written during the 2026-07-01 Cowork session after the F48 backend close.

## What is DONE and verified
- **Tailnet live on both devices** (account: kubanjaze@gmail.com):
  - Mac: `kerwyns-macbook-air` = **100.80.109.103** (standalone Tailscale, bundle `io.tailscale.ipn.macsys`; CLI at `/Applications/Tailscale.app/Contents/MacOS/Tailscale` — `tailscale` is NOT on PATH)
  - iPhone 16 Pro: `iphone171` = **100.70.3.60**
  - Proven: `Tailscale ping iphone171` → `pong from iphone171 (100.70.3.60) via 10.0.0.83:41641 in 103ms` (direct path, not DERP). First attempt gave 10× "timed out / no reply" until the phone-side VPN toggle was actually on — **"registered in device list" ≠ "tunnel up"; the VPN badge in the iPhone status bar is the real tell.**
- **Backend reachable-ready:** `motodiag serve --host 0.0.0.0` (default binds 127.0.0.1 — the flag is required; see `src/motodiag/cli/serve.py:34`).
- **Metro reachable-ready:** `npx react-native start` (Metro v0.84.3, binds all interfaces by default).
- Session-end note: Tailscale on the Mac was later found quit (menu icon gone). Relaunch the app to rejoin — config persists.
- **2026-07-02 update — Mac Tailscale extension can WEDGE**: after an on/off toggle cycle it reached a state where Reconnect silently does nothing (no error, no transition), and app quit + relaunch does not fix it. Escalation path: System Settings → VPN → toggle Tailscale off/on, else reboot the Mac. Not diagnosed further. Same-LAN fallback that needs no VPN at all: use `kerwyns-macbook-air.local` as the host for Metro (`:8081`) and the backend (`:8000`) — works for Safari probes and RN Configure Bundler. iPhone Mirroring verdict: its "Connection Interrupted" flakiness is unrelated to Tailscale (fails identically with TS off) and unrelated to Cowork control (failed with zero automation running); phone reboot is the standard cure.

## What was NEVER completed (the remaining 2 minutes)
1. Phone Safari probe: `http://100.80.109.103:8081/status` → expect `packager-status:running`; then `http://100.80.109.103:8000/healthz` → expect JSON.
2. App hookup: MotoDiag Debug app → shake → Dev Menu → **Configure Bundler** → host `100.80.109.103`, port `8081` → app pulls JS from Mac Metro (watch for `BUNDLE` line).
3. API base URL: `Config.API_BASE_URL` is baked at build time (react-native-config is native). For a no-rebuild override, add a dev-only, DO-NOT-COMMIT tailnet override in `src/api/client.ts` (precedence chain is `options.baseUrl` → `Config.API_BASE_URL` → `DEFAULT_BASE_URL`, see client.ts:12-14) pointing at `http://100.80.109.103:8000`, served live via Metro.
4. Unverified assumption that gated everything: **is the Debug build still installed on the phone?** Never confirmed.

## Cable session checklist (the chosen route)
1. Plug in → tap **Trust** on the phone.
2. Xcode → Window → Devices: enable **Connect via network** (one-time pairing; wireless installs work forever after).
3. Build/install: `npx react-native run-ios --device` (or Xcode Run). This also produces the **first device build with the Phase 196 New-Arch fix** (`ios/Podfile:1 RCT_NEW_ARCH_ENABLED=0`, commit `8a1f8ee`) — the currently-installed build predates it.
4. Then resume the video bug: `git stash pop` (stash@{0}: *wip: multipart fix + upload diagnostic (video task)* — JS-only, live-reloads via Metro, no rebuild) → reproduce upload → read Metro + serve logs.
5. Tailscale is optional once paired — but note tailnet IPs replace the "same LAN, no AP isolation" constraint in `.env.example:2-6` if ever needed.

## Gotchas discovered (so nobody re-hits them)
- macOS app-registry lookups for Tailscale fail by display name; the running process is `io.tailscale.ipn.macsys`.
- iPhone Mirroring repeatedly failed to engage ("Connection Interrupted") even locked + nearby — unresolved, not required for anything above.
- Mac Terminal `tailscale` command not found — use the full app-bundle CLI path above.
