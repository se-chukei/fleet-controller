# FleetController Architecture and Repository Assessment Report

This assessment report evaluates the current state of the FleetController project repository. It provides a formal, verified evaluation of the source code, directory structures, and system alignment against the planned/documented architecture.

---

## 1. Current Repository Structure Summary

### Identified Components
*   **Dashboard Component (`/dashboard`):** Exists only as a Git subproject pointer (gitlink to commit `bf2c10732cc9872804aa8628640c8265b0ecc4b9`). There is no `.gitmodules` file provided in the repository, making the remote source repository inaccessible from this workspace. Consequently, the local `/dashboard` folder remains entirely empty.
*   **Data-Bridge Component (`/data-bridge`):** Mentioned in `DEVELOPMENT_SETUP.md` as a backend service located under `/data-bridge`. However, **the `/data-bridge` directory is completely missing** from the repository's file tree.
*   **Client Component (`/client`):** Exists only as a Git subproject pointer (gitlink to commit `9d0b46ea48759bb1c2f8865021a637ed5f34e8b9`). Since no `.gitmodules` mapping is defined in the root of the repository, the local `/client` folder remains empty.

### Verification of Repository Structure Against Documentation
*   **Current Reality:** The root repository is populated with all core documentation files (`README.md`, `ARCHITECTURE.md`, `SYSTEM_DESIGN.md`, `TECHNICAL_SPEC.md`, `AI_GUIDE.md`, `DECISIONS.md`, `ROADMAP.md`, `DEVELOPMENT_SETUP.md`).
*   **Documentation Discrepancy:**
    1. The subprojects `client` and `dashboard` are registered in Git's index as git links (`160000` mode), but without a `.gitmodules` configuration or pull credentials for these private sub-repositories, the directories are physically empty placeholder folders.
    2. The `/data-bridge` folder is entirely absent, although documentation refers to its setup and startup instructions inside `/data-bridge`.
*   **Summary:** From a local filesystem perspective, there is a **100% mismatch** between the implied code maturity (setup/dependencies) and the actual physical codebase, as no functional source code is available in this workspace.

---

## 2. Architecture Alignment Review

### Documented Architecture vs. Current Implementation
*   **Alignment:** There is no source code available for analysis. All architectural patterns (Control Plane/Media Plane separation, Tailscale integration, user overriding) remain theoretical design specifications.
*   **Discrepancies / Conflicts:**
    1. **Lack of `.gitmodules`:** Git subprojects cannot be cloned/pulled without valid submodule mappings.
    2. **Missing `data-bridge` Code:** The data bridge is documented as an on-premise orchestration layer, but its source code folder does not exist.
*   **Recommendation:** To align the implementation with the documentation, the project should either be initialized as a true Git monorepo (where `client/`, `dashboard/`, and `data-bridge/` contain source code directly in the main repository) or a valid `.gitmodules` file must be added with correct relative or absolute repository URLs.

---

## 3. Missing or Incomplete Systems

All systems defined in the system design are **100% missing/inaccessible** from the repository codebase:

| System / Subsystem | Status | Requirements Analysis |
| :--- | :--- | :--- |
| **State Engine** | **Missing** | A finite state machine is needed in `client/` to manage operational state transitions between `STANDBY`, `STREAM`, and `PLAYBACK`. |
| **Feature Registry** | **Missing** | A modular feature registration framework implementing `BaseFeatureModule` interfaces is completely absent. |
| **Telebeat Communication** | **Missing** | Requires outbound HTTP polling from the client to the Data Bridge (`POST /api/telebeat`) with a 2s base interval + 0-2s random jitter. |
| **Data Bridge Responsibilities** | **Missing** | Needs a backend application hosting a WebSocket server for the dashboard and an HTTP API for the client endpoints. |
| **VLC Integration** | **Missing** | Needs to integrate `libvlc-android` as the core network streaming decoding engine. |
| **USB Playback** | **Missing** | Requires an Android `BroadcastReceiver` tracking `USB_DEVICE_ATTACHED` with a 5-second disconnect debounce timer. |
| **User Override Behavior** | **Missing** | Needs user priority enforcement: local player interaction must override fleet desired states, generating stream join notifications rather than force-interrupting play. |
| **Troubleshooting Architecture** | **Missing** | Needs a dual-player setup (switching between Player A `SurfaceView` and Player B `TextureView` for remote visual capture) and touch injection via Accessibility Services. |
| **OTA Update Architecture** | **Missing** | Requires Android Device Owner privileges and `PackageInstaller` hooks to support silent version updates. |
| **Health Monitoring** | **Missing** | Needs a sticky Foreground Service (`START_STICKY`) and a periodic WorkManager watchdog to prevent client runtime crashes, alongside a 500KB RAM logging ring buffer. |

---

## 4. Technical Debt Assessment

### Architecture Risks
1.  **Broken Subproject/Submodule References:** Committing empty gitlink folders to the master branch without a `.gitmodules` configuration file creates non-functional, unbuildable directories for other developers and CI/CD pipelines.
2.  **Lack of Monorepo Tooling:** If the project is intended to be a monorepo containing Node.js, React, and Android TV subprojects, it requires workspace orchestration tooling (such as Yarn/PNPM Workspaces, Lerna, or Nx) to manage shared API models, contracts, and builds cleanly.
3.  **VLC Rendering Handoff Complexity:** The "Dual Player Handoff" troubleshooting design is an advanced, hardware-sensitive feature. Spawning a parallel player instance to warm up rendering on a lower-end Android TV box has a high risk of resource exhaustion or hardware codec locking.

### Fragile Areas
*   **USB Disconnect Debouncing:** Physical USB storage on Android TV devices is notoriously prone to false/bouncing disconnect events. If the 5-second debounce is not implemented defensively, the state engine will trigger rapid, visual-disruptive state transitions.
*   **Silent OTA Failures:** Performing silent updates using raw `PackageInstaller` hooks inside Device Owner space risks bricking the device if the new APK crashes on boot. The system lacks a rollback fallback strategy.

---

## 5. Recommended Implementation Order

Based on the current greenfield repository state, we recommend the following **7 sequential development tasks** to bootstrap the codebase:

1.  **Task 1: Unify Monorepo Folder Structure**
    *   *Action:* Remove the broken gitlink references and convert `client/`, `dashboard/`, and a new `data-bridge/` folder into standard, fully version-controlled directories under a single git tree.
2.  **Task 2: Bootstrap the Data Bridge API**
    *   *Action:* Initialize a backend application inside `/data-bridge` implementing the `/api/telebeat` HTTP endpoint, WebSocket server, and basic file-based state storage.
3.  **Task 3: Create the Android Client Gradle Shell**
    *   *Action:* Create a native Android TV Gradle project under `/client` containing a sticky Foreground Service, the Telebeat polling scheduler (with specified jitter), and a RAM logging ring buffer.
4.  **Task 4: Implement State Engine and Feature Registry**
    *   *Action:* Code the central state machine and define the `BaseFeatureModule` lifecycle interface in the client to manage standby and stream play states.
5.  **Task 5: Integrate LibVLC and Build Playback Handoff**
    *   *Action:* Import LibVLC to the client, configure default network stream rendering, and build the dual-player transition logic for remote screen troubleshooting.
6.  **Task 6: Implement USB Detection & Policy Overrides**
    *   *Action:* Implement the USB BroadcastReceiver, files scanner, and the live stream notifications overlay to ensure local user priority.
7.  **Task 7: Build the Web Dashboard**
    *   *Action:* Build a React/Vite operator interface in `/dashboard` that connects to the Data Bridge via WebSockets to monitor online status and trigger troubleshooting.
