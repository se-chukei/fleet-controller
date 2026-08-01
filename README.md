# FleetController

FleetController is a distributed streaming management platform for Android TV devices.

It provides centralized fleet management while preserving local user control.

The system is designed for environments where devices need to:

- Automatically display live streams.
- Operate unattended.
- Play standby content.
- Allow local users to interact with devices.
- Maintain reliable operation over long periods.

---

# System Overview

FleetController uses a distributed architecture:

```
                 Operator
                    |
                    v
        FleetController Dashboard
                    |
                    v
              Data Bridge
                    |
                    v
        Android TV Client Application
                    |
                    v
           VLC for Android Playback
```

The system separates:

## Control Plane

Responsible for:

- Fleet visibility
- Configuration
- Desired state management
- Operator workflows

Components:

- Dashboard
- Data Bridge

---

## Execution Plane

Responsible for:

- Device behavior
- Local policy decisions
- User interaction
- Playback execution

Components:

- Android TV Client
- VLC for Android

---

# Repository Structure

This repository is organized as a monorepo.

```
FleetController/

├── dashboard/
│   Operator web application
│
├── client/
│   Android TV device application
│
├── ARCHITECTURE.md
│   System boundaries and component responsibilities
│
├── SYSTEM_DESIGN.md
│   Detailed behavior and interaction flows
│
├── AI_GUIDE.md
│   Instructions for AI coding agents
│
├── ROADMAP.md
│   Development milestones
│
└── DECISIONS.md
    Architectural decisions and rationale
```

---

# Components

## Dashboard

Location:

```
/dashboard
```

The dashboard is the operator interface.

Responsibilities:

- Monitor deployed devices.
- Configure device behavior.
- View fleet status.
- Manage auto-switch policy.
- Control fleet configuration.

The dashboard does not directly control playback.

---

## Android Client

Location:

```
/client
```

The Android client runs on deployed Android TV devices.

Responsibilities:

- Maintain connection with Data Bridge.
- Evaluate local policy.
- Control VLC playback.
- Display user notifications.
- Report device status.
- Handle local remote-control interaction.

The client is the final authority for playback decisions.

---

# Operating Modes

The Android client supports three primary operating modes.

## STREAM

Live event playback.

Behavior depends on:

- Auto-switch policy.
- Current user activity.
- Device configuration.

---

## STANDBY

Default idle mode.

The device displays standby content and waits for live events.

---

## PLAYBACK

Local user playback.

Examples:

- USB media playback.
- Local VLC browsing.

Local users have priority.

Live events generate notifications but do not automatically interrupt playback.

---

# User Control Model

The system follows this priority order:

```
1. Local user intent
2. Client policy
3. Fleet desired state
```

FleetController communicates desired behavior.

The Android client decides when and how that behavior is applied.

---

# Live Stream Notification Experience

When a live stream becomes available:

1. A red live indicator appears.
2. "Live Stream Started" is displayed temporarily.
3. The indicator remains visible afterward.
4. The user can choose whether to join the stream.

The design goal is:

> Make live content discoverable without unnecessarily interrupting local activity.

---

# Development Setup

## Requirements

### Dashboard

Requirements:

- Node.js
- npm or compatible package manager

Example:

```bash
cd dashboard
npm install
npm run dev
```

---

### Android Client

Requirements:

- Android Studio
- Android SDK
- Android TV test device or emulator

Example:

```bash
cd client
./gradlew assembleDebug
```

---

# Development Workflow

Recommended workflow:

1. Read:

```
ARCHITECTURE.md
SYSTEM_DESIGN.md
AI_GUIDE.md
```

2. Understand the affected component.

3. Make the smallest appropriate change.

4. Update documentation if behavior changes.

5. Test affected components.

---

# AI-Assisted Development

This project is designed to work with AI coding agents such as Jules.

Before making changes, AI agents should read:

```
AI_GUIDE.md
```

Agents must:

- Preserve architecture boundaries.
- Avoid unnecessary rewrites.
- Respect local user priority.
- Update documentation when behavior changes.

---

# Documentation Guide

## ARCHITECTURE.md

Defines:

- System boundaries.
- Component responsibilities.
- Ownership rules.

---

## SYSTEM_DESIGN.md

Defines:

- State behavior.
- Communication flows.
- User workflows.

---

## AI_GUIDE.md

Defines:

- Rules for AI-assisted development.
- Coding expectations.
- Architectural constraints.

---

## ROADMAP.md

Defines:

- Current priorities.
- Future development phases.

---

## DECISIONS.md

Defines:

- Why important technical decisions were made.
- Alternatives considered.
- Long-term rationale.

---

# Current Development Focus

The current priority is:

1. Establish stable monorepo structure.
2. Build Android client foundation.
3. Implement Data Bridge communication.
4. Validate STREAM/STANDBY behavior.
5. Implement local user policy handling.
6. Refine notification workflow.

---

# Project Principles

## Reliability

Devices should operate unattended for extended periods.

---

## Simplicity

Prefer simple, maintainable solutions over unnecessary complexity.

---

## Separation of Responsibility

Each component should have a clear purpose.

---

## User Respect

Remote management should not unexpectedly disrupt local users.

---

# Status

Project stage:

Early development / architecture foundation

The system design is actively evolving.