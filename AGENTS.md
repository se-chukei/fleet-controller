# AGENTS.md - FleetController Project Guidelines

## 1. Environment & Directory Structure
- **Branch Context:** Ensure you are working on the active feature/working branch. If directories appear empty, verify git tracking and submodules.
- **Component Boundaries:** Maintain strict separation between Dashboard, Data Bridge, Android Client, and VLC Playback (see detailed architectural rules below).

## 2. Core Architectural Rules
- **Preserve Architecture:** Do not bypass layers (e.g., Data Bridge -> State Engine -> Feature Registry -> VLC Playback). Never jump straight from Telebeat responses to VLC.
- **Component Rules:** 
  - *Dashboard:* Operator interface only; do not control VLC or talk directly to endpoints.
  - *Data Bridge:* Fleet orchestration layer; do not decode video.
  - *Android Client:* Endpoint runtime (Google TV Streamer target); preserve the State Engine and Feature Registry.
- **Networking:** Use Tailscale for Control Plane; normal network interfaces for Media Plane. Endpoints use outbound HTTP polling only.

## 3. Documentation Reference
Before making significant changes, review:
- `TECHNICAL_SPEC.md`
- `ARCHITECTURE.md`
- `SYSTEM_DESIGN.md`
- `DECISIONS.md`
