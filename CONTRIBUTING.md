FleetController Contributing Guide

Purpose

This document defines the expected development workflow for FleetController.

It applies to:

- Human developers
- AI coding agents
- Automated development tools

The goal is to ensure all contributions preserve the documented architecture while moving the project toward a working production system.

---

Before You Begin

Before making significant changes, read the following documents in order:

1. "TECHNICAL_SPEC.md"
2. "SYSTEM_DESIGN.md"
3. "ARCHITECTURE.md"
4. "DECISIONS.md"
5. "AI_GUIDE.md"
6. "ROADMAP.md"

Treat "TECHNICAL_SPEC.md" as the source of truth if conflicts are found.

If implementation differs from documentation:

- Do not assume the implementation is correct.
- Identify the discrepancy.
- Recommend whether the code or documentation should be updated.

---

Development Philosophy

FleetController is developed using small, end-to-end vertical slices.

Each milestone should produce a working system, even if many features remain as placeholders.

Avoid implementing isolated subsystems that cannot be exercised.

Preferred:

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

Feature Registry

↓

Feature Module

↓

VLC Playback

---

Preserve Architectural Boundaries

The component responsibilities defined in "ARCHITECTURE.md" must be maintained.

Dashboard

- Operator interface
- Fleet visibility
- Configuration

Data Bridge

- Fleet orchestration
- Telebeat endpoint
- Configuration storage
- Dashboard communication

Android Client

- State Engine
- Feature Registry
- Playback orchestration
- Local policy
- Device health

VLC

- Media decoding
- Playback

Do not move responsibilities between components without updating the architecture documentation.

---

Preferred Implementation Order

Development should generally follow this sequence:

1. Data Bridge foundation
2. Telebeat communication
3. Android Client foreground service
4. State Engine
5. Feature Registry
6. VlcNetworkStreamModule
7. Dashboard integration
8. Additional feature modules
9. Troubleshooting
10. OTA updates
11. Health monitoring

When possible, complete one working vertical slice before expanding functionality.

---

Prototype Expectations

Early implementations should be minimal but architecturally correct.

It is acceptable to create:

- Placeholder modules
- Stub implementations
- Simplified UI
- Minimal APIs

It is not acceptable to bypass major architectural layers simply to produce a working prototype.

Temporary code should preserve the intended design.

---

Making Changes

Before modifying code:

1. Understand the affected component.
2. Identify which documentation applies.
3. Keep changes as small as practical.
4. Preserve architecture.
5. Update documentation if behavior changes.
6. Verify the affected functionality.

Large rewrites should be avoided unless specifically requested.

---

Documentation Updates

When changing requirements:

Update:

- "TECHNICAL_SPEC.md"

When changing runtime behavior:

Update:

- "SYSTEM_DESIGN.md"

When changing architecture:

Update:

- "ARCHITECTURE.md"

When making important design decisions:

Update:

- "DECISIONS.md"

When changing setup or usage instructions:

Update:

- "README.md"
- "DEVELOPMENT_SETUP.md"

When completing milestones:

Update:

- "ROADMAP.md"

---

Testing

Every completed milestone should be testable.

Preferred progression:

1. Unit tests
2. Component tests
3. End-to-end local testing
4. Hardware validation

For early milestones, a manually testable end-to-end workflow is acceptable.

---

Pull Requests

Contributions should:

- Solve one logical problem.
- Preserve documented architecture.
- Avoid unrelated refactoring.
- Include documentation updates when required.
- Be small enough to review easily.

---

AI Agent Workflow

AI coding agents should:

1. Synchronize with the latest repository.
2. Read the required documentation.
3. Inspect the existing implementation.
4. Explain the proposed approach.
5. Implement the smallest complete change.
6. Verify the result.
7. Update documentation if necessary.

If uncertain, ask for clarification rather than making architectural assumptions.

---

Project Goal

FleetController is intended to become a reliable, production-grade fleet management platform for Android TV and Google TV devices.

The project prioritizes:

- Reliability
- Maintainability
- Clear separation of responsibilities
- Respect for local users
- Long-term extensibility

Every contribution should move the project toward that goal while preserving the documented architecture.