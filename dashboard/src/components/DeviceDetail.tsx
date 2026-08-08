/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { FleetEndpoint, OperationalState } from '../types';
import { 
  X, Cpu, Thermometer, Zap, AlertTriangle, Monitor, 
  Play, VideoOff, RefreshCw, HardDrive, FileText, Send, Eye, Lock, Unlock, ChevronDown, ChevronUp, ChevronRight, Settings2, Info, Check, Shield, Square, Activity, Wifi, Power
} from 'lucide-react';
import { getRandomLog } from '../data/fleetData';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  node: FleetEndpoint;
  onClose: () => void;
  onUpdateNode: (nodeId: string, updates: Partial<FleetEndpoint>) => void;
  onOpenTroubleshoot: (node: FleetEndpoint) => void;
  isAdmin?: boolean;
  endpoints?: FleetEndpoint[];
  onSwapDevice?: (oldNodeId: string, newNodeId: string) => void;
  globalFleetState?: 'STREAM' | 'STANDBY';
  debugMode?: boolean;
  activeActions?: { [nodeId: string]: import("../types").ActionState } | null;
  onTriggerAction?: (nodeIds: string[], type: 'STREAM' | 'STANDBY' | 'RESYNC' | 'REBOOT', streamUri?: string) => void;
}

