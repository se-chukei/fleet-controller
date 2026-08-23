# FleetController System Design

## Purpose

This document describes the functional behavior and interaction flows of FleetController.

It defines:

- Runtime behavior.
- Communication flows.
- State transitions.
- Feature execution.
- Endpoint behavior.
- Operational workflows.

For architectural boundaries, see:

- `ARCHITECTURE.md`

For engineering requirements, see:

- `TECHNICAL_SPEC.md`

---

# 1. System Runtime Overview

FleetController operates as a distributed control system.

The major runtime components are:

```
                    Operator

                       |

                       |

              Dashboard Application

                       |

                    WebSocket

                       |

                  Data Bridge

                       |

              HTTP Telebeat Response

                       |

              Android Client Application

                       |

                 Feature Modules

                       |

              VLC / Local Hardware
```

---

# 2. Communication Model

## 2.1 Dashboard Communication

The Dashboard maintains a WebSocket connection to the Data Bridge.

Purpose:

- Real-time fleet updates.
- Configuration changes.
- Troubleshooting control.
- Administrative actions.

The Dashboard never communicates directly with endpoints.

---

## 2.2 Endpoint Communication

Endpoints operate using a pull-based model.

The Android Client periodically sends:

```
POST /api/telebeat
```

to the Data Bridge.

The response contains:

- Current desired state.
- Configuration updates.
- Troubleshooting status.
- OTA information.

Endpoints do not:

- Listen for commands.
- Maintain WebSockets.
- Accept inbound management connections.

---

## 2.3 External Triggers (TVU Webhooks)

The primary external trigger for fleet-wide mode changes is the TVU webhook.

Flow:

TVU Broadcaster
      │
      │  webhook
      ▼
Data Bridge
      │
      │  updates global desired state
      ▼
Endpoints (via telebeat response)

---

# 3. Telebeat System

## Purpose

The telebeat loop provides:

- Health reporting.
- Command retrieval.
- Configuration synchronization.

---

## Timing

Base interval:

```
2 seconds
```

Random jitter:

```
0-2 seconds
```

Purpose:

Prevent fleet-wide synchronization.

Expected average:

```
3 seconds/device
```

---

## Telebeat Request

Example:

```json
{
  "deviceId": "android-tv-001",
  "appState": "STREAM",
  "vlcBitrateMbps": 4.2,
  "powerState": "ON",
  "deviceTempC": 42,
  "cpuUsagePercent": 25
}
```

---

## Telebeat Response

Example:

```json
{
  "status": "SUCCESS",
  "targetState": "STREAM",
  "streamUri": "rtmp://external-origin/live/main_event",
  "troubleshootActive": false,
  "approvedVersionCode": 104
}
```

---

## Required Telemetry Fields

Every telebeat / sync payload must include at minimum:

- deviceId
- nodeName          (Android device name)
- nodeIp            (Tailscale IPv4)
- appState / status
- bitrate, temp, cpu
- powerState
- uptimeSeconds

---

## Offline Detection & Display

- No successful telebeat for > 15 seconds → device marked `online: false`
- Dashboard must show grey indicator, status text `OFFLINE`, and hide live metrics

---

# 4. Endpoint State Engine

The Android Client operates using a finite state machine.

Primary operational states:

```
STANDBY

STREAM

PLAYBACK
```

---

# 5. Feature Registry

The State Engine does not directly implement feature behavior.

Instead it dispatches execution to Feature Modules.

Concept:

```
Incoming State

      |

State Engine

      |

Feature Registry

      |

Feature Module
```

For the October target, STREAM, STANDBY and PLAYBACK are implemented as clean internal modules inside a single APK. 
PLAYBACK remains dormant unless USB media is present. 
Runtime or build-time suite switching is deferred.

---

# 6. Feature Module Lifecycle

Every feature module follows:

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

# 7. State Transition Logic

## Same State

Example:

```
STREAM

to

STREAM
```

The system calls:

```
onConfigurationUpdate()
```

Used for:

- URL changes.
- Settings changes.
- Troubleshooting changes.

---

## State Change

Example:

```
STANDBY

to

STREAM
```

Process:

1. Current module receives:

```
onStateExit()
```

2. State Engine updates current state.

3. New module receives:

```
onStateEnter()
```
TVU webhook is the primary external trigger for state changes
---

# 8. STANDBY Mode

Purpose:

Provide default background playback.

Feature Module:

```
VlcNetworkStreamModule
```

Responsibilities:

- Maintain standby RTMP stream.
- Recover from playback failures.
- Report playback health.

---

# 9. STREAM Mode

Purpose:

Display live event content.

Feature Module:

```
VlcNetworkStreamModule
```

Responsibilities:

- Receive stream URI.
- Start live RTMP playback.
- Maintain playback continuity.
- Report VLC metrics.

