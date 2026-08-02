# FleetController Comprehensive Architecture and Repository Assessment Report

This report presents a thorough repository, documentation, and architectural assessment of the FleetController project. It is written to serve as an authoritative, reliable starting point for future development.

---

## 1. Repository Structure Assessment

### Component Discovery & Inspection
*   **Dashboard Component (`/dashboard`):** Exists in the Git index as an independent subproject gitlink pointing to commit `bf2c10732cc9872804aa8628640c8265b0ecc4b9`. The `/dashboard` directory on the physical filesystem is entirely empty. There are no project manifests, web assets, or HTML/JS/CSS source files.
*   **Client Component (`/client`):** Exists in the Git index as an independent subproject gitlink pointing to commit `9d0b46ea48759bb1c2f8865021a637ed5f34e8b9`. The `/client` directory is entirely empty on the local filesystem. There are no Android Gradle configurations, AndroidManifest files, or Java/Kotlin source files.
*   **Data-Bridge Component (`/data-bridge`):** Documented extensively in `DEVELOPMENT_SETUP.md` and `ROADMAP.md` as a critical backend component residing in the `/data-bridge` folder. However, **no `/data-bridge` directory or gitlink exists anywhere in the repository tree**.

### Verification against Documentation
*   The actual repository structure **fails to match the documentation**. While all 8 core documentation files (`README.md`, `DEVELOPMENT_SETUP.md`, `ROADMAP.md`, `SYSTEM_DESIGN.md`, `DECISIONS.md`, `TECHNICAL_SPEC.md`, `AI_GUIDE.md`, `ARCHITECTURE.md`) are present in the root directory, there is no active code implementation on disk. The components are represented either as broken subproject references (`client` and `dashboard` without a `.gitmodules` configuration or valid credentials) or are completely missing (`data-bridge`).

---

## 2. Documentation Consistency

With `TECHNICAL_SPEC.md` as the absolute source of truth, we have evaluated all project documents:

### Detected Conflicts & Inconsistencies
1.  **Monorepo Folder Structure Definition (`DECISIONS.md` vs. others):**
    *   `DECISIONS.md` (`ADR-001: Use a Monorepo Structure`) displays a directory layout that completely omits `/data-bridge` from the monorepo structure.
    *   In contrast, `DEVELOPMENT_SETUP.md` and `ROADMAP.md` explicitly document the monorepo as containing `/dashboard`, `/client`, and `/data-bridge/`.
    *   *Resolution (Source of Truth):* `TECHNICAL_SPEC.md` defines the Data Bridge as the central fleet orchestration service (Section 6). Therefore, `DECISIONS.md` is inconsistent and must be updated to include `/data-bridge` as a core monorepo directory.
2.  **Telemetry Heartbeat Jitter Timing (`TECHNICAL_SPEC.md` vs. `SYSTEM_DESIGN.md`):**
    *   `TECHNICAL_SPEC.md` Section 9.1 specifies: "2s + 1s median jitter = 3 seconds" expected average telebeat interval.
    *   `SYSTEM_DESIGN.md` Section 3 lists the random jitter as `0-2 seconds` with an expected average of `3 seconds/device`.
    *   *Resolution:* While mathematically aligned (a 2s base + a 0-2s random uniform jitter averages to 3 seconds), `SYSTEM_DESIGN.md` should be explicitly adjusted to copy the phrasing in `TECHNICAL_SPEC.md` ("2s base interval and random jitter up to 2s") to prevent potential implementer confusion.

---

## 3. Architecture Consistency Review

