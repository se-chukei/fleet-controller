# FleetController Technical Specification

## Streaming Redundancy & Fleet Management System

Version:
1.0

Status:
Architecture Definition

---

# 1. Project Objective

FleetController is an autonomous, fleet-grade streaming redundancy and remote management platform designed for large-scale deployment of 100+ Android TV / Google TV compatible endpoints.

The system provides:

- Reliable unattended video playback.
- Automated live stream switching.
- Local media playback capability.
- Centralized fleet monitoring.
- Remote diagnostics.
- Secure endpoint management.
- Low operational cost.

The initial hardware target is the Google TV Streamer platform. However, the architecture must remain compatible with Android TV / Google TV integrated televisions and other Android-based display endpoints where required system capabilities are available.

The system consolidates endpoint control logic into a single custom native Android application (APK).

The design goal is:

- No recurring third-party MDM licensing fees.
- Maximum visual continuity.
- Broadcast-grade operational reliability.
- Minimal interruption to local users.

---

# 2. System Overview

The FleetController ecosystem consists of:

```
                 Operator

                    |
                    |

          FleetController Dashboard

                    |
              WebSocket

                    |

              Data Bridge

                    |
            HTTP Telebeat Poll

                    |

        Android TV Client APK

                    |

             VLC Playback Engine
```

The system is divided into:

1. Control Plane
2. Media Plane

---

# 3. Control Plane Architecture

The Control Plane manages:

- Device status.
- Commands.
- Configuration.
- Telemetry.
- OTA updates.
- Diagnostics.
- Troubleshooting.

All Control Plane communication occurs over a private Tailscale network mesh.

```
Android Endpoint

        |
        |
   Tailscale Mesh
        |
        |

On-Prem Data Bridge

        |
        |
 Dashboard Browser
```

---

# 4. Media Plane Architecture

The Media Plane carries video content.

RTMP streams do not originate from or traverse the Tailscale network.

```
Android Endpoint

        |
        |
   RTMP Playback

        |

External Media Origin
```

Media traffic uses the device's normal network connectivity.

This separation prevents:

- Unnecessary Tailscale bandwidth usage.
- Control traffic congestion.
- Increased latency.

---

# 5. Network Architecture

## 5.1 Tailscale Mesh

All deployed endpoints and the Data Bridge participate in a private Tailscale network.

The Data Bridge binds exclusively to its Tailscale interface.

Responsibilities:

- Telemetry ingestion.
- Command signaling.
- OTA distribution.
- Log transfer.
- Remote diagnostics.

---

## 5.2 Endpoint Communication Model

Endpoints use an outbound-only communication model.

Endpoints:

- Never host management services.
- Never accept inbound dashboard connections.
- Never maintain persistent WebSocket connections.

The endpoint periodically contacts the Data Bridge.

Example:

```
Android Client

POST /api/telebeat

        |

Data Bridge

HTTP 200 Response

        |

State / Command Payload
```

---

# 6. Data Bridge

The Data Bridge is the central fleet orchestration service.

Responsibilities:

- Maintain fleet state.
- Receive endpoint telemetry.
- Generate command responses.
- Host dashboard WebSocket connections.
- Maintain configuration state.
- Manage OTA packages.
- Coordinate troubleshooting sessions.
- Provide diagnostic data.

The Data Bridge runs on an on-premise server environment.

Reference implementation:

- Linux server.

Supported possibility:

- Windows server deployment where required.

The architecture must not depend on Linux-specific functionality unless explicitly documented.

---

# 7. Network Security Model

The system uses Tailscale ACLs.

Recommended roles:

## Administrators

Tag:

```
tag:admin
```

Capabilities:

- Full management access.
- Dashboard access.
- Diagnostics.

---

## Endpoints

Tag:

```
tag:endpoints
```

Capabilities:

- Outbound communication only.
- Telebeat submission.
- OTA retrieval.
- Diagnostic upload.

Endpoints cannot initiate connections to dashboard services.

---

# 8. Endpoint Android Application

The endpoint runs a custom native Android application.

The application operates as:

- Persistent background service.
- Device management layer.
- Playback coordinator.
- Feature execution framework.

The application must support:

- Android TV.
- Google TV.
- Android-based integrated televisions.

---

# 9. Core Control Loop

The endpoint executes a high-frequency telebeat loop.

Purpose:

- Report health.
- Receive instructions.
- Apply configuration changes.

---

## 9.1 Telebeat Timing

Base interval:

```
2 seconds
```

Random jitter:

```
0-2 seconds
```

Purpose:

Prevent fleet synchronization.

Expected average:

```
2s + 1s median jitter = 3 seconds
```

For 100 devices:

```
100 / 3 seconds

≈33 requests per second
```

---

## 9.2 Telebeat Payload

Payload size target:

<500 bytes

Example metrics:

```json
{
 "appState":"STREAM",
 "vlcBitrateMbps":4.2,
 "powerState":"ON",
 "deviceTempC":42,
 "cpuUsagePercent":25
}
```

