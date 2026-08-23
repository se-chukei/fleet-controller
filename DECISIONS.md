# FleetController Architectural Decisions

## Purpose

This document records important architectural decisions made during the development of FleetController.

The purpose is to preserve design intent and prevent future changes from unintentionally reversing important decisions.

AI coding agents and developers should review this document before proposing architectural changes.

---

# ADR-001: Use a Monorepo Structure

Date:
2026-08-01

Status:
Accepted

## Decision

FleetController is maintained as a single repository containing:

```
FleetController/

├── dashboard/
├── client/
├── ARCHITECTURE.md
├── SYSTEM_DESIGN.md
├── AI_GUIDE.md
├── ROADMAP.md
└── DECISIONS.md
```

## Reason

Although the dashboard and Android client are separate deployable applications, they are part of the same product.

Changes often affect multiple components:

- API contracts.
- State behavior.
- User workflows.
- Device configuration.

A shared repository provides better visibility for developers and AI coding agents.

## Alternatives Considered

### Separate repositories

Rejected because:

- AI agents have limited context.
- Architectural documentation becomes duplicated.
- Cross-component changes become harder to manage.

---

# ADR-002: Dashboard Does Not Directly Control Playback

Date:
2026-08-01

Status:
Accepted

## Decision

The dashboard communicates desired behavior through the Data Bridge.

The dashboard does not directly control VLC or playback execution.

Architecture:

```
Dashboard

    |

    v

Data Bridge

    |

    v

Android Client

    |

    v

VLC
```

## Reason

This creates clear separation between:

- Operator intent.
- Device decision-making.
- Playback execution.

It allows devices to apply local policy before taking action.

## Alternatives Considered

### Direct dashboard-to-device commands

Rejected because:

- Increases coupling.
- Makes local policy difficult.
- Reduces offline resilience.

---

# ADR-003: Android Client Has Final Playback Authority

Date:
2026-08-01

Status:
Accepted

## Decision

The Android client is responsible for deciding how fleet requests are applied.

The client evaluates:

- Current operating mode.
- Auto-switch policy.
- Local user activity.
- Device state.

## Reason

Remote commands should express intent, not blindly override users.

The device must be able to protect the local user experience.

## Priority Order

```
1. Local user intent
2. Client policy
3. Fleet desired state
```

---

# ADR-004: Local User Activity Has Priority Over Automatic Streaming

Date:
2026-08-01

Status:
Accepted

## Decision

Local playback should not be unexpectedly interrupted by fleet events.

Examples:

If a user is watching USB media:

```
PLAYBACK

    |

Live event starts

    |

Notification displayed

    |

User chooses whether to join
```

The system should not automatically terminate local playback unless explicitly configured.

## Reason

The device may exist in public or semi-public environments where users interact directly with the display.

Unexpected interruptions reduce usability and trust.

---

# ADR-005: VLC Remains the Playback Engine

Date:
2026-08-01

Status:
Accepted

## Decision

The Android client uses VLC for Android as the playback engine.

FleetController manages playback state and commands but does not implement its own decoder.

## Reason

VLC provides:

- Broad codec support.
- Mature streaming support.
- RTMP compatibility.
- Proven playback reliability.

Maintaining a custom media pipeline would significantly increase complexity.

## Alternatives Considered

### Custom FFmpeg playback pipeline

Rejected for initial implementation because:

- Requires significant development effort.
- Increases maintenance burden.
- Duplicates functionality already provided by VLC.

### Browser-based playback

Rejected because:

- Codec support is more limited.
- Less suitable for broadcast-style deployment.

---

# ADR-006: Data Bridge Runs On-Premise

Date:
2026-08-01

Status:
Accepted

## Decision

The Data Bridge service will run on an on-premise server.

## Reason

The system is intended for controlled deployments where:

- Reliability is important.
- Network ownership is controlled.
- Data should remain within the organization.

## Benefits

- Predictable operation.
- Local network performance.
- Easier troubleshooting.
- Reduced cloud dependency.

---

# ADR-007: Tailscale Is the Network Transport Layer

Date:
2026-08-01

Status:
Accepted

## Decision

FleetController devices communicate with the Data Bridge over Tailscale.

## Reason

Tailscale provides:

- Encrypted communication.
- Device identity.
- No port forwarding requirements.
- Simple remote management.

The application should not depend on exposing services directly to the public internet.

