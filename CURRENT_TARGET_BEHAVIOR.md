# CURRENT TARGET BEHAVIOR — Android Client Prototype (Phase 3/4 Focus)

**Status:** Authoritative for all current implementation work  
**Priority:** This document overrides broader design docs when there is any conflict during the current prototype phase.

AI agents must treat the behavior described below as non-negotiable.  
Do not “improve”, expand, or reinterpret it.

---

## 1. Cold Start Behavior (Zero-Touch)

On device power-on or OS reboot:

1. `RECEIVE_BOOT_COMPLETED` must automatically start `FleetService`.
2. The standard Google TV home screen must **not** be shown.
3. `FleetService` starts as a foreground service using `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`.
4. A `PARTIAL_WAKE_LOCK` is acquired and held.
5. Immediately on start, the client performs an HTTP request to the Data Bridge to obtain current state.
6. Playback begins at once:
   - If state = `STREAM` → play the live event RTMP/RTSP URL
   - If state = `STANDBY` (or offline with cached config) → play the ambient RTMP stream
7. Background telebeat/polling loop and self-healing watchdog are started.

**Success criterion:** Plug in power → device boots → full-screen video is playing with no user interaction.

---

## 2. Telebeat / Polling Behavior

- Interval: base 2 seconds + random jitter of 1–3 seconds (total ~2–5 s)
- Each cycle:
  - Uplink: send telemetry (deviceId, appState, bitrate, cpu/temp, ram, uptime, etc.)
  - Downlink: receive target state + streamUrl (+ any other config)
- Delta-driven switching only:
  - If state and streamUrl are unchanged → do nothing (keep current playback)
  - If state or streamUrl changed → switch playback immediately

---

## 3. STREAM vs STANDBY Behavior

**STREAM**
- Triggered by Data Bridge (webhook or dashboard)
- Play the provided live event URL
- Higher bitrate / lower latency caching profile

**STANDBY**
- Default / ambient state
- Play the ambient multicam (or configured standby) URL
- Lower bitrate profile
- Display must stay fully active and ready for instant switch to STREAM

**PLAYBACK** (USB/local) is out of scope for this prototype phase.

---

## 4. Notification & On-Screen Indicator Behavior

**Android System Foreground Notification (Required)**
- Persistent low-priority ongoing notification required by the OS for the media playback foreground service.
- Example text: `Fleet Controller – State: STREAM` (or `STANDBY` / `PLAYBACK`).

**Dashboard Notifications**
- Device marked OFFLINE if telebeats stop for > 15 seconds.

**On-Screen Live Indicator (In Scope – Discreet Only)**

When the device is in **STANDBY** or **PLAYBACK** and a live stream becomes available (but the user has not joined it):

1. A **red dot** appears in the **lower-left corner** of the screen.
2. Alongside the red dot, temporary text is shown in the form:  
   `Stream is Live: ##event title##`
3. After a short duration (exact timing still TBD – implement as a configurable value, default suggestion 8–12 seconds), the text fades out or disappears.
4. The **red dot remains visible** as a persistent, discreet indicator that a live stream is available.
5. The indicator must be minimal and must not significantly obstruct content.

**Rules:**
- This indicator is **only** shown when the current state is STANDBY or PLAYBACK.
- When the user joins the stream (transitions to STREAM), the indicator is removed.
- Do not implement toast messages, full banners, or any more prominent overlay in this phase.
- Keep the implementation lightweight (preferably a simple Compose or View overlay, not a heavy dialog/system UI).

---

## 5. Definition of Success (Google TV Streamer)

The prototype is considered successful only when all of the following are true:

- [ ] Zero-touch: power on → auto-starts → full-screen video playing
- [ ] State change (STANDBY ↔ STREAM) is visible on the TV within one polling cycle (~2–3 seconds)
- [ ] Continuous playback for 48+ hours without crash, black screen, or HDMI sleep
- [ ] Device appears green on the dashboard with live telemetry
- [ ] Network or stream loss is automatically recovered by the watchdog when connectivity returns
- [ ] When a live stream starts while the device is in STANDBY (or PLAYBACK), a red dot + temporary “Stream is Live: [title]” text appears in the lower-left corner. Text disappears after a short time, leaving only the red dot.
- [ ] No user interaction or remote control input is required after initial power-on

---

## Strict Rules for AI Agents

- Implement **only** what is required to satisfy the behavior above.
- Do not add new states, new UI, new modules, or “improvements” unless explicitly requested.
- Do not change the foreground service type away from `MEDIA_PLAYBACK` without approval.
- Do not introduce on-screen overlays beyond the discreet red-dot indicator described above.
- Prefer the smallest change that makes the acceptance criteria pass on real hardware.
- When in doubt, re-read this document and ask for clarification instead of inventing behavior.

---

## October Success Gate (5–10 devices)

The prototype is considered ready for limited rollout only when all of the following are true on real Google TV Streamer hardware:

- [ ] Zero-touch: power on → auto-starts → full-screen video
- [ ] STANDBY ↔ STREAM changes visible within one polling cycle
- [ ] USB PLAYBACK works when media is present; otherwise dormant
- [ ] Continuous operation for extended periods with self-healing
- [ ] Device appears correctly on dashboard (green/grey, telemetry, power, uptime)
- [ ] Offline → grey + OFFLINE + metrics hidden
- [ ] Thermal pause shows on-screen warning and stops playback activity
- [ ] Safe OTA with rollback is proven on at least one device
- [ ] Role separation (配信担当 / Admin) is enforced
- [ ] Admin can edit main device display name
- [ ] Real Tailscale IP is reported
- [ ] Red-dot live indicator works as specified

## Thermal Pause Behaviour

When thermal pause is active:

- Playback / decoding is stopped.
- A clear on-screen message informs the user that the device is unavailable until temperature returns to a safe range for a sustained period.
- Telebeat continues.
- Dashboard shows an appropriate WARNING / thermal state.

## Telemetry Fields (required)

Every uplink must include at minimum:

- deviceId
- nodeName (Android device name)
- nodeIp (Tailscale IPv4)
- appState / status
- bitrate, temp, cpu
- powerState
- uptimeSeconds