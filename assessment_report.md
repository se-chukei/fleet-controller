# FleetController Architecture and Repository Assessment Report

This assessment report evaluates the current state of the FleetController project repository. It provides a formal, verified evaluation of the source code, directory structures, and system alignment against the planned/documented architecture.

---

## 1. Current Repository Structure Summary

### Identified Components
*   **Dashboard Component (`/dashboard`):** Exists only as a git subproject reference (commit `bf2c10732cc9872804aa8628640c8265b0ecc4b9`). The physical directory is completely empty, and there is no React, Node.js, HTML, or CSS code present.
*   **Data-Bridge Component (`/data-bridge`):** Mentioned in `DEVELOPMENT_SETUP.md` and other documentation as a backend component located under `data-bridge/`. However, **the `data-bridge/` directory does not exist** anywhere in the current repository structure.
*   **Client Component (`/client`):** Exists only as a git subproject reference (commit `9d0b46ea48759bb1c2f8865021a637ed5f34e8b9`). The physical directory is completely empty, and there are no Android project files, Gradle scripts, or Java/Kotlin source files present.

### Verification of Repository Structure Against Documentation
*   **Current Reality:** The root repository is populated with all requested documentation files (`README.md`, `ARCHITECTURE.md`, `SYSTEM_DESIGN.md`, `TECHNICAL_SPEC.md`, `AI_GUIDE.md`, `DECISIONS.md`, `ROADMAP.md`, `DEVELOPMENT_SETUP.md`).
*   **Documentation Discrepancy:**
    1. The subprojects `client` and `dashboard` are registered in Git's index as git links (`160000` gitlink mode), but they lack `.gitmodules` mappings or accessible submodule remotes, rendering them empty placeholder folders on disk.
    2. The `data-bridge` service, described as located under `/data-bridge` in `DEVELOPMENT_SETUP.md`, is **entirely missing** from the file hierarchy.
*   **Summary:** While the theoretical documentation framework (Phase 0 of the roadmap) is complete and highly thorough, the actual software components are entirely absent or non-functional.

---

## 2. Architecture Alignment Review

### Documented Architecture vs. Current Implementation
*   **Alignment:** There is currently zero code implementation. Therefore, there are no areas of functional alignment with the architecture.
*   **Discrepancies:**
    1. **Missing Data-Bridge Subdirectory:** `DEVELOPMENT_SETUP.md` refers to `/data-bridge` with an `npm install` and environment configuration command, but this directory is not present in the repository tree.
    2. **Empty Submodules:** The `client/` and `dashboard/` folders are present in Git as commits (`160000`) but represent broken submodules without a `.gitmodules` file.
*   **Recommendation:** The repository setup needs to be updated to either correctly include the submodules (via a `.gitmodules` file and valid accessible URLs) or the project should be refactored into a standard monorepo folder structure where code resides directly inside `/client`, `/dashboard`, and a new `/data-bridge` directory. We recommend updating the implementation to match the documented layout.

---

## 3. Missing or Incomplete Systems

All systems defined in the architecture and design specifications are currently **100% missing** from the repository codebase. Below is the assessment of these systems:

