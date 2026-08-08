export interface DeviceTelemetry {
  id: string;
  name: string;
  tailscaleIp: string;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  appState: 'STANDBY' | 'STREAM' | 'PLAYBACK';
  streamUri: string;
  vlcBitrateMbps: number;
  vlcActivePlayer: string;
  vlcPlayerType: string;
  powerState: string;
  deviceTempC: number;
  cpuUsagePercent: number;
  usbAttached: boolean;
  versionCode: number;
  uptimeMs: number;
  connectionType: 'ETHERNET' | 'WIFI';
  wifiSignalStrengthDbm?: number | null;
  lastError?: string | null;
  lastSeenMs: number;
  troubleshootActive: boolean;
  watchdogStep: number;
  logs: string[];
}