export default function DeviceDetail({ 
  node, 
  onClose, 
  onUpdateNode, 
  onOpenTroubleshoot,
  isAdmin = false,
  endpoints = [],
  onSwapDevice,
  globalFleetState = 'STREAM',
  debugMode = false,
  activeActions,
  onTriggerAction
}: Props) {
  const [streamInput, setStreamInput] = useState(node.targetStreamUri);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const [isSwapExpanded, setIsSwapExpanded] = useState(false);
  const [harvesting, setHarvesting] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [controlsUnlocked, setControlsUnlocked] = useState(false);
  const [advancedControlsExpanded, setAdvancedControlsExpanded] = useState(false);
  const { locale, t } = useTranslation();

  // Override States
  const activeAction = activeActions?.[node.id];
  let streamState = 'idle';
  let standbyState = 'idle';
  let resyncState = 'idle';
  let rebootState = 'idle';
  let isOverrideInProgress = false;
  let statusStageText = '';
  
  if (activeAction) {
    const p = activeAction.phase;
    const mapped = (p === 'PHASE_1' || p === 'PENDING') ? 'phase1'
      : p === 'PHASE_2' ? 'phase2'
      : p === 'PHASE_3' ? 'phase3'
      : 'success';

    if (p !== 'NOMINAL') {
      isOverrideInProgress = true;
      const t = activeAction.type;
      if (t === 'STREAM') {
        statusStageText = p === 'PENDING' ? (locale === 'ja' ? '待機中' : 'WAITING...')
          : p === 'PHASE_1' ? (locale === 'ja' ? '1/3 待機切断中' : '1/3 TERM STANDBY')
          : p === 'PHASE_2' ? (locale === 'ja' ? '2/3 接続中' : '2/3 CONNECTING')
          : (locale === 'ja' ? '3/3 同期中' : '3/3 SYNCING');
      } else if (t === 'STANDBY') {
        statusStageText = p === 'PENDING' ? (locale === 'ja' ? '待機中' : 'WAITING...')
          : p === 'PHASE_1' ? (locale === 'ja' ? '1/3 バッファクリア' : '1/3 FLUSHING')
          : p === 'PHASE_2' ? (locale === 'ja' ? '2/3 待機切替' : '2/3 SWITCHING')
          : (locale === 'ja' ? '3/3 待機移行' : '3/3 ENTERING');
      } else if (t === 'RESYNC') {
        statusStageText = p === 'PENDING' ? (locale === 'ja' ? '待機中' : 'WAITING...')
          : p === 'PHASE_1' ? (locale === 'ja' ? '1/3 切断中' : '1/3 DISCONNECTING')
          : p === 'PHASE_2' ? (locale === 'ja' ? '2/3 パイプライン再同期' : '2/3 RESYNCING PIPELINE')
          : (locale === 'ja' ? '3/3 再接続中' : '3/3 RECONNECTING');
      } else if (t === 'REBOOT') {
        statusStageText = p === 'PENDING' ? (locale === 'ja' ? '待機中' : 'WAITING...')
          : p === 'PHASE_1' ? (locale === 'ja' ? '1/3 システム終了' : '1/3 SHUTTING DOWN')
          : p === 'PHASE_2' ? (locale === 'ja' ? '2/3 OS再起動中' : '2/3 REBOOTING OS')
          : (locale === 'ja' ? '3/3 起動同期中' : '3/3 STARTING AGENT');
      } else {
        statusStageText = p;
      }
    }

    if (activeAction.type === 'STREAM') streamState = mapped;
    if (activeAction.type === 'STANDBY') standbyState = mapped;
    if (activeAction.type === 'RESYNC') resyncState = mapped;
    if (activeAction.type === 'REBOOT') rebootState = mapped;
  }
  const [standbyInput, setStandbyInput] = useState('rtmp://10.200.4.1/live/ambient_multicam');

  // Renaming support state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [editId, setEditId] = useState(node.id);

  const prevNodeIdRef = useRef(node.id);
  const [selectedSwapTarget, setSelectedSwapTarget] = useState<string>('');
  const [isSyncExpanded, setIsSyncExpanded] = useState(false);
  const [selectedSyncDestination, setSelectedSyncDestination] = useState<string>('');
  const [manualStreamIdInput, setManualStreamIdInput] = useState<string>('');
  const [selectedStreamIdDropdown, setSelectedStreamIdDropdown] = useState<string>('');
  const [manualPullStreamId, setManualPullStreamId] = useState<string>('');

  const [confirmAction, setConfirmAction] = useState<{
    type: 'STREAM' | 'STANDBY' | 'WATCHDOG' | 'REBOOT' | null;
    callback: () => void;
  }>({ type: null, callback: () => {} });

  // Sync state if node changes, but preserve edit states if currently editing
  useEffect(() => {
    // If we switched to a different node, close editing and reset values
    if (prevNodeIdRef.current !== node.id) {
      setIsEditing(false);
      setEditName(node.name);
      setEditId(node.id);
      setControlsUnlocked(false); // Lock the controls when selecting another endpoint
      setSelectedSyncDestination('');
      setManualStreamIdInput('');
      setSelectedStreamIdDropdown('');
      prevNodeIdRef.current = node.id;
    }
    setStreamInput(node.targetStreamUri);
  }, [node]);

  // Sync select options when active node or endpoints list change
  useEffect(() => {
    if (node.isDormant) {
      const activeDevices = endpoints.filter(e => !e.isDormant);
      setSelectedSwapTarget((prev) => {
        if (activeDevices.some(e => e.id === prev)) return prev;
        return activeDevices.length > 0 ? activeDevices[0].id : '';
      });
    } else {
      const dormantDevices = endpoints.filter(e => e.isDormant && !e.isDecommissioned);
      setSelectedSwapTarget((prev) => {
        if (dormantDevices.some(e => e.id === prev)) return prev;
        return dormantDevices.length > 0 ? dormantDevices[0].id : '';
      });
    }
  }, [node.id, endpoints]);

  // Handle container-only autoscroll on terminal to prevent screen yanking
  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [node.logs, isLogExpanded]);

  // Manually toggle operational states
  const changeOperationalState = (target: 'STREAM' | 'STANDBY') => {
    let bitrate = 4.5;
    let uri = node.targetStreamUri;
    
    if (target === 'STANDBY') {
      bitrate = 2.8;
      uri = 'rtmp://10.200.4.1/live/ambient_multicam';
    }

    onUpdateNode(node.id, {
      appState: target,
      mediaBitrateMbps: bitrate,
      streamUri: uri,
      logs: [
        ...node.logs,
        `[${new Date().toLocaleTimeString()}] EMERGENCY_OVERRIDE: Force state directive: "${target}"`,
        `[${new Date().toLocaleTimeString()}] MPV: Loaded resource URI: "${uri}"`
      ]
    });
  };

  // Update target Stream URI
  const updateTargetStream = () => {
    onUpdateNode(node.id, {
      targetStreamUri: streamInput,
      streamUri: node.appState === 'STREAM' ? streamInput : node.streamUri,
      logs: [
        ...node.logs,
        `[${new Date().toLocaleTimeString()}] COMMAND: Target stream URI updated to "${streamInput}". Reflected on next polling cycle.`
      ]
    });
  };

  // Simulated Log Shipping Harvest (Section 6.3)
  const triggerLogHarvest = () => {
    setHarvesting(true);
    
    // Simulate telebeat roundtrip to fetch logs
    setTimeout(() => {
      const freshLogs = [
        `[${new Date().toLocaleTimeString()}] [TELEBEAT] Server-side log harvest flag intercepted.`,
        `[${new Date().toLocaleTimeString()}] [LOGS_SHIPPING] Ring Buffer flushed. Shipping 512KB volatile buffer...`,
        `[${new Date().toLocaleTimeString()}] [LOGS_SHIPPING] Bulk transfer completed over Tailscale secure channel (200 OK).`
      ];
      
      onUpdateNode(node.id, {
        logs: [...node.logs, ...freshLogs]
      });
      setHarvesting(false);
    }, 1200);
  };

  // Export logs to local file
  const exportLogs = () => {
    const header = `=== FLEET CONTROL LOG EXPORT ===\n` +
                   `Device ID: ${node.id}\n` +
                   `Device Name: ${node.name || 'Unassigned'}\n` +
                   `Tailscale IP: ${node.tailscaleIp}\n` +
                   `App State: ${node.appState}\n` +
                   `Export Time: ${new Date().toLocaleString()}\n` +
                   `================================\n\n`;
    const body = node.logs.join('\n');
    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs_${node.id}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Trigger simulated native WorkManager Watchdog wake (Section 6.2)
  const triggerWatchdogCheck = () => {
    const isErrorState = node.status === 'WARNING';
    const healingLogs = isErrorState 
      ? [
          `[${new Date().toLocaleTimeString()}] WorkManager: Watchdog check triggered (15m interval).`,
          `[${new Date().toLocaleTimeString()}] Watchdog: Stalled decoder thread discovered. Terminating native player.`,
          `[${new Date().toLocaleTimeString()}] Watchdog: Re-starting com.se_chukei.fleetcontroller Foreground Service with START_STICKY.`,
          `[${new Date().toLocaleTimeString()}] Watchdog: Thread successfully healed. Restoring player overlay SurfaceView.`
        ]
      : [
          `[${new Date().toLocaleTimeString()}] WorkManager: Watchdog check triggered. Thread pool healthy. Foreground Service is active.`
        ];
        
    onUpdateNode(node.id, {
      status: 'ONLINE',
      watchdogStep: undefined,
      deviceTempC: isErrorState ? 46 : node.deviceTempC,
      cpuUsagePercent: isErrorState ? 12 : node.cpuUsagePercent,
      logs: [...node.logs, ...healingLogs]
    });
  };

  const plugUsb = () => {
    onUpdateNode(node.id, {
      usbAttached: true,
      usbDebounceCountdown: null,
      appState: 'PLAYBACK',
      mediaBitrateMbps: 12.8,
      streamUri: 'file:///mnt/media_rw/usb_drive/loop.mp4',
      logs: [
        ...node.logs,
        `[${new Date().toLocaleTimeString()}] FAILOVER: USB 2.0 Priority Storage attached. Activating local failover loop.`,
        `[${new Date().toLocaleTimeString()}] MPV: Loaded local media resource: "file:///mnt/media_rw/usb_drive/loop.mp4"`
      ]
    });
  };

  const unplugUsb = () => {
    onUpdateNode(node.id, {
      usbDebounceCountdown: 5,
      logs: [
        ...node.logs,
        `[${new Date().toLocaleTimeString()}] FAILOVER: USB cable unplug detected. Debounce timer initialized (5s) to guard against signal spikes.`
      ]
    });
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 backdrop-blur-md flex flex-col h-full overflow-y-auto custom-scrollbar" id="node-details-container">
      {/* Header Panel */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4" id="details-header">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex flex-col gap-2 p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg max-w-sm">
              <div>
                <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">
                  {locale === 'ja' ? '拠点名 (Description)' : 'Endpoint Name (Description)'}
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">
                  {locale === 'ja' ? 'エイリアス (ID / Alias)' : 'Endpoint Alias (ID)'}
                </label>
                <input
                  type="text"
                  value={editId}
                  onChange={(e) => setEditId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 justify-end mt-1">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(node.name);
                    setEditId(node.id);
                  }}
                  className="px-2.5 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                >
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    const trimmedName = editName.trim();
                    const trimmedId = editId.trim();
                    
                    if (!trimmedName || !trimmedId) {
                      alert(locale === 'ja' ? '名前とエイリアスを入力してください。' : 'Please enter a valid Name and Alias.');
                      return;
                    }

                    // Guardrail: Check for duplicate Alias (ID)
                    const duplicateIdNode = endpoints.find(e => e.id.toLowerCase() === trimmedId.toLowerCase() && e.id !== node.id);
                    if (duplicateIdNode) {
                      alert(locale === 'ja' 
                        ? `重複エラー: エイリアス「${trimmedId}」はすでに「${duplicateIdNode.name || duplicateIdNode.id}」で使用されています。` 
                        : `Duplicate Error: Alias "${trimmedId}" is already used by "${duplicateIdNode.name || duplicateIdNode.id}".`
                      );
                      return;
                    }

                    // Guardrail: Check for duplicate JP/EN Name (Description)
                    const duplicateNameNode = endpoints.find(e => e.name.toLowerCase() === trimmedName.toLowerCase() && e.id !== node.id);
                    if (duplicateNameNode) {
                      alert(locale === 'ja' 
                        ? `重複エラー: 拠点名「${trimmedName}」はすでに別のデバイス（ID: ${duplicateNameNode.id}）で使用されています。` 
                        : `Duplicate Error: Name "${trimmedName}" is already used by another device (ID: ${duplicateNameNode.id}).`
                      );
                      return;
                    }

                    const wasDormant = !!node.isDormant;
                    prevNodeIdRef.current = trimmedId;
                    onUpdateNode(node.id, {
                      name: trimmedName,
                      id: trimmedId,
                      isDormant: false,
                      streamId: `venue_stream_${trimmedId}`,
                      logs: [
                        ...node.logs,
                        wasDormant 
                          ? `[${new Date().toLocaleTimeString()}] CONFIG: STAGING COMPLETED. Registered location alias to "${trimmedId}" and name to "${trimmedName}". removed from dormant state.`
                          : `[${new Date().toLocaleTimeString()}] CONFIG: Renamed description to "${trimmedName}" and alias to "${trimmedId}"`
                      ]
                    });
                    setIsEditing(false);
                  }}
                  className="px-2.5 py-1 text-[10px] font-mono bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold transition-colors cursor-pointer"
                >
                  {locale === 'ja' ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 shrink-0 ${node.isDormant ? 'rounded-none' : 'rounded-full'} ${node.accessKeyRevoked ? 'bg-rose-500' : node.status === 'ONLINE' ? 'bg-emerald-500' : node.status === 'WARNING' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'}`} />
                <h2 className="text-base font-sans font-bold text-slate-100 truncate">
                  {node.name || (locale === 'ja' ? `未割当ハードウェア (HW-${node.id.slice(-4)})` : `Unassigned Hardware (HW-${node.id.slice(-4)})`)}
                </h2>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-all cursor-pointer flex items-center justify-center shrink-0"
                  title={locale === 'ja' ? '名前とエイリアスを編集' : 'Edit name and alias'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
              </div>
              <code className="text-[10px] text-slate-500 block font-mono ml-4 truncate">{node.id}:{node.tailscaleIp}</code>
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all cursor-pointer shrink-0 ml-2">
          <X className="w-5 h-5" />
        </button>
      </div>

      {node.status === 'OFFLINE' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-950/20 border border-slate-900 rounded-xl my-4 animate-in fade-in duration-300">
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl mb-4 text-slate-500">
            <VideoOff className="w-8 h-8 text-rose-500/80 animate-pulse" />
          </div>
          <h3 className="text-sm font-mono text-slate-300 uppercase font-bold tracking-wider">
            {locale === 'ja' ? 'オフライン (OFFLINE)' : 'DEVICE OFFLINE'}
          </h3>
          <p className="text-xs text-slate-500 font-sans mt-2 max-w-[280px] leading-relaxed">
            {locale === 'ja'
              ? 'このハードウェアは現在ネットワークから切断されています。リアルタイム制御、フェイルオーバーオーバーライド、診断機能は利用できません。'
              : 'This hardware node is currently disconnected from the Tailscale mesh. Real-time control, failover overrides, and remote diagnostics are unavailable.'}
          </p>
          {node.isDecommissioned && (
            <div className="mt-4 p-3.5 bg-amber-950/20 border border-amber-900/30 rounded-lg text-left text-[11px] font-mono text-slate-400 max-w-sm">
              <div className="text-amber-400 font-bold mb-1.5 uppercase tracking-wide">
                {locale === 'ja' ? '■ 退役済ハードウェア' : '■ DECOMMISSIONED HARDWARE'}
              </div>
              <div className="text-slate-300"><span className="text-slate-500">{locale === 'ja' ? '旧割当先:' : 'Ex-Location:'}</span> {node.decommissionedFrom}</div>
              <div className="text-slate-300"><span className="text-slate-500">{locale === 'ja' ? '退役日時:' : 'Retired At:'}</span> {node.decommissionedAt}</div>
              <div className="text-slate-300"><span className="text-slate-500">{locale === 'ja' ? '置換機 ID:' : 'Replaced By:'}</span> HW-{node.replacementNodeId?.slice(-4)}</div>
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Real-time Hardware Vitals */}
      <div className="flex flex-col gap-2 mb-4" id="details-vitals">
        {/* Line 1: STATUS / BITRATE */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Activity className="w-3 h-3 text-slate-500" />
              <span className="text-[8px] font-mono text-slate-500 uppercase">Status</span>
            </div>
            <span className={`text-[9.5px] font-mono font-bold truncate pl-1 ${
              isOverrideInProgress
                ? 'text-cyan-300 animate-pulse'
                : node.accessKeyRevoked
                  ? 'text-rose-400'
                  : node.appState === 'STREAM'
                    ? 'text-emerald-400'
                    : 'text-yellow-400'
            }`}>
              {isOverrideInProgress 
                ? statusStageText 
                : node.accessKeyRevoked 
                  ? (locale === 'ja' ? 'キー失効中' : 'KEY REVOKED') 
                  : node.appState}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Wifi className="w-3 h-3 text-slate-500" />
              <span className="text-[8px] font-mono text-slate-500 uppercase">Bitrate</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-200 truncate pl-1">
              {node.mediaBitrateMbps.toFixed(2)} Mbps
            </span>
          </div>
        </div>

        {/* Line 2: TEMP / CPU / PWR */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Thermometer className="w-3 h-3 text-slate-500" />
              <span className="text-[8px] font-mono text-slate-500 uppercase">Temp</span>
            </div>
            <span className={`text-[10px] font-mono font-bold ${node.deviceTempC > 60 ? 'text-amber-400' : 'text-slate-200'}`}>
              {node.deviceTempC}°C
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Cpu className="w-3 h-3 text-slate-500" />
              <span className="text-[8px] font-mono text-slate-500 uppercase">CPU</span>
            </div>
            <span className={`text-[10px] font-mono font-bold ${node.cpuUsagePercent > 40 ? 'text-amber-400' : 'text-slate-200'}`}>
              {node.cpuUsagePercent}%
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-900 rounded p-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Zap className={`w-3 h-3 ${
                (rebootState === 'phase1' || rebootState === 'phase2')
                  ? 'text-red-500 animate-pulse'
                  : rebootState === 'phase3'
                    ? 'text-cyan-400 animate-pulse'
                    : 'text-slate-500'
              }`} />
              <span className="text-[8px] font-mono text-slate-500 uppercase">Pwr</span>
            </div>
            <span className={`text-[10px] font-mono font-bold ${
              rebootState === 'phase1' || rebootState === 'phase2'
                ? 'text-amber-400 animate-pulse'
                : rebootState === 'phase3'
                  ? 'text-cyan-400 animate-pulse'
                  : 'text-slate-200'
            }`}>
              {rebootState === 'phase1'
                ? 'SHUTDOWN'
                : rebootState === 'phase2'
                  ? 'RESTARTING'
                  : rebootState === 'phase3'
                    ? 'BOOTING'
                    : node.powerState === 'AC' ? 'ON' : 'SLEEP'}
            </span>
          </div>
        </div>

        {/* Active Broadcast Feed Address Display (Placed right under Telemetry Vitals, outside AEC locked panel) */}
        <div className="mt-3 bg-slate-950/90 px-3.5 py-2.5 border border-slate-900 rounded-lg flex flex-col gap-1 select-all relative group shadow-sm">
          <span className="text-[9px] font-mono text-slate-500 font-black uppercase tracking-wider flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${node.appState === 'STREAM' ? 'bg-indigo-400 animate-pulse' : 'bg-yellow-400 animate-pulse'}`}></span>
            {locale === 'ja' ? '現在デコード中のアドレス (MPV READOUT):' : 'ACTIVE BROADCAST FEED ADDRESS (MPV READOUT):'}
          </span>
          <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap">
            <span 
              className="text-slate-200 font-mono font-bold text-xs sm:text-sm whitespace-nowrap overflow-hidden block text-right"
              style={{ direction: 'rtl', textAlign: 'left' }}
            >
              {node.streamUri}
            </span>
          </div>
          {/* Custom Hover Info Balloon */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-mono p-2 rounded-lg shadow-2xl max-w-xs z-50 break-all leading-normal">
            {node.streamUri}
          </div>
        </div>
      </div>

      {/* Unified Master Control Panel */}
      <div className={`mb-4 border rounded-xl overflow-hidden transition-all ${controlsUnlocked ? 'bg-rose-950/15 border-rose-600 shadow-[0_0_20px_rgba(225,29,72,0.12)]' : 'bg-slate-950/40 border-rose-900/60'}`} id="unified-control-panel">
        
        {/* Full-width Lock/Unlock Button at the very top */}
        <button 
          onClick={() => {
            setControlsUnlocked(!controlsUnlocked);
          }}
          className={`w-full py-2.5 px-4 text-xs font-mono font-black uppercase transition-all flex items-center justify-center gap-2 border-b relative group ${
            controlsUnlocked 
              ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-[0_0_12px_rgba(225,29,72,0.4)] rounded-t-xl cursor-pointer' 
              : 'bg-black text-rose-500 border-rose-900/80 hover:bg-slate-950 rounded-t-xl cursor-pointer'
          }`}
          style={{ borderWidth: '1px', borderStyle: 'solid' }}
        >
          {node.accessKeyRevoked ? (
            <>
              {controlsUnlocked ? <Unlock className="w-3.5 h-3.5 animate-pulse" /> : <Lock className="w-3.5 h-3.5 text-rose-700" />}
              {controlsUnlocked 
                ? (locale === 'ja' ? 'キー失効中のコントロール有効' : 'UNLOCKED - KEY REVOKED') 
                : (locale === 'ja' ? 'キー失効中につきロック (LOCKED)' : 'LOCKED - ACCESS KEY REVOKED')}
            </>
          ) : (
            <>
              {controlsUnlocked ? <Unlock className="w-3.5 h-3.5 animate-pulse" /> : <Lock className="w-3.5 h-3.5" />}
              {controlsUnlocked 
                ? (locale === 'ja' ? 'コントロール有効 (UNLOCKED)' : 'UNLOCKED - READY FOR CONTROL') 
                : (locale === 'ja' ? 'コントロールロック中 (LOCKED)' : 'LOCKED - CLICK TO UNLOCK')}
            </>
          )}

          {/* Custom Info Bubble on Locked Hover */}
          {!controlsUnlocked && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-2xl font-mono leading-normal normal-case z-50 text-center">
              {locale === 'ja'
                ? '高度エンドポイント制御はロックされています。コントロールを有効にするにはクリックしてロック解除してください。'
                : 'ADVANCED ENDPOINT CONTROLS are currently LOCKED. Unlock the main control panel to configure.'}
            </div>
          )}
        </button>

        {/* ADVANCED ENDPOINT CONTROLS Panel Label - Placed towards the top of the panel */}
        <div className="px-4 py-2.5 bg-slate-950/60 flex items-center gap-2 border-b border-slate-900">
          <Settings2 className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-mono font-extrabold uppercase text-slate-200 tracking-wider">
            {locale === 'ja' ? '高度エンドポイント制御' : 'ADVANCED ENDPOINT CONTROLS'}
          </span>
        </div>

        {/* Combined DECODER ONLINE/ACTIVE Status & Access Key Panel (Section 2/3) */}
        {(() => {
          const isRevoked = !!node.accessKeyRevoked;
          const isCrashed = node.status === 'WARNING';
          const isDesynced = node.appState === 'STANDBY' && globalFleetState === 'STREAM';
          const isWarning = isRevoked || isCrashed || isDesynced;
          
          const statusText = isRevoked
            ? (locale === 'ja' ? '重大: アクセスキー無効' : 'SECURITY: KEY REVOKED')
            : isCrashed 
              ? (locale === 'ja' ? '重大: デコーダークラッシュ' : 'CRITICAL: DECODER CRASH') 
              : isDesynced
                ? (locale === 'ja' ? '状態不整合 (同期エラー)' : 'TELEMETRY INCONSISTENT')
                : (locale === 'ja' ? 'デコーダー正常稼働中' : 'DECODER ONLINE');

          return (
            <div className={`m-4 border rounded-xl p-2 px-3 flex flex-row items-center justify-between gap-2 transition-all duration-300 ${
              isRevoked
                ? 'bg-red-950/20 border-red-800/60 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.08)]'
                : isWarning 
                  ? 'bg-rose-950/20 border-rose-800/60 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.08)]' 
                  : 'bg-emerald-950/15 border-emerald-900/40 text-emerald-400'
            }`} id="detail-active-alert">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`p-1 border rounded transition-colors duration-300 shrink-0 ${
                  isRevoked ? 'bg-red-950 border-red-700/60 text-red-400' :
                  isWarning ? 'bg-rose-950 border-rose-700/60 text-rose-400' : 'bg-emerald-950 border-emerald-800/60 text-emerald-400'
                }`}>
                  {isRevoked ? (
                    <Shield className="w-3.5 h-3.5 animate-pulse text-red-400" />
                  ) : isWarning ? (
                    <AlertTriangle className="w-3.5 h-3.5 animate-pulse text-rose-400" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider truncate">
                  {statusText}
                </span>
              </div>

              {/* REVOKE / RESTORE ACCESS KEY Button inside the Panel */}
              <button
                onClick={() => {
                  const nextRevokedState = !node.accessKeyRevoked;
                  const updates: Partial<FleetEndpoint> = {
                    accessKeyRevoked: nextRevokedState,
                  };
                  
                  if (nextRevokedState) {
                    updates.appState = 'STANDBY';
                    updates.mediaBitrateMbps = 0;
                    updates.streamUri = 'rtmp://10.200.4.1/live/ambient_multicam';
                    updates.logs = [
                      ...node.logs,
                      `[${new Date().toLocaleTimeString()}] SECURITY: Access Key has been REVOKED by Administrator.`,
                      `[${new Date().toLocaleTimeString()}] SECURITY: Terminating all active decoder stream pipelines.`,
                      `[${new Date().toLocaleTimeString()}] SECURITY: Device locked down. All playback stream requests rejected.`
                    ];
                  } else {
                    updates.logs = [
                      ...node.logs,
                      `[${new Date().toLocaleTimeString()}] SECURITY: Access Key has been RESTORED by Administrator.`,
                      `[${new Date().toLocaleTimeString()}] SECURITY: Device unlocked. Decoder services re-enabled.`
                    ];
                  }
                  onUpdateNode(node.id, updates);
                }}
                disabled={!controlsUnlocked}
                className={`px-2 py-1 rounded font-mono font-bold border transition-all cursor-pointer flex items-center gap-1 text-[8.5px] uppercase shrink-0 ${
                  !controlsUnlocked
                    ? 'bg-slate-950/40 border-slate-900/60 text-slate-500 cursor-not-allowed'
                    : node.accessKeyRevoked
                      ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400 hover:bg-emerald-950/60 hover:border-emerald-500'
                      : 'bg-rose-950/30 border-rose-900/40 text-rose-400 hover:bg-rose-950/50 hover:border-rose-500'
                }`}
              >
                <Shield className="w-3 h-3" />
                {node.accessKeyRevoked 
                  ? (locale === 'ja' ? 'キー復旧' : 'RESTORE KEY') 
                  : (locale === 'ja' ? 'キー失効' : 'REVOKE KEY')
                }
              </button>
            </div>
          );
        })()}

        {/* Remote Support Button inside the Locked Panel */}
        <div className="mx-4 mb-4">
          <button
            onClick={() => {
              if (node.accessKeyRevoked || !controlsUnlocked) return;
              onOpenTroubleshoot(node);
            }}
            disabled={node.accessKeyRevoked || !controlsUnlocked}
            className={`w-full py-1.5 border rounded font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${
              node.accessKeyRevoked || !controlsUnlocked
                ? 'bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600/20 hover:bg-indigo-600/40 border-indigo-500/30 text-indigo-300 cursor-pointer'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            {locale === 'ja' ? 'リモートサポート' : 'Remote Support'}
          </button>
        </div>

        {/* Advanced Endpoint Controls Action Controls */}
        <div className="p-4 bg-slate-950/20 flex flex-col gap-4 border-t border-slate-900">

          {/* Section 1: FORCE STREAM OVERRIDE */}
          <div className={`transition-all duration-300 ${controlsUnlocked ? 'opacity-100' : 'opacity-60'} border-b border-slate-900/40 pb-4 flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
              <h5 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-rose-500" />
                {locale === 'ja' ? '1. FORCE STREAM (配信強制割り込み)' : '1. FORCE STREAM OVERRIDE'}
              </h5>
              
              {/* Info Bubble */}
              <div className="relative group inline-block">
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200 cursor-help" />
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-2xl font-mono leading-normal z-50">
                  {locale === 'ja'
                    ? 'すべてのユーザー再生を強制中断し、本番配信用RTMPアドレスを再生させます。'
                    : 'Forces the endpoint to receive the designated stream.'}
                </div>
              </div>
            </div>

            {/* Target RTMP configuration input field */}
            <div className="flex flex-col gap-2 mt-2">
              <input
                type="text"
                value={streamInput}
                onChange={(e) => setStreamInput(e.target.value)}
                disabled={!controlsUnlocked}
                className="w-full bg-slate-950/50 border border-slate-800 text-xs font-mono text-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-rose-500/50 disabled:opacity-50 transition-colors"
                placeholder="rtmp://..."
              />
              <button
                onClick={() => {
                  const finalUri = streamInput.trim();
                  if (!finalUri) {
                    alert(locale === 'ja' ? '有効なRTMPアドレスを入力してください。' : 'Please enter a valid RTMP stream address.');
                    return;
                  }
                  
                  setConfirmAction({
                    type: 'STREAM',
                    callback: () => {
                      if (onTriggerAction) onTriggerAction([node.id], 'STREAM', finalUri);
                    }
                  });
                }
              }
              disabled={!controlsUnlocked || !!node.accessKeyRevoked || (streamState !== 'idle' && streamState !== 'success')}
              className={`w-full py-2 rounded text-[10px] font-mono font-bold border select-none transition-all duration-300 ${
                streamState === 'phase1' || streamState === 'phase2' || streamState === 'phase3'
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse cursor-wait'
                  : streamState === 'success'
                    ? 'bg-emerald-900 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                    : controlsUnlocked 
                      ? 'bg-rose-950/20 border-rose-900/50 text-rose-400 hover:bg-rose-900 hover:border-rose-500 hover:text-white cursor-pointer'
                      : 'bg-slate-950/45 border-slate-900 text-rose-500/30 cursor-not-allowed'
              }`}
            >
              {streamState === 'phase1' ? '1/3 TERMINATING STANDBY...'
               : streamState === 'phase2' ? '2/3 ALLOCATING BUFFER...'
               : streamState === 'phase3' ? '3/3 INITIATING STREAM...'
               : streamState === 'success' ? 'SUCCESS'
               : (locale === 'ja' ? '▲ STREAM OVERRIDE' : '▲ FORCE STREAM')}
            </button>
            </div>
          </div>

          {/* Section 2: FORCE STANDBY (RESTORED) */}
          <div className={`transition-all duration-300 ${controlsUnlocked ? 'opacity-100' : 'opacity-60'} border-b border-slate-900/40 pb-4 flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
              <h5 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Square className="w-3.5 h-3.5 text-yellow-500" />
                {locale === 'ja' ? '2. FORCE STANDBY (強制待機)' : '2. FORCE STANDBY'}
              </h5>
              
              {/* Info Bubble */}
              <div className="relative group inline-block">
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200 cursor-help" />
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-2xl font-mono leading-normal z-50">
                  {locale === 'ja'
                    ? '端末を強制的に環境用バックアップ待機フィードの再生状態に切り替えます。'
                    : 'Forces the endpoint to enter the default standby state.'}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setConfirmAction({
                  type: 'STANDBY',
                  callback: () => {
                    if (onTriggerAction) onTriggerAction([node.id], 'STANDBY');
                  }
                });
              }}
              disabled={!controlsUnlocked || !!node.accessKeyRevoked || (standbyState !== 'idle' && standbyState !== 'success')}
              className={`w-full py-2 rounded text-[10px] font-mono font-bold border select-none transition-all duration-300 ${
                standbyState === 'phase1' || standbyState === 'phase2' || standbyState === 'phase3'
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse cursor-wait'
                  : standbyState === 'success'
                    ? 'bg-emerald-900 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                    : controlsUnlocked 
                      ? 'bg-yellow-950/20 border-yellow-900/50 text-yellow-400 hover:bg-yellow-900 hover:border-yellow-500 hover:text-white cursor-pointer'
                      : 'bg-slate-950/45 border-slate-900 text-yellow-500/30 cursor-not-allowed'
              }`}
            >
              {standbyState === 'phase1' ? '1/3 FLUSHING BUFFER...'
               : standbyState === 'phase2' ? '2/3 SUSPENDING DECODER...'
               : standbyState === 'phase3' ? '3/3 ENTERING STANDBY...'
               : standbyState === 'success' ? 'SUCCESS'
               : (locale === 'ja' ? '▲ STANDBY OVERRIDE' : '▲ FORCE STANDBY')}
            </button>
          </div>

          {/* Section 3: SYSTEM RESYNC */}
          <div className={`transition-all duration-300 ${controlsUnlocked ? 'opacity-100' : 'opacity-60'} border-b border-slate-900/40 pb-4 flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
              <h5 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-rose-500" />
                {locale === 'ja' ? '3. SYSTEM RESYNC (システム再同期)' : '3. SYSTEM RESYNC'}
              </h5>
              
              {/* Info Bubble */}
              <div className="relative group inline-block">
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200 cursor-help" />
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-2xl font-mono leading-normal z-50">
                  {locale === 'ja'
                    ? 'デコーダーパイプラインをクリアし、再生ストリームの通信同期を再実行します。'
                    : 'Recycles stuck decoder pipelines and re-syncs active feed stream.'}
                </div>
              </div>
            </div>
            
            <button
              onClick={() => {
                setConfirmAction({
                  type: 'WATCHDOG',
                  callback: () => {
                    if (onTriggerAction) onTriggerAction([node.id], 'RESYNC');
                  }
                });
              }}
              disabled={!controlsUnlocked || !!node.accessKeyRevoked || (resyncState !== 'idle' && resyncState !== 'success')}
              className={`w-full py-2 rounded text-[10px] font-mono font-bold border transition-all duration-300 ${
                resyncState === 'phase1' || resyncState === 'phase2' || resyncState === 'phase3'
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse cursor-wait'
                  : resyncState === 'success'
                    ? 'bg-emerald-900 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                    : controlsUnlocked 
                      ? 'bg-rose-950/20 border-rose-900/50 text-rose-400 hover:bg-rose-900 hover:border-rose-500 hover:text-white cursor-pointer'
                      : 'bg-slate-950/45 border-slate-900 text-rose-500/30 cursor-not-allowed'
              }`}
            >
              {resyncState === 'phase1' ? '1/3 DISCONNECTING...'
               : resyncState === 'phase2' ? '2/3 RESYNCING PIPELINE...'
               : resyncState === 'phase3' ? '3/3 SYNCING FEED...'
               : resyncState === 'success' ? 'SUCCESS'
               : (locale === 'ja' ? '▲ リセット＆再同期プロセス実行' : '▲ TRIGGER SYSTEM RESYNC')}
            </button>
          </div>

          {/* Section 4: REBOOT DEVICE */}
          <div className={`transition-all duration-300 ${controlsUnlocked ? 'opacity-100' : 'opacity-60'} pb-1 flex flex-col gap-3`}>
            <div className="flex items-center justify-between">
              <h5 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Power className="w-3.5 h-3.5 text-red-500" />
                {locale === 'ja' ? '4. REBOOT DEVICE (ハードウェア再起動)' : '4. REBOOT DEVICE'}
              </h5>
              
              {/* Info Bubble */}
              <div className="relative group inline-block">
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200 cursor-help" />
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-2xl font-mono leading-normal z-50">
                  {locale === 'ja'
                    ? '端末OSに対してフルコールドハードウェア再起動を発行します。一時的に通信が切断されます。'
                    : 'Triggers a cold hardware OS reboot on the endpoint device, temporarily disrupting feed connection.'}
                </div>
              </div>
            </div>
            
            <button
              onClick={() => {
                setConfirmAction({
                  type: 'REBOOT',
                  callback: () => {
                    if (onTriggerAction) onTriggerAction([node.id], 'REBOOT');
                  }
                });
              }}
              disabled={!controlsUnlocked || !!node.accessKeyRevoked || (rebootState !== 'idle' && rebootState !== 'success')}
              className={`w-full py-2 rounded text-[10px] font-mono font-bold border transition-all duration-300 ${
                rebootState === 'phase1' || rebootState === 'phase2' || rebootState === 'phase3'
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse cursor-wait'
                  : rebootState === 'success'
                    ? 'bg-emerald-900 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                    : controlsUnlocked 
                      ? 'bg-red-950/30 border-red-900/50 text-red-400 hover:bg-red-900 hover:border-red-500 hover:text-white cursor-pointer'
                      : 'bg-slate-950/45 border-slate-900 text-red-500/30 cursor-not-allowed'
              }`}
            >
              {rebootState === 'phase1' ? '1/3 SHUTTING DOWN...'
               : rebootState === 'phase2' ? '2/3 REBOOTING OS...'
               : rebootState === 'phase3' ? '3/3 STARTING AGENT...'
               : rebootState === 'success' ? 'SUCCESS'
               : (locale === 'ja' ? '▲ コールド再起動実行' : '▲ REBOOT DEVICE')}
            </button>
          </div>
        </div>
      </div>

      {/* RAM Log Terminal Viewer (Section 6.3) */}
      <div className={`flex-1 bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col transition-all ${isLogExpanded ? 'min-h-[160px]' : ''}`} id="ram-log-terminal">
        <div 
          className={`flex items-center justify-between cursor-pointer group ${isLogExpanded ? 'border-b border-slate-900 pb-2 mb-2' : ''}`}
          onClick={() => setIsLogExpanded(!isLogExpanded)}
        >
          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 font-bold uppercase group-hover:text-slate-300 transition-colors">
            {isLogExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
            {locale === 'ja' ? 'エンドポイント・デバイスログ' : 'ENDPOINT DEVICE LOGS'}
          </span>
          {isLogExpanded && (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {debugMode && (
                <button
                  onClick={triggerWatchdogCheck}
                  className="text-[9px] font-mono text-slate-400 hover:text-slate-100 flex items-center gap-1 border border-slate-800 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-850 cursor-pointer"
                  title="Simulate self-healing service watchdog"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  {locale === 'ja' ? 'ウォッチドッグ' : 'Watchdog'}
                </button>
              )}
              <button
                onClick={exportLogs}
                className="text-[9px] font-mono text-slate-400 hover:text-slate-100 flex items-center gap-1 border border-slate-800 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-850 cursor-pointer"
                title="Export logs to local text file"
              >
                <FileText className="w-2.5 h-2.5" />
                {locale === 'ja' ? 'エクスポート' : 'Export Logs'}
              </button>
              <button
                disabled={harvesting}
                onClick={triggerLogHarvest}
                className={`text-[9px] font-mono px-2 py-0.5 rounded font-semibold transition-all border flex items-center gap-1 cursor-pointer ${
                  harvesting 
                    ? 'bg-slate-900 border-slate-800 text-slate-500' 
                    : 'bg-indigo-950/30 border-indigo-800/40 text-indigo-400 hover:bg-indigo-950/50'
                }`}
              >
                <Send className={`w-2.5 h-2.5 ${harvesting ? 'animate-spin' : ''}`} />
                {harvesting ? (locale === 'ja' ? '収集中...' : 'Harvesting...') : (locale === 'ja' ? 'ログを収集' : 'Harvest Logs')}
              </button>
            </div>
          )}
        </div>
        
        {/* Scrollable Shell Console */}
        {isLogExpanded && (
          <div ref={terminalContainerRef} className="flex-1 overflow-y-auto max-h-[180px] bg-black/40 rounded p-2 text-[10px] font-mono text-slate-300 space-y-1.5 custom-scrollbar mt-2">
            {node.logs.map((log, index) => {
              const isWarning = log.includes('WARNING') || log.includes('ERROR');
              const isSuccess = log.includes('SUCCESS');
              const isAction = log.includes('ACTION') || log.includes('STATE_CHANGE');
              
              return (
                <div 
                  key={index} 
                  className={`leading-relaxed break-words border-l-2 pl-1.5 py-0.5 ${
                    isWarning ? 'text-amber-400 border-amber-500 bg-amber-500/5' : 
                    isSuccess ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5' : 
                    isAction ? 'text-indigo-400 border-indigo-500 bg-indigo-500/5' :
                    'text-slate-400 border-slate-800'
                  }`}
                >
                  {log}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}

      {/* Confirmation Modal */}
      {confirmAction.type && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm rounded-xl">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-5 w-full max-w-sm flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3">
              <div className="bg-rose-950/40 p-2 rounded-lg text-rose-500 border border-rose-900/50">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <h4 className="text-sm font-mono font-bold text-slate-200">
                  {locale === 'ja' ? '強制オーバーライドの確認' : 'Confirm Override action'}
                </h4>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {locale === 'ja' 
                    ? `現在のエンドポイント状態は「${node.appState}」です。`
                    : `Current endpoint status is ${node.appState}.`}
                </p>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {locale === 'ja'
                    ? `本当に「${confirmAction.type === 'WATCHDOG' ? 'SYSTEM RESYNC' : confirmAction.type === 'STREAM' ? 'FORCE STREAM' : confirmAction.type === 'STANDBY' ? 'FORCE STANDBY' : 'REBOOT DEVICE'}」を実行しますか？`
                    : `Are you sure you want to execute ${confirmAction.type === 'WATCHDOG' ? 'SYSTEM RESYNC' : confirmAction.type === 'STREAM' ? 'FORCE STREAM' : confirmAction.type === 'STANDBY' ? 'FORCE STANDBY' : 'REBOOT DEVICE'}?`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-2 pt-4 border-t border-slate-800">
              <button 
                onClick={() => setConfirmAction({ type: null, callback: () => {} })}
                className="px-4 py-1.5 text-xs font-mono font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
              >
                {locale === 'ja' ? 'キャンセル' : 'CANCEL'}
              </button>
              <button 
                onClick={() => {
                  confirmAction.callback();
                  setConfirmAction({ type: null, callback: () => {} });
                }}
                className="px-4 py-1.5 text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 rounded shadow-[0_0_10px_rgba(225,29,72,0.4)] transition-all"
              >
                {locale === 'ja' ? '強制実行 (FORCE)' : 'EXECUTE FORCE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

