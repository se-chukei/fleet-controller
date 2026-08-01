# FleetController Development Roadmap

## Purpose

This document defines the implementation roadmap for FleetController.

The roadmap is intended to:

- Guide development priorities.
- Provide AI coding agents with project direction.
- Track progress toward production deployment.
- Prevent work from occurring out of sequence.

This document should evolve as milestones are completed.

---

# Project Vision

FleetController will provide a production-grade fleet management platform for Android TV / Google TV endpoints.

The finished system will provide:

- Automated live stream management.
- Local USB media playback.
- Remote monitoring.
- Secure fleet administration.
- Self-healing endpoint operation.
- Remote troubleshooting.
- OTA updates.

---

# Current Architecture

The system consists of:

```
/dashboard

Operator Web Interface


/data-bridge

Fleet orchestration service


/client

Android TV endpoint application
```

---

# Development Philosophy

Prioritize:

1. Functional end-to-end workflows.
2. Stable architecture.
3. Hardware validation.
4. Operational reliability.

Avoid:

- Premature optimization.
- Large rewrites.
- Adding features before core reliability exists.

---

# Phase 0 — Repository and Documentation Foundation

## Objective

Create a stable development foundation.

---

## Tasks

- [x] Establish unified repository structure.
- [x] Create architecture documentation.
- [x] Create system design documentation.
- [x] Create AI development guidelines.
- [x] Document architectural decisions.

---

## Completion Criteria

AI agents can understand:

- System purpose.
- Component boundaries.
- Design constraints.

---

# Phase 1 — Data Bridge Core

## Objective

Create the central orchestration service.

---

## Tasks

Implement:

- Device registration.
- Telebeat endpoint.
- State storage.
- Configuration storage.
- Dashboard communication layer.

---

## Initial API

Endpoint:

```
POST /api/telebeat
```

Purpose:

Receive:

- Device health.
- Current state.

Return:

- Desired state.
- Configuration.

---

## Completion Criteria

A test client can:

1. Send heartbeat.
2. Receive state response.
3. Change state from dashboard.

---

# Phase 2 — Dashboard Fleet Control

## Objective

Create the operator interface.

---

## Tasks

Implement:

- Device list.
- Online/offline status.
- Current state display.
- Configuration controls.
- Auto-switch policy management.

---

## Completion Criteria

Operator can:

- View connected devices.
- Change endpoint policies.
- Observe state changes.

---

# Phase 3 — Android Client Foundation

## Objective

Create the endpoint runtime.

---

## Tasks

Implement:

- Android project structure.
- Foreground service.
- Boot startup.
- Tailscale connectivity.
- Telebeat communication.
- Logging foundation.

---

## Completion Criteria

Android device:

- Boots automatically.
- Starts FleetController service.
- Communicates with Data Bridge.

---

# Phase 4 — State Engine

## Objective

Implement endpoint decision logic.

---

## Tasks

Implement:

States:

```
STANDBY

STREAM

PLAYBACK
```

Implement:

- State transitions.
- Feature registry.
- Module lifecycle.

---

## Completion Criteria

Endpoint correctly changes behavior based on Data Bridge responses.

---

# Phase 5 — VLC Streaming Integration

## Objective

Enable network stream playback.

---

## Tasks

Implement:

- VLC initialization.
- RTMP playback.
- Stream switching.
- Playback health monitoring.

---

## Completion Criteria

Endpoint can:

- Play standby stream.
- Switch to live stream.
- Recover from playback failure.

---

# Phase 6 — USB Playback

## Objective

Enable local media playback.

---

## Tasks

Implement:

- USB detection.
- Media scanning.
- File indexing.
- Local playback.
- Disconnect handling.

---

## Completion Criteria

User can:

1. Insert USB drive.
2. Browse media.
3. Play content.
4. Return safely to network state.

---

# Phase 7 — User Interaction Model

## Objective

Implement local user control.

---

## Tasks

Implement:

- Live stream notifications.
- Red live indicator.
- Join-stream workflow.
- Auto-switch policies.

---

## Completion Criteria

User experience supports:

Automatic mode:

```
Live event starts

↓

Endpoint joins stream
```

Manual mode:

```
Live event starts

↓

Notification appears

↓

User chooses
```

---

# Phase 8 — Remote Troubleshooting

## Objective

Enable remote visual support.

---

## Tasks

Implement:

- Troubleshooting activation.
- Secondary VLC player.
- Rendering handoff.
- Screen monitoring.
- Remote input.

---

## Completion Criteria

Operator can:

- View endpoint screen.
- Assist users remotely.
- Avoid playback interruption.

---

# Phase 9 — OTA Update System

## Objective

Enable fleet software updates.

---

## Tasks

Implement:

- Version reporting.
- APK hosting.
- Update detection.
- Silent installation.

---

## Completion Criteria

Operator can:

1. Publish new APK.
2. Approve version.
3. Update endpoints remotely.

---

# Phase 10 — Reliability Hardening

## Objective

Prepare for production deployment.

---

## Tasks

Validate:

- 24/7 playback.
- Network recovery.
- VLC crash recovery.
- Power cycling.
- Device reboot behavior.

Implement:

- Watchdog.
- RAM logging.
- Health metrics.

---

## Completion Criteria

Endpoint can operate unattended.

---

# Phase 11 — Fleet Testing

## Objective

Validate multi-device behavior.

---

## Test Targets

Initial:

```
1 device
```

Then:

```
10 devices
```

Then:

```
100+ devices
```

---

## Validate:

- Telebeat stability.
- Network load.
- Synchronization behavior.
- Remote management.
- Recovery scenarios.

---

# Current Milestone

## Milestone 1 — End-to-End Architecture Validation

Objective

Demonstrate a complete working FleetController workflow:

Dashboard
↓
Data Bridge
↓
Telebeat
↓
Android Client
↓
State Engine
↓
VLC

Success Criteria

- Dashboard runs locally.
- Data Bridge runs locally.
- Android APK installs.
- Client telebeats successfully.
- Dashboard can simulate a live event.
- Client transitions between STANDBY and STREAM.
- VLC plays the requested RTMP stream.

Out of Scope

- TVU Search integration
- USB playback
- OTA updates
- Troubleshooting
- Health monitoring

---

# Future Enhancements

Potential future modules:

## Advanced Analytics

- Historical health data.
- Playback statistics.
- Failure prediction.

---

## Content Scheduling

- Time-based playlists.
- Regional programming.

---

## Multi-Stream Management

- Multiple concurrent live events.
- Channel routing.

---

## Expanded Hardware Support

- Additional Android TV platforms.
- Dedicated signage hardware.

---

# Roadmap Maintenance Rules

When completing a milestone:

Update:

- Completed tasks.
- Known limitations.
- New dependencies.

When adding major functionality:

Update:

- TECHNICAL_SPEC.md
- SYSTEM_DESIGN.md
- DECISIONS.md
