# FleetController AI Development Guide

## Purpose

This document defines rules and expectations for AI coding agents working on the FleetController project.

AI agents are valuable for:

- Code generation.
- Refactoring.
- Debugging.
- Documentation.
- Test creation.
- Implementation assistance.

However, AI agents must preserve the established architecture and system intent.

Before making significant changes, AI agents must read:

```
TECHNICAL_SPEC.md
ARCHITECTURE.md
SYSTEM_DESIGN.md
DECISIONS.md
```

---

# 1. Core AI Development Principles

## Preserve Architecture Over Local Optimization

Do not make changes that improve one component while violating system design.

Example:

Bad:

> Move endpoint playback logic into the Dashboard because it is easier to manage.

Correct:

> Keep playback decisions inside the Android Client.

---

# 2. Respect Component Boundaries

The system has three primary boundaries:

```
Dashboard

    |

Data Bridge

    |

Android Client

    |

VLC Playback
```

Each component has defined responsibilities.

---

# 3. Dashboard Rules

The Dashboard is an operator interface.

The Dashboard may:

- Display fleet information.
- Send administrative requests.
- Modify configuration.
- Control troubleshooting sessions.

The Dashboard must not:

- Directly communicate with endpoints.
- Control VLC.
- Implement endpoint state logic.
- Become responsible for playback.

---

# 4. Data Bridge Rules

The Data Bridge is the fleet orchestration layer.

The Data Bridge may:

- Maintain device state.
- Receive telebeats.
- Generate endpoint responses.
- Manage OTA packages.
- Host dashboard WebSockets.

The Data Bridge must not:

- Decode video.
- Become a media server unless specifically designed.
- Replace endpoint logic.

---

# 5. Android Client Rules

The Android Client is the endpoint runtime.

The Android Client is responsible for:

- State Engine.
- Feature Registry.
- Playback control.
- Local user interaction.
- Device health.
- Diagnostics.
- Updates.

Do not simplify the client into a thin playback wrapper.

---

# 6. State Machine Rules

The Android Client operates through defined states:

```
STANDBY

STREAM

PLAYBACK
```

Do not create hidden states without documentation.

New states require:

1. Architectural review.
2. SYSTEM_DESIGN.md update.
3. DECISIONS.md update if significant.

---

# 7. Feature Module Rules

New functionality should be implemented as Feature Modules.

Preferred:

```
New Capability

        |

New Feature Module

        |

Feature Registry
```

Avoid:

- Adding unrelated logic to the core service.
- Creating large monolithic classes.
- Mixing playback, networking, and UI logic.

---

# 8. VLC Rules

VLC for Android is the approved playback engine.

Do not:

- Replace VLC without approval.
- Implement a custom decoder.
- Move playback into browser technologies.

VLC responsibilities:

- Decode media.
- Handle RTMP playback.
- Play local media.

FleetController responsibilities:

- Decide when playback occurs.
- Manage player lifecycle.
- Report status.

---

# 9. Network Rules

## Control Plane

Uses:

```
Tailscale
```

For:

- Commands.
- Telemetry.
- OTA.
- Diagnostics.
- Management.

---

## Media Plane

Uses:

```
Normal network interfaces
```

For:

- RTMP streams.
- External media sources.

Never route live video through Tailscale unless explicitly requested.

---

# 10. Endpoint Communication Rules

Endpoints use:

```
Outbound HTTP polling
```

The endpoint:

- Sends telebeats.
- Receives JSON responses.

The endpoint does not:

- Accept inbound commands.
- Host WebSockets.
- Expose management ports.

---

# 11. Local User Priority Rules

Local user actions have priority.

Priority:

```
1. Local user action

2. Endpoint policy

3. Fleet desired state
```

Do not create behavior that unexpectedly interrupts local users.

Example:

Incorrect:

```
Live stream starts

Force stop USB playback
```

Correct:

```
Live stream starts

Show notification

Allow user choice
```

---

# 12. Hardware Platform Rules

The initial deployment platform is:

```
Google TV Streamer
```

However:

The architecture must support:

- Android TV televisions.
- Google TV devices.
- Compatible managed Android TV hardware.

Do not hard-code assumptions that only apply to one device model.

---

# 13. Deployment Rules

The Data Bridge is deployed on-premise.

Reference environment:

```
Linux
```

Possible environment:

```
Windows Server
```

Avoid unnecessary platform-specific assumptions.

---

# 14. Security Rules

Do not weaken the private network model.

Preserve:

- Tailscale communication.
- Endpoint isolation.
- Outbound-only endpoint behavior.

Do not introduce:

- Public APIs.
- Direct device exposure.
- Cloud dependency.

without explicit architectural approval.

---

# 15. Documentation Rules

When making architectural changes:

Update appropriate documents:

```
TECHNICAL_SPEC.md
ARCHITECTURE.md
SYSTEM_DESIGN.md
DECISIONS.md
```

When adding features:

Update:

```
ROADMAP.md
```

When changing setup:

Update:

```
README.md
```

---

# 16. Code Quality Rules

Prefer:

- Small changes.
- Clear naming.
- Separation of concerns.
- Testable components.

Avoid:

- Large rewrites.
- Unnecessary dependencies.
- Changing working architecture for style preferences.

---

# 17. Before Making Changes

AI agents should:

1. Identify affected component.
2. Read relevant documentation.
3. Explain proposed approach.
4. Confirm compatibility with architecture.

---

# 18. When Uncertain

If a request conflicts with documented architecture:

Do not silently choose a solution.

Instead:

1. Identify the conflict.
2. Explain trade-offs.
3. Request clarification.

---

# 19. Long-Term Goal

The purpose of AI assistance is to accelerate development while preserving:

- Reliability.
- Maintainability.
- Security.
- User experience.
- Architectural integrity.

AI should act as a senior engineering assistant, not an uncontrolled code generator.