| System / Subsystem | Status | Requirements Analysis |
| :--- | :--- | :--- |
| **State Engine** | **Missing** | Requires a state machine in `client/` supporting `STANDBY`, `STREAM`, and `PLAYBACK` states. |
| **Feature Registry** | **Missing** | Requires a modular registry pattern implementing `BaseFeatureModule` interfaces for decoupled execution. |
| **Telebeat Communication** | **Missing** | Needs a polling mechanism (`POST /api/telebeat`) in the client with a 2-second base interval and 0-2 second random jitter, returning target states and update parameters. |
| **Data Bridge Responsibilities** | **Missing** | Needs a backend Node.js / Express application (or similar language) acting as a gateway between the Dashboard (WebSocket) and the Client (HTTP API). |
| **VLC Integration** | **Missing** | Requires embedding the VLC for Android library/wrapper to manage RTMP and local media streams. |
| **USB Playback** | **Missing** | Requires an Android receiver for `USB_DEVICE_ATTACHED` and scan/index subroutines with a 5-second disconnect debounce timer. |
| **User Override Behavior** | **Missing** | Needs a clear priority hierarchy where local action overrides remote commands, sending notifications rather than forcing media switches during active usage. |
| **Troubleshooting Architecture** | **Missing** | Needs dual-player handoff logic (switching playback from Player A `SurfaceView` to Player B `TextureView` for remote capture) and Touch Injection via Accessibility Service. |
| **OTA Update Architecture** | **Missing** | Requires Device Owner privileges and Android `PackageInstaller` hooks to support silent version updates. |
| **Health Monitoring** | **Missing** | Requires a Foreground Service (`START_STICKY`) and a periodic WorkManager watchdog to maintain 24/7 endpoint reliability, as well as a 500KB RAM ring buffer for logging. |

---

## 4. Technical Debt Assessment

### Architecture Risks
1.  **Broken Submodule / Gitlink Setup:** The use of git subproject references without `.gitmodules` blocks cloning, building, and tracking code updates across environments.
2.  **Missing Repository Configuration:** The lack of concrete package manifests (`package.json`), build scripts, or Gradle definitions means that no unified dependency versioning, linting, or formatting are enforced.
3.  **VLC Rendering Handoff Complexity:** The "Dual Player Handoff" (described in `SYSTEM_DESIGN.md`) for troubleshooting is highly complex. Managing two active VLC instance lifecycles on lower-end Android TV hardware risks memory saturation and decoder crashes if not coded defensively.

### Fragile Areas
*   **USB Broadcast Debouncing:** Physical USB disconnect signals on Android TV devices can occasionally bounce. Without robust hardware-level debouncing, the client state engine will fluctuate rapidly between `PLAYBACK` and `STREAM`/`STANDBY` modes.
*   **Silent OTA Rollbacks:** Silent installation via `PackageInstaller` using Device Owner permissions is fragile if the downloaded APK fails to start. A lack of automatic fallback/rollback triggers will result in bricked endpoints.

---

## 5. Recommended Implementation Order

To successfully transition this project to a working state, the following **7 sequential development tasks** are recommended:

1.  **Task 1: Resolve Submodule & Folder Architecture**
    *   *Action:* Remove the broken gitlink references and convert `client/`, `dashboard/`, and a new `data-bridge/` directory into a standard, fully version-controlled monorepo structure.
2.  **Task 2: Bootstrap the Data Bridge API**
    *   *Action:* Create a core Node.js application in `data-bridge/` with state/config storage, implementing the `/api/telebeat` endpoint and WebSocket server.
3.  **Task 3: Bootstrap the Android Client Shell**
    *   *Action:* Create a standard Android TV Gradle project in `client/` containing a sticky Foreground Service, the Telebeat Polling Service (with the specified jitter), and a RAM logging ring buffer.
4.  **Task 4: Implement Core State Engine & Feature Registry**
    *   *Action:* Code the localized State Engine and the `BaseFeatureModule` interface, managing state transitions between `STANDBY`, `STREAM`, and `PLAYBACK`.
5.  **Task 5: Integrate VLC Player and Implement Dual Player Handoff**
    *   *Action:* Add the LibVLC dependency to the Android project, configure video rendering, and build the dual-player handoff mechanism for seamless troubleshooting screen capture.
6.  **Task 6: Implement USB Detection & User Overrides**
    *   *Action:* Create the USB detection BroadcastReceiver, media scanner, 5-second disconnect debouncer, and the notifications system for live stream alerts.
7.  **Task 7: Build the Operator Dashboard**
    *   *Action:* Develop the Web UI in `dashboard/` to connect to the Data Bridge WebSocket, displaying online devices, telemetry metrics, and enabling remote control/overrides.