*   **Documented Architecture vs. Physical Layout:**
    *   The architecture documents (`ARCHITECTURE.md`, `TECHNICAL_SPEC.md`) present a clean division of concerns: a React-based operator interface (`/dashboard`), an on-premise backend orchestrator (`/data-bridge`), and an Android TV-native client (`/client`).
    *   **Inconsistencies:** The lack of actual code and package configurations (such as an root-level workspace file or subproject package manifests) means that the architecture is currently purely conceptual. No folders exist to implement the Control Plane and Media Plane separation.
    *   The current Git configuration contains raw commit links to external git repositories under `client` and `dashboard` instead of hosting them as integrated monorepo subdirectories. This represents a conflict with `ADR-001`, which advocates for a single unified repository to maximize context for AI agents and developers.

---

## 4. Missing or Incomplete Systems

All core capabilities and subsystems listed in the specification are **100% missing/incomplete** from the current codebase. Below is an evaluation of their documented requirements:

*   **State Engine:** Missing. Requires a localized finite state machine in the Android TV client supporting state transitions between `STANDBY`, `STREAM`, and `PLAYBACK` based on server target state instructions and local policies.
*   **Feature Registry:** Missing. Requires an extensible registry pattern implementing the Kotlin `BaseFeatureModule` interface to decouple modular capabilities from core foreground service loops.
*   **Telebeat Communication:** Missing. Requires an outbound HTTP polling service (`POST /api/telebeat`) in the client executing every 2s with 0-2s random jitter, and a corresponding ingestion API in the Data Bridge.
*   **Data Bridge Responsibilities:** Missing. The backend Node.js express application designed to coordinate fleet state, store device configs, manage OTA payloads, and expose WebSocket channels for the dashboard is absent.
*   **VLC Integration:** Missing. Requires importing the native `libvlc-android` package inside the client, managing the video decoder surface, tracking playback metrics (such as bitrate), and handling stream recovery.
*   **USB Playback:** Missing. Requires an Android receiver monitoring `USB_DEVICE_ATTACHED` and scan/index functions with a 5-second disconnect debounce timer.
*   **User Override Behavior:** Missing. Requires a priority control model where active local user actions override remote requests. The client must present non-disruptive notifications (e.g., live stream overlay alerts) instead of force-switching players during local activity.
*   **Troubleshooting Architecture:** Missing. Requires a highly specialized dual-player handoff design (switching rendering between Player A `SurfaceView` and Player B `TextureView` for remote visual capture) and touch event injection utilizing Android Accessibility Services.
*   **OTA Update Architecture:** Missing. Requires Android Device Owner enrollment and `PackageInstaller` API hooks to download and silently install APK updates from the Data Bridge.
*   **Health Monitoring:** Missing. Requires a persistent Foreground Service (`START_STICKY`) and a WorkManager watchdog to maintain 24/7 endpoint operational uptime, as well as a 500KB resident FIFO RAM ring buffer for diagnostic logging.

---

## 5. Technical Debt Assessment

### Architecture Risks
1.  **Broken Subproject Pointers (Gitlinks):** The inclusion of empty directories linked as external subprojects (`160000` mode) without a `.gitmodules` file in the root directory makes it impossible for developers, tools, or CI pipelines to clone and track changes cleanly.
2.  **Lack of Monorepo Package Orchestration:** Since the repository contains multiple platforms (Node.js, React, Android Gradle), there is no centralized root package or workspace build configuration (like PNPM/Yarn Workspaces or NX) to manage cross-component linting, typescript types sharing, or API contract validation.
3.  **VLC Direct Threading and Surface Binding:** Managing low-level native decoders (VLC) and binding/unbinding display surfaces (SurfaceView vs TextureView) is notoriously prone to memory leaks, native crashes, and deadlocks if threads are not handled with extreme care.

---

## 6. Risks Assessment