---

## 9.3 Command Response

The endpoint receives state instructions through the HTTP response.

Example:

```json
{
 "status":"SUCCESS",
 "targetState":"STREAM",
 "streamUri":"rtmp://external-origin/live/main_event",
 "troubleshootActive":true,
 "approvedVersionCode":104
}
```

---

# 10. State Engine Architecture

The endpoint operates through a finite state machine.

Primary states:

```
STANDBY

STREAM

PLAYBACK
```

---

# 11. Feature Module Architecture

The endpoint uses a modular feature registry.

All functionality must be implemented as independent feature modules.

Core interface:

```kotlin
interface BaseFeatureModule {

    val targetState: OperationalState

    fun onStateEnter(
        context: Context,
        arguments: Bundle?
    )

    fun onConfigurationUpdate(
        arguments: Bundle?
    )

    fun onStateExit(
        context: Context
    )
}
```

---

# 12. Registered Feature Modules

## STANDBY

Module:

```
VlcNetworkStreamModule
```

Function:

- Ambient/background RTMP playback.

---

## STREAM

Module:

```
VlcNetworkStreamModule
```

Function:

- Primary live event RTMP playback.

---

## PLAYBACK

Module:

```
UsbMediaStorageModule
```

Function:

- Detect USB media.
- Parse files.
- Provide local playback.

---

# 13. State Transition Logic

When a telebeat response arrives:

## Same State

Example:

```
STREAM -> STREAM
```

Action:

```
onConfigurationUpdate()
```

---

## State Change

Example:

```
STANDBY -> STREAM
```

Process:

1. Current module receives:

```
onStateExit()
```

2. New module receives:

```
onStateEnter()
```

---

# 14. VLC Playback Architecture

VLC for Android remains the playback engine.

Responsibilities:

- RTMP decoding.
- Local media playback.
- Network stream handling.

FleetController does not implement its own decoder.

---

# 15. User Priority Model

Local user interaction has priority.

Priority order:

```
1. Physical local user action

2. Endpoint feature policy

3. Fleet desired state
```

Example:

USB inserted:

```
Server:
STREAM

Local:
USB Playback

Result:
PLAYBACK
```

---

# 16. Live Stream Notification Behavior

When a live stream begins:

The endpoint displays:

- Red live indicator.
- Temporary "Live Stream Started" message.

The notification:

- Does not immediately interrupt local playback.
- Allows the user to choose joining the stream.

---

# 17. Troubleshooting System

Remote troubleshooting must not interrupt broadcast output.

Capabilities:

- Remote visual monitoring.
- Remote input injection.
- Diagnostic capture.

---

# 18. Dual Player Handoff

VLC requires different rendering modes for:

- Normal playback.
- Screen capture troubleshooting.

The system uses two VLC players.

Normal:

```
Player A

SurfaceView

Active Output
```

Troubleshooting:

```
Player B

TextureView

Warm-up

↓

Seamless switch

↓

Capture enabled
```

The active player is never destroyed until replacement playback is ready.

---

# 19. OTA Update System

The endpoint uses Android Device Owner capabilities.

Updates are performed using Android PackageInstaller.

Process:

1. Endpoint receives approvedVersionCode.
2. APK downloads from Data Bridge.
3. PackageInstaller installs silently.
4. Application restarts.

No external MDM platform is required.

---

# 20. Self Healing System

The endpoint uses:

## Foreground Service

Provides:

- Persistent execution.
- START_STICKY restart behavior.

---

## WorkManager Health Check

Provides:

- Periodic validation.
- Recovery from stalled services.

---

# 21. RAM Buffered Logging

Logs remain memory resident.

Design:

- FIFO ring buffer.
- Maximum size: 500KB.
- No continuous disk writes.

When requested:

Endpoint uploads logs through Data Bridge.

---

# 22. USB Playback Handling

USB insertion triggers:

```
android.hardware.usb.action.USB_DEVICE_ATTACHED
```

Behavior:

1. Validate authorization.
2. Override network playback.
3. Scan media.
4. Start local playback.

Disconnect handling:

- 5-second debounce.
- Prevent false disconnect events.

After confirmed removal:

- Return to server-defined state.

---

# 23. Device Provisioning

Initial deployment targets Google TV Streamer devices.

The provisioning system must remain compatible with:

- Android TV televisions.
- Managed Android TV devices.

Provisioning includes:

- Developer access.
- APK installation.
- Device Owner enrollment where supported.
- Tailscale enrollment.
- Power management configuration.

---

# 24. Operational Philosophy

FleetController follows these principles:

## Reliability

Endpoints must operate unattended.

## Separation

Control traffic and media traffic remain independent.

## User Respect

Automation should not unnecessarily interrupt local users.

## Maintainability

Features must be modular.

## AI Compatibility

AI development tools must preserve architectural boundaries.
