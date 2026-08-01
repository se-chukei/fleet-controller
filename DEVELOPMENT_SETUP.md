# FleetController Development Setup

## Purpose

This document explains how to prepare a development environment for FleetController.

It covers:

- Repository setup.
- Development tools.
- Running local services.
- Connecting test hardware.
- Development workflow.

For system behavior, see:

- `ARCHITECTURE.md`
- `SYSTEM_DESIGN.md`

For implementation requirements, see:

- `TECHNICAL_SPEC.md`

---

# 1. Development Environment Overview

FleetController consists of three major components:

```
fleet-controller/

├── dashboard/
│
│   Operator Web Interface
│
├── data-bridge/
│
│   Fleet orchestration backend
│
└── client/
    
    Android TV endpoint application
```

---

# 2. Recommended Development Machine

Supported development environments:

Primary:

```
macOS
```

Also supported:

```
Windows
Linux
```

---

# 3. Required Software

## General Tools

Install:

- Git
- Node.js
- npm
- Android Studio
- Java Development Kit (JDK)
- ADB tools

---

# 4. Repository Setup

Clone the repository:

```bash
git clone <repository-url>

cd fleet-controller
```

Install component dependencies:

```bash
cd dashboard
npm install
```

```bash
cd ../data-bridge
npm install
```

Android dependencies are handled through:

```
Android Studio / Gradle
```

---

# 5. Dashboard Setup

## Requirements

- Node.js
- npm

---

## Start Development Server

Example:

```bash
npm run dev
```

The dashboard should start locally.

Example:

```
http://localhost:5173
```

---

# 6. Data Bridge Setup

## Purpose

The Data Bridge provides:

- Endpoint API.
- Dashboard WebSocket service.
- Fleet state management.

---

## Environment Configuration

Create:

```
.env
```

Example:

```env
PORT=8080

DATA_STORAGE_PATH=./data
```

---

## Start Development Server

Example:

```bash
npm run dev
```

Expected:

```
Data Bridge running on port 8080
```

---

# 7. Local Development Network

During development:

```
Developer Computer

        |

        |

Data Bridge

        |

        |

Android Test Device
```

The developer computer acts as the Data Bridge host.

---

# 8. Android Client Setup

## Requirements

Install:

- Android Studio
- Android SDK
- Android SDK Platform Tools

---

## Open Project

Open:

```
client/
```

in Android Studio.

Allow:

- Gradle synchronization.
- Dependency download.
- SDK installation.

---

# 9. Android Device Preparation

Supported test devices:

- Google TV Streamer.
- Android TV television.
- Compatible Android TV hardware.

---

## Enable Developer Mode

On the Android TV device:

1. Open Settings.
2. Navigate to device information.
3. Enable developer options.
4. Enable USB debugging.

---

# 10. Install Test APK

Connect device:

```bash
adb devices
```

Install:

```bash
adb install -r app-debug.apk
```

---

# 11. Development Network Configuration

The Android Client requires access to the Data Bridge.

Example:

```
Data Bridge:

192.168.x.x:8080
```

or:

```
Tailscale IP:

100.x.x.x:8080
```

---

Development configuration:

Example:

```env
DATA_BRIDGE_URL=http://localhost:8080
```

For physical devices:

Replace with the reachable Data Bridge address.

Example:

```env
DATA_BRIDGE_URL=http://100.x.x.x:8080
```

---

# 12. Tailscale Development Setup

Production uses:

```
Private Tailscale Mesh
```

Development may use:

- Local LAN.
- Tailscale.
- USB debugging.

---

Recommended:

Install Tailscale on:

- Development computer.
- Android test device.

Verify:

```bash
tailscale status
```

---

# 13. Running an End-to-End Local Test

## Step 1

Start Data Bridge:

```
npm run dev
```

---

## Step 2

Start Dashboard:

```
npm run dev
```

---

## Step 3

Install Android Client APK.

---

## Step 4

Verify telebeat communication.

Expected flow:

```
Android Client

      |

POST /api/telebeat

      |

Data Bridge

      |

JSON response

      |

Android Client state update
```

---

# 14. Testing State Changes

Example:

Set endpoint state:

```
STANDBY
```

Verify:

- Standby stream plays.

Change:

```
STREAM
```

Verify:

- Live stream starts.

---

# 15. Debugging

## Android Logs

View:

```bash
adb logcat
```

Filter:

```bash
adb logcat | grep FleetController
```

---

## Data Bridge Logs

Check:

```
terminal output
```

---

## Dashboard Debugging

Use:

```
Browser Developer Tools
```

---

# 16. Development Workflow

Recommended order:

1. Understand architecture.
2. Create issue/task.
3. Modify smallest possible component.
4. Test locally.
5. Update documentation if behavior changes.
6. Commit changes.

---

# 17. AI-Assisted Development Workflow

Before asking an AI agent to modify code:

Provide:

```
ARCHITECTURE.md

SYSTEM_DESIGN.md

AI_GUIDE.md

Relevant source files
```

For larger changes:

Also provide:

```
TECHNICAL_SPEC.md

DECISIONS.md
```

---

# 18. Common Development Mistakes

Avoid:

## Direct Dashboard → Endpoint Communication

Incorrect:

```
Dashboard
    |
    |
Android Client
```

Correct:

```
Dashboard

 |

Data Bridge

 |

Android Client
```

---

## Putting Playback Logic in Backend

Incorrect:

```
Data Bridge controls VLC
```

Correct:

```
Android Client controls VLC
```

---

## Ignoring Local User Control

The endpoint must consider:

- Local playback.
- User settings.
- Auto-switch policy.

---

# 19. Production Differences

Development:

```
Laptop

Data Bridge

Test Android Device
```

Production:

```
On-prem Server

        |

Tailscale Mesh

        |

100+ Android Endpoints
```

---

# 20. Keeping Documentation Updated

When changing behavior:

Update:

```
SYSTEM_DESIGN.md
```

When changing architecture:

Update:

```
ARCHITECTURE.md
```

When changing requirements:

Update:

```
TECHNICAL_SPEC.md
```

When making decisions:

Update:

```
DECISIONS.md
```
