/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OperationalState = 'STANDBY' | 'STREAM' | 'PLAYBACK';

export type ActionPhase = 'PENDING' | 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'NOMINAL';

export interface ActionState {
  type: 'STREAM' | 'STANDBY' | 'RESYNC' | 'REBOOT';
  phase: ActionPhase;
}

export interface FleetEndpoint {
  id: string;
  name: string;
  tailscaleIp: string;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  appState: OperationalState;
  mediaBitrateMbps: number;
  powerState: 'AC' | 'USB_POW';
  deviceTempC: number;
  cpuUsagePercent: number;
  activePlayerInstance: 'PLAYER_A' | 'PLAYER_B';
  playerSurfaceType: 'SurfaceView' | 'TextureView';
  troubleshootActive: boolean;
  versionCode: number;
  lastSeenMs: number; // relative to simulation time
  usbAttached: boolean;
  usbDebounceCountdown: number | null; // null when idle, seconds remaining when active
  watchdogStep?: number; // state counter for crash healing sequence
  logs: string[];
  streamUri: string;
  targetStreamUri: string;
  isDormant?: boolean;
  streamId?: string;
  isDecommissioned?: boolean;
  decommissionedFrom?: string;
  decommissionedAt?: string;
  replacementNodeId?: string;
  accessKey?: string;
  accessKeyRevoked?: boolean;
  isOverridden?: boolean;
}

export interface ServerMetrics {
  totalNodes: number;
  onlineNodes: number;
  warningNodes: number;
  offlineNodes: number;
  averageRps: number;
  activeRtmpStreams: number;
  activeUsbStreams: number;
  averageBandwidthGbps: number;
  privateDerpStatus: 'HEALTHY' | 'CONGESTED' | 'OFFLINE';
  derpPortTcp: number;
  derpPortUdp: number;
  telebeatRpsHistory: number[]; // real-time rolling array for graph
  serverTempC: number;
  ramDiskUsageMb: number; // volatile RAM disk metrics
}

export interface OtaRelease {
  versionCode: number;
  versionName: string;
  releaseNotes: string;
  releasedAt: string;
  fileSizeMb: number;
  downloadCount: number;
}
