/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FleetEndpoint, OperationalState } from '../types';

// Helper to generate a random Tailscale IP
function generateTailscaleIp(index: number): string {
  const segment3 = Math.floor(index / 250) + 72;
  const segment4 = (index % 250) + 1;
  return `100.${segment3}.15.${segment4}`;
}

const LOCATIONS = [
  { name: '本拠点', id: 'mainendpoint' }
];

export function generateInitialFleet(): FleetEndpoint[] {
  const fleet: FleetEndpoint[] = [];
  
  // Let's generate exactly 102 devices representing the complete fleet
  for (let i = 0; i < 102; i++) {
    let name = '';
    let id = '';
    const isDormant = i >= 94;
    
    if (isDormant) {
      // Dormant hardware has persistent serial / ANDROID_ID but no mappings yet
      id = `ANDROID_ID_F4D27C8E91A0B3${i}`;
      name = ''; // No assigned name
    } else if (i < LOCATIONS.length) {
      name = LOCATIONS[i].name;
      id = LOCATIONS[i].id;
    } else {
      const numStr = String(i + 1 - LOCATIONS.length).padStart(3, '0');
      name = `地方拠点${numStr}`;
      id = `destendpoint${numStr}`;
    }

    // Set up some varied initial states
    let status: 'ONLINE' | 'OFFLINE' | 'WARNING' = 'ONLINE';
    let appState: OperationalState = 'STREAM';
    let vlcActivePlayer: 'PLAYER_A' | 'PLAYER_B' = 'PLAYER_A';
    let vlcPlayerType: 'SurfaceView' | 'TextureView' = 'SurfaceView';
    let usbAttached = false;
    let cpuUsagePercent = Math.floor(Math.random() * 15) + 5; // Clean 5-20% default hardware overlay
    let deviceTempC = Math.floor(Math.random() * 8) + 42; // Cool running at 42-50C
    let vlcBitrateMbps = 4.2 + (Math.random() * 1.5); // Average 4-5.5 Mbps 1080p RTMP
    
    // Make a few nodes have unique states
    if (i === 12) {
      status = 'WARNING';
      deviceTempC = 68; // running a bit hot
      cpuUsagePercent = 45;
    } else if (i === 24) {
      // Node has USB media playing as priority local override
      appState = 'PLAYBACK';
      usbAttached = true;
      vlcBitrateMbps = 12.5; // high-quality local MP4
    } else if (i === 45) {
      // Standby ambient stream
      appState = 'STANDBY';
      vlcBitrateMbps = 2.8;
    } else if (i === 78) {
      usbAttached = true; // Attached but still streaming from network (USB not active unless state changes)
    }

    const defaultStream = 'rtmp://decoders.internal.broadcast.infra.fleet.live.network:1935/live/stream_feed_primary_secure_channel_auth_key_9f82d38ac2';
    const streamId = isDormant ? '' : `venue_stream_${id}`;
    
    fleet.push({
      id,
      name,
      tailscaleIp: generateTailscaleIp(i),
      status,
      appState,
      vlcBitrateMbps: parseFloat(vlcBitrateMbps.toFixed(2)),
      powerState: i % 15 === 0 ? 'USB_POW' : 'AC',
      deviceTempC,
      cpuUsagePercent,
      vlcActivePlayer,
      vlcPlayerType,
      troubleshootActive: false,
      versionCode: 104, // Default to newest approved APK
      lastSeenMs: Date.now() - Math.floor(Math.random() * 2000),
      usbAttached,
      usbDebounceCountdown: null,
      streamUri: appState === 'STREAM' ? defaultStream : appState === 'STANDBY' ? 'rtmp://10.200.4.1/live/ambient_multicam' : 'file:///mnt/media_rw/usb_drive/loop.mp4',
      targetStreamUri: defaultStream,
      isDormant,
      streamId,
      logs: isDormant ? [
        `[${new Date().toLocaleTimeString()}] com.se_chukei.fleetcontroller Service initialized on boot.`,
        `[${new Date().toLocaleTimeString()}] Registered hardware token via Settings.Secure.ANDROID_ID: ${id}`,
        `[${new Date().toLocaleTimeString()}] Data Bridge Heartbeat POST payload: { deviceId: "${id}", ipAddress: "${generateTailscaleIp(i)}" }`,
        `[${new Date().toLocaleTimeString()}] DORMANT STATUS: Awaiting central dashboard mapping for Location Alias & Stream ID.`,
        `[${new Date().toLocaleTimeString()}] Telebeat high-frequency loop listening at interval 2s + Jitter.`
      ] : [
        `[${new Date().toLocaleTimeString()}] com.se_chukei.fleetcontroller Service initialized on boot.`,
        `[${new Date().toLocaleTimeString()}] Registered hardware token via Settings.Secure.ANDROID_ID: ${id}`,
        `[${new Date().toLocaleTimeString()}] Data Bridge Heartbeat POST payload: { deviceId: "${id}", ipAddress: "${generateTailscaleIp(i)}" }`,
        `[${new Date().toLocaleTimeString()}] Server-side metadata fetched. Cached alias mapping in SharedPreferences: name="${name}"`,
        `[${new Date().toLocaleTimeString()}] Tailscale mesh tunnel verified: OK`,
        `[${new Date().toLocaleTimeString()}] VLC for Android bound to SurfaceView overlay (hardware mode).`,
        `[${new Date().toLocaleTimeString()}] Telebeat high-frequency loop listening at interval 2s + Jitter.`
      ]
    });
  }
  
  return fleet;
}

