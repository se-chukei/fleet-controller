/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FleetEndpoint, ServerMetrics, OperationalState, ActionState, ActionPhase } from './types';
import { generateInitialFleet, getRandomLog } from './data/fleetData';
import DeviceGrid from './components/DeviceGrid';
import DeviceDetail from './components/DeviceDetail';
import TroubleshootPanel from './components/TroubleshootPanel';
import OTAManager from './components/OTAManager';
import ProvisioningLab from './components/ProvisioningLab';
import TVUWebhookSimulator from './components/TVUWebhookSimulator';
import { useTranslation } from './context/LanguageContext';
import { Network, Server, Menu, ArrowDownCircle, AlertCircle, Sparkles, Flame, Check, Shield, Globe, RotateCcw, ExternalLink, Settings2, Database } from 'lucide-react';
import { sourceBase64 } from './source-b64';

export default function App() {
  const { locale, setLocale, t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ota' | 'provisioning'>('dashboard');
  const [showLogoMenu, setShowLogoMenu] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const [isAdmin, setIsAdmin] = useState(urlParams.get('admin') !== 'false');
  const [debugMode, setDebugMode] = useState(false);
  const [showDebugConsole, setShowDebugConsole] = useState(false);
  const isConsoleView = urlParams.get('console') === 'true';

  // Fleet Core State
  const [endpoints, setEndpoints] = useState<FleetEndpoint[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [troubleshootNodeId, setTroubleshootNodeId] = useState<string | null>(null);

  // Global State modifiers
  const [primaryFeedOnline, setPrimaryFeedOnline] = useState(true);
  const [globalFleetState, setGlobalFleetState] = useState<OperationalState>('STREAM');

  // Helper to send updates from the console tab back to the dashboard
  const broadcastConsoleUpdate = (gfs?: OperationalState, pfo?: boolean, eps?: FleetEndpoint[]) => {
    if (!isConsoleView) return;
    const channel = new BroadcastChannel('fleet_control_hub');
    channel.postMessage({
      type: 'UPDATE_STATE_FROM_CONSOLE',
      payload: { globalFleetState: gfs, primaryFeedOnline: pfo, endpoints: eps }
    });
    channel.close();
  };

  // BroadcastChannel synchronization protocol
  useEffect(() => {
    const channel = new BroadcastChannel('fleet_control_hub');
    
    const handleMessage = (e: MessageEvent) => {
      const { type, payload } = e.data || {};
      
      if (type === 'REQUEST_SYNC') {
        // Send current state to the newly opened console
        channel.postMessage({
          type: 'SYNC_STATE_FROM_DASHBOARD',
          payload: { globalFleetState, primaryFeedOnline, endpoints }
        });
      } else if (type === 'SYNC_STATE_FROM_DASHBOARD') {
        if (isConsoleView) {
          const { globalFleetState: gfs, primaryFeedOnline: pfo, endpoints: eps } = payload || {};
          if (gfs !== undefined) setGlobalFleetState(gfs);
          if (pfo !== undefined) setPrimaryFeedOnline(pfo);
          if (eps !== undefined) setEndpoints(eps);
        }
      } else if (type === 'UPDATE_STATE_FROM_CONSOLE') {
        if (!isConsoleView) {
          const { globalFleetState: gfs, primaryFeedOnline: pfo, endpoints: eps } = payload || {};
          if (gfs !== undefined) setGlobalFleetState(gfs);
          if (pfo !== undefined) setPrimaryFeedOnline(pfo);
          if (eps !== undefined) setEndpoints(eps);
        }
      }
    };
    
    channel.addEventListener('message', handleMessage);
    
    // If we are the console view, request initial state sync from the main dashboard
    if (isConsoleView) {
      channel.postMessage({ type: 'REQUEST_SYNC' });
    }
    
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [isConsoleView, globalFleetState, primaryFeedOnline, endpoints]);

  // Sync state changes from main window to open consoles
  useEffect(() => {
    if (isConsoleView || endpoints.length === 0) return;
    const channel = new BroadcastChannel('fleet_control_hub');
    channel.postMessage({
      type: 'SYNC_STATE_FROM_DASHBOARD',
      payload: { globalFleetState, primaryFeedOnline, endpoints }
    });
    channel.close();
  }, [globalFleetState, primaryFeedOnline, endpoints, isConsoleView]);

  // Server metrics tracking (Section 3 & 4)
  const [metrics, setMetrics] = useState<ServerMetrics>({
    totalNodes: 102,
    onlineNodes: 102,
    warningNodes: 0,
    offlineNodes: 0,
    averageRps: 33.3,
    activeRtmpStreams: 101,
    activeUsbStreams: 1,
    averageBandwidthGbps: 0.45,
    privateDerpStatus: 'HEALTHY',
    derpPortTcp: 8443,
    derpPortUdp: 3478,
    telebeatRpsHistory: Array.from({ length: 20 }, () => 31 + Math.floor(Math.random() * 6)),
    serverTempC: 38,
    ramDiskUsageMb: 84
  });

  // Filter selection (Dashboard overview filters)
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [showDormantOnly, setShowDormantOnly] = useState<boolean>(false);

  // Initialize fleet on startup
  useEffect(() => {
    setEndpoints(generateInitialFleet());
  }, []);

  // Close system menu when clicking outside of the menu box
  useEffect(() => {
    if (!showLogoMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#logo-menu-trigger') && !target.closest('#logo-dropdown-menu')) {
        setShowLogoMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showLogoMenu]);

  // Fleet Control Loop & Simulation Timer (Section 3.1 & 6.4)
  useEffect(() => {
    if (endpoints.length === 0) return;

    const interval = setInterval(() => {
      // 1. Decrypt / Decrement USB disconnect debounce countdowns (Section 6.4)
      setEndpoints((prevEndpoints) =>
        prevEndpoints.map((node) => {
          if (node.usbDebounceCountdown !== null) {
            const nextCount = node.usbDebounceCountdown - 1;
            
            if (nextCount <= 0) {
              // Debounce expired -> confirmed disconnect -> failback state
              const targetState = primaryFeedOnline ? 'STREAM' : 'STANDBY';
              const targetUri = primaryFeedOnline 
                ? node.targetStreamUri 
                : 'rtmp://10.200.4.1/live/ambient_multicam';
              
              return {
                ...node,
                usbAttached: false,
                usbDebounceCountdown: null,
                appState: targetState,
                vlcBitrateMbps: primaryFeedOnline ? 4.5 : 2.8,
                streamUri: targetUri,
                logs: [
                  ...node.logs,
                  `[${new Date().toLocaleTimeString()}] FAILOVER: USB link debounce countdown expired (0s). Physical disconnect confirmed.`,
                  `[${new Date().toLocaleTimeString()}] FAILOVER: USB playback prioritized override revoked. Reverting to server state directive: "${targetState}".`
                ]
              };
            }
            
            return {
              ...node,
              usbDebounceCountdown: nextCount
            };
          }
          return node;
        })
      );

      // 2.1. Periodic background random decoder crash simulation (approx 1% chance per second)
      if (Math.random() < 0.01) {
        setEndpoints((prevEndpoints) => {
          const candidates = prevEndpoints.filter(n => n.status === 'ONLINE' && !n.isDormant);
          if (candidates.length > 0) {
            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            return prevEndpoints.map(node => {
              if (node.id === chosen.id) {
                return {
                  ...node,
                  status: 'WARNING',
                  watchdogStep: 1,
                  cpuUsagePercent: 98,
                  deviceTempC: 72,
                  logs: [
                    ...node.logs,
                    `[${new Date().toLocaleTimeString()}] CRITICAL: Native C++ player crash: SIGSEGV (signal 11) in libvlc.so decoder pipeline.`,
                    `[${new Date().toLocaleTimeString()}] CRITICAL: VLC player thread stalled. Screen rendering frozen.`
                  ]
                };
              }
              return node;
            });
          }
          return prevEndpoints;
        });
      }

      // 2. Simulate natural background polling jitter & vitals shifts (Section 3) and sync to status.json
      setEndpoints((prevEndpoints) =>
        prevEndpoints.map((node) => {
          // Offlines don't poll
          if (node.status === 'OFFLINE') return node;

          let updatedNode = { ...node };

          // Continuous / periodic sync to status.json (globalFleetState) unless overridden or USB active
          if (
            !node.isDormant &&
            !node.isDecommissioned &&
            !node.isOverridden &&
            !node.usbAttached &&
            !node.accessKeyRevoked &&
            node.appState !== globalFleetState
          ) {
            const isStream = globalFleetState === 'STREAM';
            updatedNode.appState = globalFleetState;
            updatedNode.vlcBitrateMbps = isStream ? 4.5 : 2.8;
            updatedNode.streamUri = isStream ? node.targetStreamUri : 'rtmp://10.200.4.1/live/ambient_multicam';
            updatedNode.logs = [
              ...node.logs,
              `[${new Date().toLocaleTimeString()}] POLLING: Polling /api/status.json. Syncing player state to fleet directive: "${globalFleetState}"`
            ];
          }

          // ~25% chance of a slight vital variation on any given tick to show real telebeats
          if (Math.random() <= 0.25) {
            const cpuShift = Math.floor(Math.random() * 3) - 1; // -1%, 0, +1%
            const tempShift = Math.floor(Math.random() * 3) - 1; // -1C, 0, +1C
            const newCpu = Math.max(3, Math.min(95, node.cpuUsagePercent + cpuShift));
            const newTemp = Math.max(38, Math.min(85, node.deviceTempC + tempShift));

            // Log shipping simulation background telemetry log
            const newLogs = [...updatedNode.logs];
            if (Math.random() > 0.95) {
              newLogs.push(`[${new Date().toLocaleTimeString()}] telemetry: Sent vital parameters chunk successfully. CPU: ${newCpu}%, Temp: ${newTemp}C, Power: ${node.powerState}.`);
              if (newLogs.length > 50) newLogs.shift(); // Keep RAM memory bounded
            }

            updatedNode.cpuUsagePercent = newCpu;
            updatedNode.deviceTempC = newTemp;
            updatedNode.logs = newLogs;
          }

          return updatedNode;
        })
      );

      // 2.5. Watchdog crash detection & auto-healing simulation (Section 6.2)
      setEndpoints((prevEndpoints) =>
        prevEndpoints.map((node) => {
          if (node.status === 'WARNING') {
            const step = node.watchdogStep;
            if (step) {
              const newLogs = [...node.logs];
              if (step === 1) {
                newLogs.push(`[${new Date().toLocaleTimeString()}] [Watchdog] WARNING: VLC player thread stall detected. Native surface rendering is frozen.`);
                newLogs.push(`[${new Date().toLocaleTimeString()}] [Watchdog] ACTION: Initiating local application service restart (Attempt 1/2)...`);
                return {
                  ...node,
                  watchdogStep: 2,
                  logs: newLogs
                };
              } else if (step === 2) {
                newLogs.push(`[${new Date().toLocaleTimeString()}] [Watchdog] ERROR: Application restart failed to bind to SurfaceView overlay (Binder exception). Player unresponsive.`);
                newLogs.push(`[${new Date().toLocaleTimeString()}] [Watchdog] ACTION: Application recovery failed. Watchdog triggering autonomous hardware system reboot...`);
                return {
                  ...node,
                  watchdogStep: 3,
                  logs: newLogs
                };
              } else if (step === 3) {
                newLogs.push(`[${new Date().toLocaleTimeString()}] [Watchdog] SYSTEM: Shutting down system services. Rebooting device now...`);
                return {
                  ...node,
                  status: 'OFFLINE',
                  watchdogStep: 4,
                  logs: newLogs
                };
              }
            }
          } else if (node.status === 'OFFLINE' && node.watchdogStep === 4) {
            const newLogs = [...node.logs];
            newLogs.push(`[${new Date().toLocaleTimeString()}] [Boot] Android OS Booting (com.se_chukei.fleetcontroller Init Phase)...`);
            newLogs.push(`[${new Date().toLocaleTimeString()}] [Boot] Tailscale interface up. Assigned IP: ${node.tailscaleIp}`);
            newLogs.push(`[${new Date().toLocaleTimeString()}] [Boot] Foreground service started successfully. Re-binding to VLC RTMP stream...`);
            return {
              ...node,
              status: 'ONLINE',
              watchdogStep: undefined,
              cpuUsagePercent: 12,
              deviceTempC: 45,
              logs: newLogs
            };
          }
          return node;
        })
      );

      // 3. Dynamic Telebeat Ingest RPS history calculation
      setMetrics((prev) => {
        // Base rate around 33.3 RPS for 100 devices polling average 3s
        // We add some natural uniform noise oscillations (29 to 37)
        const currentRps = 29 + Math.random() * 8;
        const newHistory = [...prev.telebeatRpsHistory.slice(1), parseFloat(currentRps.toFixed(1))];
        const averageRps = parseFloat((newHistory.reduce((a, b) => a + b, 0) / newHistory.length).toFixed(1));
        
        // Count statuses
        let online = 0;
        let warning = 0;
        let offline = 0;
        let rtmpCount = 0;
        let usbCount = 0;
        let totalBandwidth = 0;

        endpoints.forEach((n) => {
          if (n.status === 'ONLINE') online++;
          else if (n.status === 'WARNING') {
            online++; // Warnings are technically alive
            warning++;
          } else offline++;

          if (n.appState === 'STREAM' || n.appState === 'STANDBY') {
            rtmpCount++;
            totalBandwidth += n.vlcBitrateMbps;
          } else {
            usbCount++; // USB storage doesn't consume network bandwidth
          }
        });

        // Convert total megabits to gigabits
        const bandwidthGbps = parseFloat((totalBandwidth / 1000).toFixed(2));
        // Volatile disk consumption shifts slightly
        const diskConsumption = Math.min(500, Math.max(64, prev.ramDiskUsageMb + (Math.random() > 0.5 ? 1 : -1)));

        return {
          ...prev,
          onlineNodes: online,
          warningNodes: warning,
          offlineNodes: offline,
          averageRps,
          activeRtmpStreams: rtmpCount,
          activeUsbStreams: usbCount,
          averageBandwidthGbps: bandwidthGbps,
          telebeatRpsHistory: newHistory,
          ramDiskUsageMb: diskConsumption
        };
      });

    }, 1000);

    return () => clearInterval(interval);
  }, [endpoints, primaryFeedOnline]);

  const [activeActions, setActiveActions] = useState<{ [nodeId: string]: ActionState } | null>(null);

  const handleTriggerAction = (nodeIds: string[], type: 'STREAM' | 'STANDBY' | 'RESYNC' | 'REBOOT', streamUri?: string) => {
    setActiveActions((prev) => {
      const next = { ...prev };
      nodeIds.forEach(id => {
        next[id] = { type, phase: 'PENDING', ...(streamUri ? { streamUri } : {}) } as ActionState;
      });
      return next;
    });
  };

  useEffect(() => {
    if (!activeActions) return;

    const allNominal = Object.keys(activeActions).length === 0 || Object.values(activeActions).every((a: ActionState) => a.phase === 'NOMINAL');
    if (allNominal) {
      const timeout = setTimeout(() => setActiveActions(null), 3000);
      return () => clearTimeout(timeout);
    }

    const interval = setInterval(() => {
      setActiveActions(prev => {
        if (!prev) return null;
        const next = { ...prev };
        let madeChange = false;

        const phases: ActionPhase[] = ['PENDING', 'PHASE_1', 'PHASE_2', 'PHASE_3', 'NOMINAL'];

        Object.keys(next).forEach(nodeId => {
          const action = next[nodeId];
          if (action.phase !== 'NOMINAL') {
            const currentIndex = phases.indexOf(action.phase);
            if (Math.random() < 0.7) {
              const nextPhase = phases[currentIndex + 1];
              next[nodeId] = { ...action, phase: nextPhase };
              madeChange = true;

              if (nextPhase === 'NOMINAL') {
                setEndpoints(currentEndpoints => currentEndpoints.map(node => {
                  if (node.id === nodeId) {
                    if (action.type === 'STREAM') {
                      return {
                        ...node,
                        appState: 'STREAM',
                        isOverridden: true,
                        targetStreamUri: (action as any).streamUri || node.targetStreamUri,
                        streamUri: (action as any).streamUri || node.streamUri,
                        vlcBitrateMbps: 4.5,
                        logs: [
                          ...node.logs,
                          `[${new Date().toLocaleTimeString()}] OVERRIDE: FORCE STREAM command executed.`,
                          `[${new Date().toLocaleTimeString()}] VLC: Binding player to forced livestream URI.`
                        ]
                      };
                    } else if (action.type === 'STANDBY') {
                      return {
                        ...node,
                        appState: 'STANDBY',
                        isOverridden: true,
                        vlcBitrateMbps: 2.8,
                        streamUri: 'rtmp://10.200.4.1/live/ambient_multicam',
                        logs: [
                          ...node.logs,
                          `[${new Date().toLocaleTimeString()}] OVERRIDE: FORCE STANDBY command executed.`,
                          `[${new Date().toLocaleTimeString()}] VLC: Diverting player decoder to ambient fallback loop.`
                        ]
                      };
                    } else if (action.type === 'RESYNC') {
                      return {
                        ...node,
                        status: 'ONLINE',
                        watchdogStep: undefined,
                        deviceTempC: 45,
                        cpuUsagePercent: 12,
                        appState: globalFleetState as any,
                        vlcBitrateMbps: globalFleetState === 'STREAM' ? 4.5 : (globalFleetState === 'PLAYBACK' ? 12.8 : 2.8),
                        streamUri: globalFleetState === 'STREAM' 
                          ? node.targetStreamUri 
                          : (globalFleetState === 'PLAYBACK' ? 'file:///mnt/media_rw/usb_drive/loop.mp4' : 'rtmp://10.200.4.1/live/ambient_multicam'),
                        logs: [
                          ...node.logs,
                          `[${new Date().toLocaleTimeString()}] WATCHDOG: Manual reset and re-sync sequence triggered by Administrator.`
                        ]
                      };
                    } else if (action.type === 'REBOOT') {
                      return {
                        ...node,
                        status: 'ONLINE',
                        watchdogStep: undefined,
                        deviceTempC: 42,
                        cpuUsagePercent: 8,
                        appState: globalFleetState as any,
                        vlcBitrateMbps: globalFleetState === 'STREAM' ? 4.5 : (globalFleetState === 'PLAYBACK' ? 12.8 : 2.8),
                        streamUri: globalFleetState === 'STREAM' 
                          ? node.targetStreamUri 
                          : (globalFleetState === 'PLAYBACK' ? 'file:///mnt/media_rw/usb_drive/loop.mp4' : 'rtmp://10.200.4.1/live/ambient_multicam'),
                        logs: [
                          ...node.logs,
                          `[${new Date().toLocaleTimeString()}] REBOOT: Cold hardware OS reboot complete. Re-established Tailscale data bridge (${node.tailscaleIp}), ADB USB debug link, and telemetry sockets.`
                        ]
                      };
                    }
                  }
                  return node;
                }));
              }
            }
          }
        });
        return madeChange ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeActions, globalFleetState]);

  // Update details of a single node in fleet
  const handleUpdateNode = (nodeId: string, updates: Partial<FleetEndpoint>) => {
    setEndpoints((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
    );
    if (updates.id) {
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(updates.id);
      }
      if (troubleshootNodeId === nodeId) {
        setTroubleshootNodeId(updates.id);
      }
    }
  };

  // Swap / replace retired hardware with an unassigned dormant device
  const handleSwapDevice = (oldNodeId: string, newNodeId: string) => {
    const oldNode = endpoints.find(e => e.id === oldNodeId);
    const newNode = endpoints.find(e => e.id === newNodeId);
    if (!oldNode || !newNode) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const decomId = `DECOM ${dateStr}_${oldNodeId}`;

    setEndpoints((prev) =>
      prev.map((node) => {
        if (node.id === oldNodeId) {
          // Decommission/retire the old hardware node and rename its ID/name
          return {
            ...node,
            id: decomId,
            name: decomId,
            isDormant: false,
            isDecommissioned: true,
            decommissionedFrom: oldNode.name || oldNodeId,
            decommissionedAt: new Date().toLocaleString(),
            replacementNodeId: newNodeId,
            status: 'OFFLINE',
            appState: 'STREAM',
            vlcBitrateMbps: 0,
            streamId: '',
            logs: [
              ...node.logs,
              `[${new Date().toLocaleTimeString()}] DECOMMISSIONED: This physical hardware unit has been decommissioned and retired from location "${oldNode.name || oldNodeId}". Replaced by "${newNodeId}".`
            ]
          };
        }
        if (node.id === newNodeId) {
          // Provision the new hardware node with the old location profile
          return {
            ...node,
            name: oldNode.name,
            isDormant: false,
            isDecommissioned: false,
            status: 'ONLINE',
            appState: oldNode.appState,
            vlcBitrateMbps: 4.5,
            streamId: oldNode.streamId || `venue_stream_${oldNode.id}`,
            targetStreamUri: oldNode.targetStreamUri,
            streamUri: oldNode.streamUri,
            logs: [
              ...node.logs,
              `[${new Date().toLocaleTimeString()}] HARDWARE SWAP COMPLETED: Staging finished. Took over location "${oldNode.name}" configuration from decommissioned unit "${oldNodeId}".`
            ]
          };
        }
        return node;
      })
    );

    // Stay on the details pane, but focus on the newly swapped device ID
    setSelectedNodeId(newNodeId);
  };

  // Push an OTA update to a single node (Section 6.1 specs)
  const handleTriggerNodeOta = (nodeId: string) => {
    setEndpoints((prev) =>
      prev.map((node) => {
        if (node.id === nodeId) {
          const otaLogs = [
            `[${new Date().toLocaleTimeString()}] OTA: Update target versionCode mismatch detected. Client: ${node.versionCode} vs Server Approved: 104`,
            `[${new Date().toLocaleTimeString()}] OTA: Downloading fleet-controller.apk binary over Tailscale mesh...`,
            `[${new Date().toLocaleTimeString()}] OTA: Bytes downloaded successfully. Executing silent background PackageInstaller session.`,
            `[${new Date().toLocaleTimeString()}] OTA: unattended installation committed. com.se_chukei.fleetcontroller service auto-restart successfully.`,
            `[${new Date().toLocaleTimeString()}] com.se_chukei.fleetcontroller Service initialized on boot (versionCode: 104).`
          ];
          return {
            ...node,
            versionCode: 104, // upgraded to newest
            logs: [...node.logs, ...otaLogs]
          };
        }
        return node;
      })
    );
  };

  // Simulate a node decoder crash (Section 6.2 watchdog)
  const triggerRandomDecoderCrash = () => {
    let targetNode = endpoints.find((n) => n.id === selectedNodeId && n.status === 'ONLINE');
    
    if (!targetNode) {
      const onlineNodes = endpoints.filter((n) => n.status === 'ONLINE');
      if (onlineNodes.length === 0) return;
      targetNode = onlineNodes[Math.floor(Math.random() * onlineNodes.length)];
    }

    setEndpoints((prev) =>
      prev.map((node) => {
        if (node.id === targetNode!.id) {
          return {
            ...node,
            status: 'WARNING',
            watchdogStep: 1, // initialize watchdog auto-healing sequence
            cpuUsagePercent: 98,
            deviceTempC: 72,
            logs: [
              ...node.logs,
              `[${new Date().toLocaleTimeString()}] CRITICAL: Native C++ player crash: SIGSEGV (signal 11) in libvlc.so decoder pipeline.`,
              `[${new Date().toLocaleTimeString()}] CRITICAL: VLC player thread stalled. Screen rendering frozen.`
            ]
          };
        }
        return node;
      })
    );
  };

  // Simulate global RTMP network signal drop (Section 6.4 Local Priority)
  const togglePrimaryFeedSignal = () => {
    const nextState = !primaryFeedOnline;
    setPrimaryFeedOnline(nextState);

    setEndpoints((prev) => {
      const next = prev.map((node) => {
        const newLogs = [...node.logs];
        let appState = node.appState;
        let bitrate = node.vlcBitrateMbps;
        let uri = node.streamUri;

        if (!nextState) {
          // RTMP Signal Loss!
          newLogs.push(`[${new Date().toLocaleTimeString()}] ALERT: RTMP socket socket_reset_by_peer on primary venue feed!`);
          
          if (node.usbAttached && node.usbDebounceCountdown === null) {
            // Local USB priorities trigger over server backup! (Section 6.4)
            appState = 'PLAYBACK';
            bitrate = 12.8;
            uri = 'file:///mnt/media_rw/usb_drive/loop.mp4';
            newLogs.push(`[${new Date().toLocaleTimeString()}] FAILOVER: Signal loss detected. Local priority USB attached. Overriding to local loop playback.`);
          } else {
            // No USB, fallback to ambient backup feed (STANDBY)
            appState = 'STANDBY';
            bitrate = 2.8;
            uri = 'rtmp://10.200.4.1/live/ambient_multicam';
            newLogs.push(`[${new Date().toLocaleTimeString()}] FAILOVER: Signal loss detected. No local USB. Swapping VLC rendering to ambient backup feed.`);
          }
        } else {
          // RTMP Signal Restored!
          newLogs.push(`[${new Date().toLocaleTimeString()}] SUCCESS: Primary venue broadcast signal recovered. Synchronizing decoders.`);
          
          if (node.usbAttached && node.usbDebounceCountdown === null) {
            // USB maintains priority override (Section 6.4)
            appState = 'PLAYBACK';
            bitrate = 12.8;
            uri = 'file:///mnt/media_rw/usb_drive/loop.mp4';
          } else {
            appState = 'STREAM';
            bitrate = 4.5;
            uri = node.targetStreamUri;
            newLogs.push(`[${new Date().toLocaleTimeString()}] STATE_RESTORE: Reverted to server stream target: "${node.targetStreamUri}"`);
          }
        }

        return {
          ...node,
          appState,
          vlcBitrateMbps: bitrate,
          streamUri: uri,
          logs: newLogs
        };
      });
      if (isConsoleView) {
        broadcastConsoleUpdate(undefined, nextState, next);
      }
      return next;
    });
  };

  const triggerTvuWebhook = (event: 'stream_start' | 'stream_stop') => {
    const nextState = event === 'stream_start' ? 'STREAM' : 'STANDBY';
    setGlobalFleetState(nextState);

    setEndpoints((prev) => {
      const next = prev.map((node) => {
        if (node.isDormant || node.isDecommissioned) return node;

        const newLogs = [...node.logs];
        let appState = node.appState;
        let bitrate = node.vlcBitrateMbps;
        let uri = node.streamUri;

        if (event === 'stream_start') {
          // Stream Start Webhook
          newLogs.push(`[${new Date().toLocaleTimeString()}] [TVU Webhook] RECEIVED event "stream_start" on data bridge.`);
          
          if (node.usbAttached && node.usbDebounceCountdown === null) {
            appState = 'PLAYBACK';
            bitrate = 12.8;
            uri = 'file:///mnt/media_rw/usb_drive/loop.mp4';
            newLogs.push(`[${new Date().toLocaleTimeString()}] [TVU Webhook] USB override remains active. Maintaining local loop.`);
          } else {
            appState = 'STREAM';
            bitrate = 4.5;
            uri = node.targetStreamUri;
            newLogs.push(`[${new Date().toLocaleTimeString()}] [TVU Webhook] Syncing player decoder to broadcast stream: "${node.targetStreamUri}"`);
          }
        } else {
          // Stream Stop Webhook
          newLogs.push(`[${new Date().toLocaleTimeString()}] [TVU Webhook] RECEIVED event "stream_stop" on data bridge.`);
          
          if (node.usbAttached && node.usbDebounceCountdown === null) {
            appState = 'PLAYBACK';
            bitrate = 12.8;
            uri = 'file:///mnt/media_rw/usb_drive/loop.mp4';
            newLogs.push(`[${new Date().toLocaleTimeString()}] [TVU Webhook] USB override remains active. Maintaining local loop.`);
          } else {
            appState = 'STANDBY';
            bitrate = 2.8;
            uri = 'rtmp://10.200.4.1/live/ambient_multicam';
            newLogs.push(`[${new Date().toLocaleTimeString()}] [TVU Webhook] Command received. Diverting decoder to ambient backup feed.`);
          }
        }

        return {
          ...node,
          appState,
          vlcBitrateMbps: bitrate,
          streamUri: uri,
          logs: newLogs
        };
      });
      if (isConsoleView) {
        broadcastConsoleUpdate(nextState, undefined, next);
      }
      return next;
    });
  };

  const handleBulkUpdate = (
    updater: Partial<FleetEndpoint> | ((node: FleetEndpoint) => Partial<FleetEndpoint>)
  ) => {
    setEndpoints((prev) => {
      const next = prev.map((node) => {
        if (node.isDormant || node.isDecommissioned) return node;
        const updates = typeof updater === 'function' ? updater(node) : updater;
        if (Object.keys(updates).length === 0) return node;
        return { ...node, ...updates };
      });
      if (isConsoleView) {
        broadcastConsoleUpdate(undefined, undefined, next);
      }
      return next;
    });
  };

  const selectedNode = endpoints.find((n) => n.id === selectedNodeId);
  const troubleshootNode = endpoints.find((n) => n.id === troubleshootNodeId);

  if (isConsoleView) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center p-4">
        <TVUWebhookSimulator
          globalFleetState={globalFleetState}
          onTriggerWebhook={triggerTvuWebhook}
          primaryFeedOnline={primaryFeedOnline}
          onTogglePrimaryFeed={togglePrimaryFeedSignal}
          endpoints={endpoints}
          onUpdateNode={handleUpdateNode}
          onClose={() => window.close()}
          isStandalone={true}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Header Banner */}
      <header className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-4 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <button
              onClick={() => setShowLogoMenu(!showLogoMenu)}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-2 bg-gradient-to-br from-indigo-600/20 to-slate-900/10 hover:from-indigo-600/30 hover:to-slate-900/20 border border-indigo-600/30 hover:border-indigo-500/50 rounded-xl shadow-inner shadow-indigo-500/10 cursor-pointer transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500/40 relative group"
              id="logo-menu-trigger"
              title={locale === 'ja' ? 'システムメニューを開く' : 'Open System Menu'}
            >
              <Menu className="w-6 h-6 text-indigo-400 group-hover:scale-105 transition-transform" />
            </button>

            {showLogoMenu && (
              <div 
                className="absolute left-0 top-full mt-2 w-72 bg-slate-950/95 border border-indigo-500/30 rounded-xl p-2.5 shadow-2xl backdrop-blur-md z-50 animate-in fade-in slide-in-from-top-2 duration-200 text-left"
                id="logo-dropdown-menu"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="px-3 py-2 border-b border-slate-900 mb-2">
                    <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest block">
                      {locale === 'ja' ? 'システムメニュー' : 'SYSTEM MENU'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {/* Language Toggler */}
                    <div className="px-3 py-1.5 flex items-center justify-between text-xs font-sans text-slate-300 hover:bg-slate-900/50 rounded-lg">
                      <span className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-indigo-400" />
                        {locale === 'ja' ? '表示言語' : 'Display Language'}
                      </span>
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
                        <button
                          onClick={() => setLocale('en')}
                          className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-all cursor-pointer ${
                            locale === 'en' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          EN
                        </button>
                        <button
                          onClick={() => setLocale('ja')}
                          className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-all cursor-pointer ${
                            locale === 'ja' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          JA
                        </button>
                      </div>
                    </div>

                    {/* Toggle Admin Mode */}
                    <button
                      onClick={() => {
                        setIsAdmin(!isAdmin);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-sans text-slate-300 hover:bg-slate-900/50 rounded-lg transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-indigo-400" />
                        {locale === 'ja' ? '管理者モード' : 'Admin Mode'}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                        isAdmin ? 'bg-amber-950/40 text-amber-400 border-amber-800/40' : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}>
                        {isAdmin ? 'ACTIVE' : 'OFF'}
                      </span>
                    </button>

                    {/* Toggle Debug Mode */}
                    <button
                      onClick={() => {
                        setDebugMode(!debugMode);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-sans text-slate-300 hover:bg-slate-900/50 rounded-lg transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-indigo-400" />
                        {locale === 'ja' ? '端末デバッグモード' : 'Endpoint Debug Mode'}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                        debugMode ? 'bg-amber-950/40 text-amber-400 border-amber-800/40' : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}>
                        {debugMode ? 'ACTIVE' : 'OFF'}
                      </span>
                    </button>

                    {/* Launch Data Bridge Debug Console */}
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setShowLogoMenu(false);
                          setShowDebugConsole(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-sans text-slate-300 hover:bg-slate-900/50 rounded-lg transition-colors flex items-center justify-between group cursor-pointer border-t border-slate-900/40 mt-1 pt-1.5"
                      >
                        <span className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-emerald-400 animate-pulse" />
                          {locale === 'ja' ? 'デバッグコンソール起動' : 'Launch Debug Console'}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold border bg-emerald-950/40 text-emerald-400 border-emerald-800/40 animate-pulse">
                          EXE / POPUP
                        </span>
                      </button>
                    )}
                  </div>
                </div>
            )}
          </div>
          <div>
            <h1 className="text-sm font-mono font-bold tracking-widest text-slate-100 uppercase flex items-center gap-2">
              {t('brand')}
              {debugMode && (
                <span className="text-[10px] bg-amber-950/80 border border-amber-800/40 text-amber-400 px-2 py-0.5 rounded font-mono font-bold tracking-normal animate-pulse">
                  {locale === 'ja' ? 'デバッグモード' : 'DEBUG ACTIVE'}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 font-sans mt-0.5">{t('dashboardSubtitle')}</p>
          </div>
        </div>

        {/* Global failure/failover injection simulators */}
        <div className="flex flex-wrap items-center gap-2" id="global-simulators">
          {debugMode && (
            <>
              <button
                onClick={triggerRandomDecoderCrash}
                className="py-1.5 px-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-amber-500 hover:text-amber-400 transition-all flex items-center gap-1.5 shadow"
                title="Simulate random native C++ crash of VLC for Android client service to test self-healing Watchdogs"
              >
                <Flame className="w-4 h-4" />
                {t('simulateCrash')}
              </button>

              <button
                onClick={() => {
                  if (window.confirm(locale === 'ja' ? 'すべての端末状態を初期化しますか？' : 'Reset all devices to default state?')) {
                    setEndpoints(generateInitialFleet());
                    setPrimaryFeedOnline(true);
                    setGlobalFleetState('STREAM');
                    setSelectedNodeId(null);
                    setTroubleshootNodeId(null);
                  }
                }}
                className="py-1.5 px-3 bg-slate-950 hover:bg-rose-950/20 hover:text-rose-400 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 transition-all flex items-center gap-1.5 shadow cursor-pointer"
                title={locale === 'ja' ? 'すべての端末状態を工場出荷時に初期化' : 'Factory reset all fleet devices to default state'}
              >
                <RotateCcw className="w-4 h-4 text-slate-500 hover:text-rose-400 transition-colors" />
                <span>{locale === 'ja' ? '全初期化' : 'Reset Fleet'}</span>
              </button>
            </>
          )}

          {debugMode && (
            <a
              href="https://aistudio.google.com/apps/dcd09faf-fb1b-4dd2-bf8a-2cabe3fc05fe?fullscreenApplet=true&showPreview=true&showAssistant=true"
              target="_blank"
              rel="noopener noreferrer"
              className="py-1.5 px-3 bg-slate-950 hover:bg-indigo-950/20 hover:text-indigo-400 border border-indigo-950/40 hover:border-indigo-500/50 rounded-lg text-xs font-mono text-slate-400 transition-all flex items-center gap-1.5 shadow cursor-pointer"
              title={locale === 'ja' ? 'アプリを新しいブラウザタブで開く' : 'Open app in a separate browser tab'}
            >
              <ExternalLink className="w-4 h-4 text-slate-500 hover:text-indigo-400 transition-colors" />
              <span>{locale === 'ja' ? '別タブで開く' : 'Open Tab'}</span>
            </a>
          )}
        </div>
      </header>

      {/* Main Container / Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* Navigation Tabs bar */}
        <div className="flex border-b border-slate-800/60 pb-px" id="navigation-tabs">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-3 px-6 text-xs font-mono font-bold border-b-2 transition-all uppercase tracking-wider flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-950/10'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Network className="w-4 h-4" />
            {t('tabVitals')}
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('ota')}
                className={`py-3 px-6 text-xs font-mono font-bold border-b-2 transition-all uppercase tracking-wider flex items-center gap-2 ${
                  activeTab === 'ota'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-950/10'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" />
                {t('tabOta')}
              </button>

              <button
                onClick={() => setActiveTab('provisioning')}
                className={`py-3 px-6 text-xs font-mono font-bold border-b-2 transition-all uppercase tracking-wider flex items-center gap-2 ${
                  activeTab === 'provisioning'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-950/10'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Server className="w-4 h-4" />
                {t('tabProvisioning')}
              </button>
            </>
          )}
        </div>

        {/* High Priority Alerts (VLC Crashed / Inactive Standby) */}
        {(() => {
          const crashedNodes = endpoints.filter(
            (node) => node.status === 'WARNING' || node.accessKeyRevoked || (node.appState === 'STANDBY' && globalFleetState === 'STREAM')
          );
          if (crashedNodes.length === 0) return null;
          return (
            <div className="bg-rose-950/25 border rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-glow-pulse" id="high-priority-alert-banner">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-2.5 py-1 bg-rose-900/50 border border-rose-700/60 rounded-lg text-rose-400 font-mono text-xs font-black uppercase tracking-wider shrink-0 select-none">
                  <Flame className="w-4 h-4 text-rose-500 animate-flicker" />
                  <span>{locale === 'ja' ? '要確認' : 'ALERTS'}</span>
                </div>
                
                {/* Prioritized Affected Endpoints */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {crashedNodes.map(node => {
                    const cleanName = (node.name || `HW-${node.id.slice(-4)}`).replace('GTV Streamer - ', '');
                    return (
                      <button 
                        key={node.id} 
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          setActiveTab('dashboard');
                        }}
                        className="px-2.5 py-1 text-xs font-mono font-extrabold bg-rose-900 border border-rose-500/50 hover:border-rose-400 text-rose-200 hover:text-white rounded transition-all cursor-pointer shadow-[0_0_8px_rgba(244,63,94,0.3)] flex items-center gap-1.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 animate-sync-pulse" />
                        {cleanName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Tab Contents Layout */}
        <div className="flex-1 flex flex-col min-h-0">
          {activeTab === 'dashboard' && (
            <div className="flex-1 flex flex-col gap-6 min-h-0" id="tab-dashboard">
              
              <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
                {/* Left Column: Metrics & Visual Node Grid */}
                <div className="flex-1 flex flex-col gap-6 min-h-0">
                  <DeviceGrid
                    endpoints={endpoints}
                    onSelectEndpoint={(node) => setSelectedNodeId(node.id)}
                    selectedEndpointId={selectedNodeId || undefined}
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    globalFleetState={globalFleetState}
                    isAdmin={isAdmin}
                    showDormantOnly={showDormantOnly}
                    onDormantToggle={setShowDormantOnly}
                    activeActions={activeActions}
                    onTriggerAction={handleTriggerAction}
                  />
                </div>

                {/* Right Column: Selected Node Vitals & Terminal Sandbox */}
                {selectedNode ? (
                  <div className="w-full lg:w-[420px] flex-shrink-0">
                    <DeviceDetail
                      node={selectedNode}
                      onClose={() => setSelectedNodeId(null)}
                      onUpdateNode={handleUpdateNode}
                      onOpenTroubleshoot={(node) => setTroubleshootNodeId(node.id)}
                      isAdmin={isAdmin}
                      endpoints={endpoints}
                      onSwapDevice={handleSwapDevice}
                      globalFleetState={globalFleetState}
                      debugMode={debugMode}
                      activeActions={activeActions}
                      onTriggerAction={handleTriggerAction}
                    />
                  </div>
                ) : (
                  <div className="w-full lg:w-[420px] border border-dashed border-slate-800/80 rounded-xl p-6 flex flex-col items-center justify-center text-center bg-slate-900/10">
                    <Server className="w-8 h-8 text-slate-700 mb-2" />
                    <h3 className="text-xs font-mono text-slate-400 uppercase font-semibold">{t('noEndpointSelected')}</h3>
                    <p className="text-[11px] text-slate-500 font-mono mt-1 max-w-[240px] leading-relaxed">
                      {t('endpointInstructions')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {isAdmin && activeTab === 'ota' && (
            <OTAManager 
              endpoints={endpoints}
              onTriggerNodeOta={handleTriggerNodeOta}
              onUpdateNode={handleUpdateNode}
            />
          )}

          {isAdmin && activeTab === 'provisioning' && (
            <ProvisioningLab />
          )}
        </div>
      </main>

      {/* Persistent Diagnostics Overlay Portal (TroubleshootPanel - Section 5) */}
      {troubleshootNode && (
        <TroubleshootPanel
          node={troubleshootNode}
          onClose={() => setTroubleshootNodeId(null)}
          onUpdateNode={handleUpdateNode}
        />
      )}

      {/* Outer master control status bar (SteamOS style Performance Overlay) */}
      <footer className="bg-slate-950 border-t border-slate-900 py-1.5 px-4 flex items-center justify-center gap-6 text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="text-slate-300 font-bold uppercase tracking-wider">Bridge Active</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-2">
            <span className="uppercase text-slate-500">Relay (Derper):</span>
            <span className={metrics.privateDerpStatus === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}>
              {metrics.privateDerpStatus}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-2">
            <span className="uppercase text-slate-500">Ingestion:</span>
            <span className="text-indigo-400 font-bold">{metrics.averageRps.toFixed(1)} RPS</span>
          </div>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            <span className="text-[9px] uppercase text-slate-500">Nodes</span>
            <span className="text-emerald-400 font-bold">{metrics.onlineNodes}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">{metrics.totalNodes}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="uppercase text-slate-500">Load</span>
            <div className="w-24 h-4 bg-slate-900 border border-slate-800 rounded flex items-end px-0.5 gap-px">
              {metrics.telebeatRpsHistory.slice(-24).map((val, i) => {
                const h = Math.max(10, Math.min(100, ((val - 20) / 25) * 100));
                return (
                  <div key={i} className="w-1 bg-indigo-500/80 rounded-t-sm transition-all duration-300" style={{ height: `${h}%` }}></div>
                );
              })}
            </div>
          </div>
        </div>
      </footer>

      {showDebugConsole && (
        <TVUWebhookSimulator
          globalFleetState={globalFleetState}
          onTriggerWebhook={triggerTvuWebhook}
          primaryFeedOnline={primaryFeedOnline}
          onTogglePrimaryFeed={togglePrimaryFeedSignal}
          endpoints={endpoints}
          onUpdateNode={handleUpdateNode}
          onClose={() => setShowDebugConsole(false)}
        />
      )}

    </div>
  );
}
