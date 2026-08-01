# FleetController Architecture

## Purpose

This document defines the high-level architecture and system boundaries of FleetController.

The goal is to ensure that developers and AI coding agents understand:

- What each component is responsible for.
- Where functionality belongs.
- Which boundaries must not be violated.

For detailed implementation requirements, refer to:

- `TECHNICAL_SPEC.md`
- `SYSTEM_DESIGN.md`

---

# System Overview

FleetController is a distributed streaming management platform designed for large-scale deployment of Android TV / Google TV compatible endpoints.

The system consists of three primary components:

```
                    Operator

                       |
                       |
                  Web Browser

                       |
                   WebSocket

                       |

              FleetController Dashboard

                       |

                       |

                  Data Bridge

                       |

                HTTP Telebeat Poll

                       |

              Android Client APK

                       |

                VLC Playback Engine
```

---

# Core Architectural Principles

## 1. Control Plane and Media Plane Separation

FleetController separates management traffic from media traffic.

This separation is fundamental.

---

# Control Plane

The Control Plane handles:

- Device management.
- Telemetry.
- Commands.
- Configuration.
- OTA updates.
- Diagnostics.
- Troubleshooting.

Transport:

```
Tailscale Private Network
```

Flow:

```
Android Endpoint

      |

Tailscale Mesh

      |

Data Bridge

      |

Dashboard
```

---

# Media Plane

The Media Plane handles video delivery.

Media sources:

- RTMP streams.
- Local USB media.

Media traffic does not traverse the Tailscale management network.

Example:

```
External RTMP Origin

        |

        |

Android Client VLC Engine
```

The endpoint uses its normal network interfaces for media ingestion.

---

# Component Responsibilities

# Dashboard

Location:

```
/dashboard
```

## Purpose

The Dashboard is the operator interface.

It provides:

- Fleet visibility.
- Device monitoring.
- Configuration management.
- Troubleshooting controls.
- Administrative workflows.

## Responsibilities

The Dashboard:

- Maintains WebSocket communication with the Data Bridge.
- Displays fleet state.
- Sends administrative requests.
- Does not directly control endpoints.

The Dashboard does not:

- Connect directly to devices.
- Control VLC.
- Execute endpoint logic.

---

# Data Bridge

## Purpose

The Data Bridge is the central fleet orchestration service.

It acts as the authoritative management layer.

---

## Responsibilities

The Data Bridge:

- Maintains device state.
- Receives endpoint telemetry.
- Generates endpoint command responses.
- Hosts dashboard WebSocket connections.
- Stores configuration state.
- Hosts OTA packages.
- Coordinates diagnostics.

---

## Communication Model

The Data Bridge uses:

Dashboard:

```
WebSocket
```

Endpoint:

```
HTTP outbound polling
```

Endpoints never maintain inbound connections.

---

## Deployment Environment

The Data Bridge is designed for on-premise deployment.

Reference environment:

```
Linux Server
```

Possible supported environments:

```
Windows Server
```

The architecture should avoid unnecessary operating system dependencies.

---

# Android Client APK

Location:

```
/client
```

## Purpose

The Android Client is the endpoint execution platform.

It is not simply a remote VLC controller.

It is responsible for:

- State management.
- Playback orchestration.
- Local user interaction.
- Device health.
- Feature execution.
- Diagnostics.
- Updates.

---

# Endpoint Architecture

The Android Client contains:

```
Android Client APK

├── State Engine
│
├── Telebeat Service
│
├── Feature Registry
│
├── VLC Playback Modules
│
├── USB Playback Module
│
├── Troubleshooting Module
│
├── OTA Update Module
│
└── Health Monitoring
```

---

# State Engine

The endpoint operates through a finite state machine.

Primary states:

```
STANDBY

STREAM

PLAYBACK
```

The Data Bridge provides desired state.

The endpoint determines execution based on:

- Current state.
- Local user actions.
- Policy settings.
- Device conditions.

---

# Feature Module Architecture

Capabilities are implemented as independent modules.

Examples:

```
VlcNetworkStreamModule

UsbMediaStorageModule

TroubleshootingModule

OtaUpdateModule
```

New functionality should be added through modules rather than modifying unrelated core logic.

---

# VLC Playback Layer

VLC for Android is the playback engine.

Responsibilities:

- RTMP decoding.
- Stream playback.
- Local media playback.

FleetController does not implement a custom decoder.

---

# User Control Model

FleetController is designed to balance automation with local user control.

Priority order:

```
1. Local user action

2. Endpoint policy

3. Fleet desired state
```

Remote commands express intent.

The endpoint decides execution.

---

# Example: Live Stream During Local Playback

Scenario:

```
Device is playing USB media

        |

Live event starts

        |

Endpoint receives STREAM directive

        |

Notification displayed

        |

User chooses whether to join
```

The system does not unnecessarily interrupt local activity.

---

# Network Security Model

## Endpoint Security

Endpoints:

- Join the private Tailscale network.
- Communicate outbound only.
- Do not expose management services.

---

## Management Security

Administrative access occurs through:

```
Dashboard

    |

Data Bridge

    |

Tailscale Network
```

---

# Hardware Platform Abstraction

Initial deployment target:

```
Google TV Streamer
```

Supported design targets:

```
Android TV televisions

Google TV devices

Managed Android TV endpoints
```

The architecture must avoid assumptions that only apply to one hardware model.

---

# Deployment Architecture

Production deployment:

```
                 Tailscale Network


 Android TV  --------\
 Android TV ---------+
 Android TV ---------/


              Data Bridge

                    |

              Dashboard Access
```

---

# Design Boundaries

The following boundaries must be preserved.

## Dashboard Boundary

The Dashboard manages.

It does not execute endpoint behavior.

---

## Data Bridge Boundary

The Data Bridge coordinates.

It does not decode video.

---

## Android Client Boundary

The Android Client executes.

It does not become a cloud-managed thin client.

---

## VLC Boundary

VLC handles media decoding.

FleetController handles orchestration.

---

# AI Development Guidance

AI coding agents must:

- Read this document before architectural changes.
- Preserve component boundaries.
- Avoid moving logic between layers without justification.
- Avoid replacing established technologies without review.

Any change affecting architecture should update:

- `TECHNICAL_SPEC.md`
- `SYSTEM_DESIGN.md`
- `DECISIONS.md`