### Fragile Areas & Blockers
*   **Silent OTA Failures:** Implementing silent installation using raw Device Owner APIs is highly fragile. If an updated APK is installed but has a crash-on-boot bug, it will brick the device. The system currently lacks a defined automatic rollback mechanism.
*   **Hardware Decoders Locking during Dual Player Handoff:** On lower-end Android TV hardware, spawning a second VLC instance to warm up rendering (as required by the Dual Player Handoff specification in `SYSTEM_DESIGN.md` Section 14) can easily exceed hardware decoder limits, resulting in video freezes or system-wide media pipeline lockups.
*   **USB Disconnect Signal Bounce:** Physical USB storage on Android TV devices is notoriously unstable and frequently reports false disconnection events. Without robust, hardware-independent debouncing (such as the specified 5-second timer), the client state engine will fluctuate disruptively between states.

---

## 7. Recommended Implementation Order

To establish a solid starting point and systematically build the FleetController platform, we recommend the following **8 sequential development tasks**:

1.  **Task 1: Unify the Monorepo Structure**
    *   *Action:* Remove the broken Git submodule/gitlink references and convert the `/client` and `/dashboard` directories into regular version-controlled folders. Create an empty `/data-bridge` directory to house the backend code.
2.  **Task 2: Implement the Data Bridge Core API**
    *   *Action:* Initialize a Node.js project under `/data-bridge`. Implement the `/api/telebeat` endpoint to accept device health payloads and return target state instructions, backed by a simple JSON/file storage system.
3.  **Task 3: Bootstrap the Android Client & Sticky Service**
    *   *Action:* Create a native Android TV Gradle project under `/client` containing a persistent Foreground Service configured with `START_STICKY` and a basic WorkManager watchdog to maintain 24/7 uptime.
4.  **Task 4: Implement Client Telebeat Polling & RAM Logging**
    *   *Action:* Code the client HTTP polling service targeting the Data Bridge, utilizing a 2s base interval with a randomized 0-2s jitter. Build a 500KB resident RAM ring buffer for diagnostics.
5.  **Task 5: Implement State Engine & Feature Registry**
    *   *Action:* Write the Kotlin state machine and the modular `BaseFeatureModule` interface inside the client, handling operational transitions between `STANDBY`, `STREAM`, and `PLAYBACK`.
6.  **Task 6: Integrate LibVLC and Implement Dual Player Handoff**
    *   *Action:* Import `libvlc-android`, configure the video surface wrapper, and write the dual-player transition logic (Player A `SurfaceView` and Player B `TextureView`) to safely support screen capture troubleshooting without interrupting broadcast display.
7.  **Task 7: Build USB Detection, Debouncing, and Notifications Overlay**
    *   *Action:* Implement the USB BroadcastReceiver, the media scanner, the 5-second disconnect debouncer, and the temporary overlay notification to allow user-driven live stream joining during local playback.
8.  **Task 8: Develop the Operator Web Dashboard**
    *   *Action:* Create a React/Vite web application under `/dashboard` that connects to the Data Bridge WebSocket to monitor live device states, change stream URIs, and toggle remote troubleshooting.

---

## 8. Documentation to be Updated Before Coding Begins

Before beginning the implementation of the codebase, the following documentation updates should be performed to resolve conflicts and reflect the monorepo reality:

1.  **Update `DECISIONS.md` (ADR-001):**
    *   *Change:* Modify the directory tree diagram under `ADR-001` to explicitly include the `data-bridge/` folder in the monorepo. This aligns the decision log with `DEVELOPMENT_SETUP.md` and `ROADMAP.md`.
2.  **Clarify Telemetry Timing in `SYSTEM_DESIGN.md`:**
    *   *Change:* Standardize the phrasing of the telemetry timing in `SYSTEM_DESIGN.md` Section 3 to precisely match `TECHNICAL_SPEC.md` Section 9.1, confirming that the client polls every 2 seconds with an added random uniform jitter of 0-2 seconds.
3.  **Add Monorepo Subproject Verification to `DEVELOPMENT_SETUP.md`:**
    *   *Change:* Update the "Repository Setup" section of `DEVELOPMENT_SETUP.md` to instruct developers that the client and dashboard directories are directly tracked within the main repository (or specify how to initialize submodules if they are separated in production).