---

# 10. PLAYBACK Mode

Purpose:

Allow local media playback.

Feature Module:

```
UsbMediaStorageModule
```
PLAYBACK is a deliberate user/system choice, not a network-failure fallback.

---

## USB Workflow

When USB storage is attached:

```
USB_DEVICE_ATTACHED

        |

Permission validation

        |

Media scan

        |

File list generation

        |

Local playback
```

---

## Local Override Behavior

USB playback temporarily overrides remote state.

Example:

Server:

```
STREAM
```

Local:

```
USB inserted
```

Result:

```
PLAYBACK
```

After removal:

1. Confirm disconnect.
2. Apply debounce timer.
3. Request next server state.

---

# 11. Live Stream Notification System

When a live stream becomes available:

The endpoint does not automatically interrupt the user unless configured to do so.

Notification:

```
Red Live Indicator

+

"Live Stream Started"
```

Behavior:

- Text notification disappears after limited time.
- Red indicator remains.
- User may choose to join.

---

# 12. Auto-Switch Policy

Each endpoint maintains an auto-switch policy.

Policy can be:

- Viewed remotely.
- Changed remotely.
- Applied locally.

Example:

Auto-switch enabled:

```
STANDBY

        |

STREAM starts

        |

Automatically join
```

Auto-switch disabled:

```
STANDBY

        |

STREAM starts

        |

Notify user

        |

User chooses
```

---

# 13. VLC Playback Architecture

VLC for Android provides decoding.

The application manages:

- Player lifecycle.
- State switching.
- Recovery.
- Rendering mode.

---

# 14. Dual Player Troubleshooting System

Problem:

Normal playback and remote screen capture require different VLC rendering modes.

Solution:

Maintain two VLC players.

---

## Normal Operation

```
Player A

SurfaceView

Active Output
```

Advantages:

- Hardware overlay.
- Lowest overhead.
- Maximum playback stability.

---

## Troubleshooting Activation

When:

```
troubleshootActive=true
```

Process:

1. Keep Player A running.
2. Create Player B.
3. Initialize capture-compatible rendering.
4. Load identical media.
5. Wait for VLC playing confirmation.
6. Switch display layers.
7. Release Player A.

---

## Troubleshooting Shutdown

Reverse process:

1. Create SurfaceView player.
2. Warm up.
3. Wait for stable playback.
4. Switch.
5. Release texture player.

---

# 15. Remote Troubleshooting

Capabilities:

## Visual Monitoring

Captures display output.

Target profile:

```
max-size: 800
bitrate: 1Mbps
fps: 20
audio: disabled
```

---

## Remote Input

Dashboard actions are transferred through the Data Bridge.

Endpoint executes:

- Touch injection.
- Navigation commands.

Implementation uses:

Android Accessibility Service capabilities.

---

## 16. OTA Update System

Requirements for the October gate:

- Previous APK is retained (A/B or equivalent)
- Post-install health window (successful telebeats + no crash loop)
- Automatic rollback on failure
- Staged rollout (1 device → small cohort → rest) until the process is stable
- Controlled from the Admin section of the dashboard

Bricking a device is not an acceptable failure mode.

---

# 17. Health and Recovery

The endpoint uses multiple recovery layers.

---

## Foreground Service

Provides:

- Persistent execution.
- START_STICKY recovery behavior.

---

## WorkManager Watchdog

Provides:

- Periodic health validation.
- Service recovery.

---

## Thermal Protection

On sustained high temperature or repeated unrecoverable stalls the device enters thermal pause:

- Playback / decoding is stopped
- On-screen warning is displayed stating the device cannot be used until temperature returns to a safe range for a sustained period
- Telebeat continues so the dashboard retains visibility
- Normal operation resumes only after the temperature condition is cleared

---

# 18. Logging System

Purpose:

Provide diagnostics without excessive storage wear.

---

## RAM Log Buffer

Properties:

- FIFO ring buffer.
- Maximum 500KB.
- No continuous disk writes.

---

## Log Collection

Workflow:

```
Dashboard requests logs

        |

Data Bridge flags device

        |

Next telebeat response

        |

Client uploads logs
```

---

# 19. Device Provisioning Workflow

Target devices:

- Google TV Streamer.
- Android TV televisions.
- Compatible Android TV hardware.

Provisioning steps:

1. Initial device setup.
2. Enable required management access.
3. Install FleetController APK.
4. Configure Device Owner where supported.
5. Install Tailscale.
6. Join private network.
7. Apply power and sleep configuration.

---

# 20. Design Goals

The system prioritizes:

## Reliability

Devices operate unattended.

## Minimal Interruption

Users retain control.

## Security

Management traffic remains private.

## Modularity

Features are isolated.

## Maintainability

AI and human developers can safely extend the system.
