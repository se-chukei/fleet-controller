# AGENTS.md - FleetController Project Guidelines

## 1. Environment & Directory Structure
- **Branch Context:** Ensure you are working on the active feature/working branch. If directories appear empty, verify git tracking and submodules.
- **Component Boundaries:** Maintain strict separation between Dashboard, Data Bridge, Android Client, and VLC Playback.

## 2. Core Architectural Rules
- **Preserve Architecture:** Do not bypass layers (e.g., Data Bridge → State Engine → Feature Registry → VLC Playback). Never jump straight from Telebeat responses to VLC.
- **Component Rules:** 
  - *Dashboard:* Operator interface only; do not control VLC or talk directly to endpoints.
  - *Data Bridge:* Fleet orchestration layer; do not decode video.
  - *Android Client:* Endpoint runtime (primary target: Google TV Streamer); preserve the State Engine and Feature Registry.
- **Networking:** Use Tailscale for Control Plane; normal network interfaces for Media Plane. Endpoints use outbound HTTP polling only.

## 3. Current Focus (October Gate)
Primary goal: **bulletproof operation on 5–10 Google TV Streamer devices**.

Must-have items are listed in `ROADMAP.md` and `CURRENT_TARGET_BEHAVIOR.md`.  
Do not expand scope beyond the October gate unless explicitly asked.

## 4. Documentation Reference
Before making significant changes, review (in this order when relevant):

- `CURRENT_TARGET_BEHAVIOR.md` (authoritative for current prototype behaviour)
- `ROADMAP.md`
- `DECISIONS.md`
- `TECHNICAL_SPEC.md`
- `ARCHITECTURE.md`
- `SYSTEM_DESIGN.md`
- `AI_GUIDE.md`