export const INITIAL_OTA_RELEASES = [
  {
    versionCode: 104,
    versionName: 'v1.0.4-stable',
    releaseNotes: 'Fixed hardware acceleration decoders for H.264 video streams. Added 5s USB debounce buffer.',
    releasedAt: '2026-06-30',
    fileSizeMb: 18.4,
    downloadCount: 102
  },
  {
    versionCode: 103,
    versionName: 'v1.0.3-hotfix',
    releaseNotes: 'Improved Tailscale connectivity reconnection on wake events. Optimized accessibility click node lookup.',
    releasedAt: '2026-05-12',
    fileSizeMb: 18.2,
    downloadCount: 102
  },
  {
    versionCode: 102,
    versionName: 'v1.0.2',
    releaseNotes: 'Initial deployment. Core Uninterruptible dual-player Surface/Texture handoff engine rollout.',
    releasedAt: '2026-04-01',
    fileSizeMb: 17.9,
    downloadCount: 102
  }
];

export const MOCK_GENERIC_LOGS = [
  'VLC_PLAYER_PLAYING: Buffer filled. Surface compositing locked.',
  'rtmp_reader: Frame index verified. PTS synchronized.',
  'accessibility_svc: Screen node scan complete. No consent prompt detected.',
  'telebeat: Outbound HTTP POST success (status 200 OK). No configuration changes received.',
  'device_vitals: CPU utilization stable. System thermals within AC bounds.',
  'network_monitor: Tailscale link RTT: 4.2ms. Mesh tunnel verified.',
  'WorkManager: Watchdog healthcheck executed. Service is healthy.'
];

export const MOCK_ERROR_LOGS = [
  'VLC_PLAYER_ERROR: RTMP socket reset by peer. Commencing local failover check.',
  'network_monitor: Packet drop rate exceeded 4.5%. Buffer starvation warning.',
  'device_vitals: Temperature warning threshold crossed. Fanless thermal throttling warning.',
  'usb_manager: Voltage spike detected. Connection unstable.'
];

export function getRandomLog(isError = false): string {
  const source = isError ? MOCK_ERROR_LOGS : MOCK_GENERIC_LOGS;
  return `[${new Date().toLocaleTimeString()}] ${source[Math.floor(Math.random() * source.length)]}`;
}
