Fleet Controller System — Handoff Specification
System Overview
The Fleet Controller System is a distributed media management platform for remote digital signage and streaming endpoints (e.g., Sony BRAVIA / Android TV devices). It consists of two main repositories:
fleet-controller-dashboard: Web-based fleet management UI and HTTP Data Bridge API.
fleet-controller-client: Native Kotlin Android TV client application using LibVLC.
1. fleet-controller-client (Android TV / Google TV App)
Core Purpose
A lightweight, unattended, auto-recovering media player built for Android TV / Google TV that continuously polls the Data Bridge endpoint, manages display power states, and renders network RTMP/RTSP streams or local media files via LibVLC.
Technical Architecture & Stack
Language & Framework: Kotlin, AndroidX, AppCompat, Coroutines (Dispatchers.IO).
Media Engine: org.videolan.android:libvlc-all:3.7.5 (LibVLC + MediaPlayer + VLCVideoLayout).
Networking: OkHttp 4.12.0 for polling JSON telemetry & state endpoints.
Build System: Gradle Version Catalog (libs.versions.toml), AGP 8.x+, Kotlin 2.x.
Operational States (appState)
STANDBY: Screen dimmed or media paused; minimal CPU/network draw (~2.8 Mbps baseline ping). Low-power or idle mode.
STREAM: Active network stream playback (e.g., RTMP/RTSP at ~4.5 Mbps). Continuously rendered via LibVLC with low-latency caching options (--live-caching=1500, --clock-jitter=0).
PLAYBACK: Endpoint User-Initiated Local Media Playback Mode. Used when an endpoint user directly initiates or schedules playing local storage / USB media files (e.g., file:///mnt/media_rw/usb_drive/loop.mp4). High bitrates (~12.8 Mbps). Note: This is a deliberate user/system playback choice, NOT a network failure fallback.
Functional Requirements
Data Bridge Polling Loop:
Polls http://<DATA_BRIDGE_IP>:8080/api/state every 2 seconds with random jitter (1,000–3,000ms) using Duration.Companion.milliseconds.
Parses JSON state payload: { "streamUrl": "...", "appState": "STREAM"|"STANDBY"|"PLAYBACK", "accessKeyRevoked": false }.
Seamlessly transitions video source on streamUrl or appState change without crashing.
Power & Hardware Calibration:
Acquires a PowerManager.PARTIAL_WAKE_LOCK ("FleetController::CpuWakeLock") on onResume with a 4-hour safety timeout to prevent Android TV ambient sleep mode. Releases lock cleanly on onPause.
Resilience & Watchdog:
Network errors (e.g., transient Tailscale or LAN disconnects) must fail silently and auto-retry on the next polling interval.
Proper lifecycle cleanup in onDestroy(): cancels CoroutineScope, releases mediaPlayer, and disposes libVLC.
2. fleet-controller-dashboard (Web Dashboard & Data Bridge)
Core Purpose
A web dashboard providing real-time fleet visibility, remote control, device diagnostics, and TVU webhook simulation. Includes a lightweight Node.js/Express Data Bridge (bridge.js).
Technical Architecture & Stack
Frontend: React 18+, TypeScript, Tailwind CSS, Lucide icons, Motion (Framer Motion).
Backend Bridge: bridge.js (Express on port 8080) hosting REST endpoints /api/state and /api/update.
Functional Requirements
Device Grid & State Monitoring:
Monitors operational status across nodes (STANDBY, STREAM, PLAYBACK).
Color-coded status badges: Yellow (STANDBY), Green (STREAM), Pink/Magenta (PLAYBACK), Red (Access Key Revoked).
Filtering and sorting by state, location, IP address, and access authorization.
Remote Support, Management & Control:
Remote Mode Switch: Operator can remotely toggle target device state (STANDBY, STREAM, PLAYBACK) and change destination stream URLs.
Access Key Authorization: Capability to grant or revoke device access keys remotely (accessKeyRevoked). If revoked, client playback is inhibited.
Remote Refresh / Resync: Trigger manual telemetry poll or force stream reconnect on endpoint nodes.
Telemetry Reporting: Real-time inspection of hardware & playback stats:
VLC decoder FPS & network jitter
Bitrate consumption (Mbps)
TV internal temperature & CPU usage
Wake lock status and Tailscale/LAN connectivity
TVU Webhook Integration Simulator: Simulated ingestion of external broadcast webhooks (e.g., live stream activation/deactivation triggers) that dynamically re-route fleet nodes to live event feeds.
3. Communication Contract (Data Bridge API)
GET /api/state
Returns current fleet node instruction for client devices:

{
  "streamUrl": "rtmp://10.74.35.53/live/feed1",
  "appState": "STREAM",
  "accessKeyRevoked": false,
  "vlcBitrateMbps": 4.5,
  "timestamp": 1785192000
}
POST /api/update
Updates target state from the dashboard or external webhooks:

{
  "streamUrl": "file:///mnt/media_rw/usb_drive/loop.mp4",
  "appState": "PLAYBACK",
  "accessKeyRevoked": false
}
