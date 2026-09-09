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

## Security Engineering Gate (Required Before October Release)

Security work follows a repeatable Scan -> Fix -> Verify cycle and remains within the existing component boundaries and prototype specifications.

- Run npm audit against the committed dashboard lockfile and Gradle/Android dependency checks before each release candidate.
- Keep dependency versions and lockfiles reproducible; remediate known vulnerabilities without forcing major-version upgrades unless compatibility is explicitly tested and approved.
- Keep credentials out of source, logs, build artifacts, and Git history. Store runtime credentials in environment or deployment secret storage, rotate any exposed TVU or webhook credentials, and remove historical secret material when discovered.
- Run Gitleaks and Trivy (vulnerability, secret, and misconfiguration scanners) against the repository and retain redacted reports as release evidence.
- Require TypeScript checks, Android lint, unit tests, and production builds after security dependency changes.
- Validate inbound dashboard, webhook, and Data Bridge inputs for size, type, URL scheme, and allowed destination before state or playback changes. Preserve the Data Bridge -> State Engine -> Feature Registry -> playback architecture.
- Treat cleartext Data Bridge polling as a documented prototype exception only where required by the authoritative target behavior. Do not broaden cleartext access to unrelated endpoints; use the Tailscale control plane and encrypted transport for production control traffic when the specification permits it.
- Review Android exported components, backup behavior, foreground-service permissions, and least-privilege network/storage permissions as part of Android release validation.
- Do not use `npm audit fix --force` or equivalent automatic major upgrades without regression testing against the October acceptance criteria.

**Completion criteria:** No unreviewed High/Critical findings; Medium findings have an owner, mitigation, and documented compatibility decision; no active credentials remain in the repository or its reachable history; all scanners and component checks pass or have an explicitly accepted exception.

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

# Exploratory Track — Per-Device Control & Capability Hooks

This track is intentionally outside the October gate. It defines the extension
points needed for a desktop/mobile operator interface without weakening the
outbound-only endpoint model.

## Operator control surface

The dashboard and a future mobile client should use the same Data Bridge API
and authorization model. They must not connect directly to Android devices.

Initial per-device controls to explore:

- Temporary or persistent operational-state override (`STANDBY`, `STREAM`, or
  `PLAYBACK`) with explicit expiry and a clear return-to-fleet-state action.
- Stream URL injection with URL scheme, destination, and length validation.
- Local playback controls exposed as intent-level commands such as play,
  pause, stop, seek, select media, and return to fleet control where supported.
- Resync, watchdog check, log collection, and reboot as separately authorized
  administrative actions.
- A device detail view that shows command status, acknowledgement, rejection
  reason, expiry, and the last observed device state.

## Contract and modularity requirements

- Represent commands as versioned, auditable records with `commandId`, issuer,
  creation time, expiry, target device, requested capability, arguments, and
  status. Delivery must be idempotent.
- Keep durable desired configuration separate from one-shot commands. The
  device should reconcile both through the existing `/api/sync` polling path.
- Define precedence explicitly: local safety and playback policy, temporary
  device override, device configuration, fleet desired state, then fallback.
- Add capability discovery and a feature-module registry so unsupported controls
  are hidden or rejected rather than silently accepted.
- Require every feature module to expose lifecycle hooks for configuration
  updates, commands, telemetry contribution, health checks, and shutdown.
- Return structured acknowledgement and error data so other modules and
  external controllers can observe the same result as the web UI.
- Enforce role-based authorization, per-device scope, audit logging, replay
  protection, and rate limits before exposing control to mobile clients.

## Suggested delivery order

1. Freeze the Data Bridge command and desired-configuration schema.
2. Implement Android capability discovery, command acknowledgement, and local
   precedence without adding new UI.
3. Replace simulated dashboard mutations with Data Bridge-backed commands.
4. Add a responsive device detail workflow for desktop and mobile browsers.
5. Add a native mobile client only if browser delivery cannot meet the operator
	 workflow or offline requirements.

Success criteria for this track include safe expiry of overrides, deterministic
reconciliation after reconnect, visible command outcomes, and no direct
dashboard-to-device or mobile-to-device connections.

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
| Security scan/fix/verify gate    | Must                  |
| External alert output (GPIO/etc.) | Nice-to-have soon     |
| Built-in Android TV support       | Later / Exploratory   |
| Runtime module suite switching    | Later                 |
| Tailscale name sync               | Later                 |
| Multi-stream routing              | Later                 |
| Mobile operator app               | Later                 |
| Per-device web control            | Later / Exploratory    |
| Native mobile operator app        | Later / Exploratory    |
| Capability discovery + command hooks | Later / Exploratory |

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
- Per-device web controls for state overrides, stream injection, and supported
  local playback intents.
- Shared command API for desktop web, mobile web, and future native clients.
- Capability discovery and lifecycle hooks for externally controlled feature
  modules.

---

# Roadmap Maintenance Rules

When completing a milestone:

- Update completed tasks.
- Record known limitations.
- Note new dependencies.

When adding major functionality:

- Update TECHNICAL_SPEC / SYSTEM_DESIGN / DECISIONS as needed.