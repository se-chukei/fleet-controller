# FleetController Development Roadmap

## Purpose

This document defines the implementation roadmap for FleetController.

It is intended to:

- Guide development priorities.
- Provide AI coding agents with project direction.
- Track progress toward production deployment.
- Prevent work from occurring out of sequence.

This document should evolve as milestones are completed.

---

# Project Vision

FleetController will provide a production-grade fleet management platform for Android TV / Google TV endpoints (primary target: Google TV Streamer).

The finished system will provide:

- Automated live stream management (STANDBY / STREAM).
- Local USB media playback (PLAYBACK).
- Remote monitoring and fleet control.
- Secure role-based administration.
- Self-healing endpoint operation.
- Safe OTA updates with rollback.
- Remote troubleshooting (future).
- Modular client architecture that can later support use-case-specific suites.

---

# Current Architecture
/dashboard          Operator Web Interface
/data-bridge        Fleet orchestration service
/client             Android TV endpoint application (Google TV Streamer primary)

---

# Development Philosophy

Prioritize:

1. Functional end-to-end workflows.
2. Stable architecture.
3. Hardware validation on real Google TV Streamer devices.
4. Operational reliability and zero-touch behaviour.

Avoid:

- Premature optimization.
- Large rewrites.
- Adding features before core reliability exists.
- Over-engineering modularity or multi-suite support before the single-APK path is proven.

---

# October Target (Authoritative)

**Goal:** Bulletproof operation on **5–10 devices**, ready for wider rollout.

Success means:

- Zero-touch power-on → full-screen video.
- Reliable STANDBY ↔ STREAM switching (driven by TVU webhooks + dashboard).
- USB PLAYBACK works when a drive is inserted; otherwise stays dormant.
- Safe OTA with automatic rollback on failure / crash-loop.
- Role separation (配信担当 vs Admin).
- Historical daily logs.
- Admin-editable main device names.
- Real Tailscale IP reported.
- On-screen red-dot live indicator.
- Self-healing + thermal protection with on-device warning.
- Devices appear correctly on dashboard (online/offline, telemetry, power state, uptime).

Built-in Android TV (non-Streamer) support is **Later / Exploratory**.

---

# Phase 0 — Repository and Documentation Foundation

## Status: Complete

- Unified repository structure.
- Architecture, system design, AI guidelines, decisions documents.

---

# Phase 1 — Data Bridge Core

## Objective

Central orchestration service.

## Key capabilities

- Device registration / telebeat (`POST /api/sync` or equivalent).
- Global state storage and distribution.
- SSE (or equivalent) to dashboard.
- Offline detection (15 s threshold).
- Persistence of device state and global fleet state.

## Completion Criteria

Test client can send telemetry, receive desired state, and appear on dashboard.

---

# Phase 2 — Dashboard Fleet Control (Tech-test → Production)

## Objective

Operator interface usable by 配信担当.

## Must-have for October

- Live device list with online/offline.
- Status, bitrate, temp, CPU, power state, uptime.
- When offline: grey dot, status = OFFLINE, metrics hidden.
- Manual stream / status switching.
- Automatic stream / status switching triggered by external TVU webhook
- Admin-editable main display name.
- Basic role separation (配信担当 vs Admin).
- Historical log access (daily rotating files).

## Nice-to-have soon

- Alerting (dashboard + optional external).
- Staged OTA controls.

---

# Phase 3 — Android Client Foundation

## Objective

Reliable endpoint runtime on Google TV Streamer.

## Must-have for October

- Foreground service (`MEDIA_PLAYBACK`).
- Boot-completed auto-start.
- Zero-touch cold start.
- Telebeat loop (2–5 s with jitter).
- Real Tailscale IP reporting.
- Uptime (since process start / last reconnect).
- Power state reporting.
- Modular internal structure (STREAM / STANDBY / PLAYBACK modules) but single APK.

---