## Architecture

```
Android TV Client

        |

    Tailscale

        |

On-Prem Data Bridge
```

---

# ADR-008: Configuration Is Externalized

Date:
2026-08-01

Status:
Accepted

## Decision

Environment-specific configuration should not be hard-coded.

Examples:

- Data Bridge address.
- Server settings.
- Deployment environment.

Configuration should be provided through environment variables or configuration files.

## Reason

The same software should support:

- Local development.
- Testing.
- Production deployment.

Example:

Development:

```
DATA_BRIDGE_URL=http://localhost:8080
```

Production:

```
DATA_BRIDGE_URL=http://fleet-controller-server:8080
```

---

# ADR-009: AI Agents Must Work Within Defined Boundaries

Date:
2026-08-01

Status:
Accepted

## Decision

AI coding agents such as Jules must follow documented architecture rules.

Required reading:

```
ARCHITECTURE.md
SYSTEM_DESIGN.md
AI_GUIDE.md
DECISIONS.md
```

before making significant changes.

## Reason

AI agents are capable of rapidly changing code but may optimize for local simplicity instead of system-wide design goals.

Documentation preserves architectural intent.

---

# ADR-010: Notifications Should Minimize Interruption

Date:
2026-08-01

Status:
Accepted

## Decision

Live stream notifications should inform users without forcing immediate action.

Initial design:

- Red live indicator.
- Temporary "Live Stream Started" message.
- User-controlled join action.

## Reason

The system should balance:

- Fleet awareness.
- User autonomy.
- Minimal disruption.

---

# Future Decisions

Future architectural decisions should be added here when they affect:

- System boundaries.
- Communication methods.
- User experience philosophy.
- Deployment strategy.
- Major technology choices.

# ADR-011: Device Naming Model

Date: 2026-08-23  
Status: Accepted

## Decision

Two distinct names are used:

1. **Main display name** (bold, primary on dashboard)  
   - Admin-controlled, may contain Japanese characters.  
   - Temporary value for tech test: `"テスト拠点1"`.  
   - Must be editable from the dashboard for v1.

2. **Secondary / device name** (shown next to IP)  
   - Comes from the Android device (Bluetooth name → `Build.MODEL`).

Syncing either name into the Tailscale machine name is explicitly out of scope for the October target and is recorded as future work.

---

# ADR-012: Offline Telemetry Display Rules

Date: 2026-08-23  
Status: Accepted

## Decision

When a device is offline (`online: false`):

- Status indicator = grey.
- Displayed status text = `OFFLINE`.
- All live telemetry values (bitrate, temperature, CPU, power state, uptime, etc.) are hidden or shown as unavailable.

When the device returns to online, normal telemetry is restored.

---

# ADR-013: OTA Update Safety

Date: 2026-08-23  
Status: Accepted

## Decision

OTA updates must be recoverable. Bricking a device is not an acceptable failure mode.

Required approach:

- Retain previous APK (A/B or equivalent retention).
- Post-install health window based on successful telebeats and absence of crash loop.
- Automatic rollback on failure.
- Staged rollout (1 → small cohort → rest) until the process is stable.
- OTA controls live in the Admin section of the dashboard.

---

# ADR-014: Client Modularity Approach (October)

Date: 2026-08-23  
Status: Accepted

## Decision

STREAM, STANDBY and PLAYBACK are implemented as clean internal modules inside a **single APK**.

PLAYBACK remains dormant unless a USB drive is inserted.  
Runtime or build-time “suite” switching (different feature sets per use case) is deferred.

This supports control-room, head-end and direct-display deployments without multiplying binaries for the October target.

---

# ADR-015: Thermal Protection

Date: 2026-08-23  
Status: Accepted

## Decision

On sustained high temperature or repeated unrecoverable stalls the device enters a **thermal pause**:

- Decoder / heavy playback activity is stopped.
- An on-screen warning is displayed stating that the device cannot be used until the temperature drops below the threshold for a sustained period.
- Telebeat continues so the dashboard retains visibility.
- Normal operation resumes only after the temperature condition is cleared.

---

# ADR-016: Primary Hardware Target

Date: 2026-08-23  
Status: Accepted

## Decision

Primary target platform is **Google TV Streamer**.

Support for built-in Android TV (television sets) is Later / Exploratory.  
USB playback may be limited or omitted on built-in TVs.
