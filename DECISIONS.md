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