# Phase 4 — State Engine

## Objective

Correct state behaviour and self-healing.

## States

- STANDBY
- STREAM
- PLAYBACK (USB; dormant if no media)

## Self-healing rules (October)

| Event                        | Behaviour |
|-----------------------------|-----------|
| Network loss                | Keep last playback; continue telebeat retries; on reconnect adopt current fleet state |
| Bad stream URL              | Fall back to STANDBY / last good URL; keep trying |
| Process death / crash       | Restart via service + boot receiver; resume last or fleet state |
| Device reboot               | Zero-touch return to fleet or last known state |
| Data Bridge unreachable     | Continue last known playback indefinitely |
| Overheat / repeated stalls  | Progressive recovery → thermal pause (decoder stopped, on-screen warning shown, telebeat stays alive). Resume only after temperature stays below threshold for a sustained period |

On-screen thermal warning must clearly indicate the device cannot be used until temperature recovers.

---

# Phase 5 — VLC / ExoPlayer Streaming

## Objective

Stable network playback.

- STANDBY and STREAM URLs.
- Watchdog, soft recovery, hard reset with cooldown.
- Bitrate / stall reporting.

---

# Phase 6 — USB Playback

## Objective

Local media support.

- USB detection.
- Basic playlist support (Must-have for v1).
- PLAYBACK module stays dormant when no USB is present (acceptable for October).

---

# Phase 7 — User Interaction & Indicators

## Objective

Minimal, non-intrusive local UI.

- Discreet red-dot + temporary “Stream is Live” text (lower-left) when live is available but device is not in STREAM.
- Thermal-pause warning screen.
- No other prominent overlays in this phase.

---

# Phase 8 — Safe OTA

## Objective

Recoverable remote updates (Must-have for October).

Best-practice approach:

- Retain previous APK (A/B or equivalent).
- Post-install health window (successful telebeats + no crash loop).
- Automatic rollback on failure.
- Staged rollout (1 device → small cohort → rest) until process is stable.
- Controlled from Admin section of dashboard.

Bricking a device is **not** an acceptable failure mode.

---

# Phase 9 — Remote Troubleshooting (Nice-to-have soon)

- Secondary video path / screen monitoring.
- Remote assistance without interrupting primary playback.

---

# Phase 10 — Reliability Hardening & Fleet Testing

- 48 h+ continuous operation on real hardware.
- Network loss / stream loss / power-cycle recovery.
- 5–10 device soak test (October gate).
- Later: 30 → 100+ device validation.

---

# Feature Priority Summary (October Gate)

| Item                              | Priority              |
|-----------------------------------|-----------------------|
| Core state machine + streaming    | Must                  |
| USB PLAYBACK (dormant if unused)  | Must                  |
| Safe OTA + rollback               | Must                  |
| Role-based access                 | Must                  |
| Historical daily logs             | Must                  |
| Admin-editable main names         | Must                  |
| Real Tailscale IP                 | Must                  |
| Red-dot live indicator            | Must                  |
| Thermal pause + on-screen warning | Must                  |
| External alert output (GPIO/etc.) | Nice-to-have soon     |
| Built-in Android TV support       | Later / Exploratory   |
| Runtime module suite switching    | Later                 |
| Tailscale name sync               | Later                 |
| Multi-stream routing              | Later                 |
| Mobile operator app               | Later                 |

---

# Future Enhancements

- Automated provisioning / kitting.
- Device groups / tags.
- Health score for quick triage.
- Remote log pull.
- Content scheduling.
- Advanced analytics.
- External sounder / GPIO alerts.
- Tailscale machine-name sync.
- Build-time or runtime module suites for different use cases.

---

# Roadmap Maintenance Rules

When completing a milestone:

- Update completed tasks.
- Record known limitations.
- Note new dependencies.

When adding major functionality:

- Update TECHNICAL_SPEC / SYSTEM_DESIGN / DECISIONS as needed.