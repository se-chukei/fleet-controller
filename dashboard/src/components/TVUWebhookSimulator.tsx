/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, Code, Terminal, ArrowRight, Check, Copy, 
  Laptop, Server, HelpCircle, Activity, Wifi, WifiOff, FileText, Database, Settings2, CheckSquare, X, Minus, ChevronUp, ChevronDown, Shield
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { FleetEndpoint } from '../types';

interface Props {
  globalFleetState: 'STREAM' | 'STANDBY' | 'PLAYBACK';
  onTriggerWebhook: (event: 'stream_start' | 'stream_stop') => void;
  primaryFeedOnline: boolean;
  onTogglePrimaryFeed: () => void;
  endpoints: FleetEndpoint[];
  onUpdateNode: (nodeId: string, updates: Partial<FleetEndpoint>) => void;
  onClose: () => void;
  isStandalone?: boolean;
}

export default function TVUWebhookSimulator({ 
  globalFleetState, 
  onTriggerWebhook, 
  primaryFeedOnline, 
  onTogglePrimaryFeed,
  endpoints,
  onUpdateNode,
  onClose,
  isStandalone = false
}: Props) {
  const { locale } = useTranslation();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status_json' | 'webhook' | 'logs'>('status_json');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Position state for dragging
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Custom resizing state for the console window
  const [size, setSize] = useState({ width: 480, height: 600 });
  const [resizing, setResizing] = useState<'both' | 'vertical' | 'horizontal' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 480, h: 600 });

  // Center the window on mount
  useEffect(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const x = Math.max(20, (width - 480) / 2);
    const y = Math.max(100, (height - 600) / 2);
    setPosition({ x, y });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with left mouse click
    if (e.button !== 0) return;
    
    // Ensure we clicked the header or nested element with drag-handle class
    const target = e.target as HTMLElement;
    if (!target.closest('.drag-handle')) return;

    // Don't drag if clicking buttons
    if (target.closest('button') || target.closest('a')) return;

    setDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    e.preventDefault();
  };

  const handleResizeMouseDown = (e: React.MouseEvent, direction: 'both' | 'vertical' | 'horizontal') => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(direction);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      w: size.width,
      h: size.height
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return;
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      const newWidth = resizing === 'vertical' ? resizeStart.w : Math.max(380, resizeStart.w + deltaX);
      const newHeight = resizing === 'horizontal' ? resizeStart.h : Math.max(300, resizeStart.h + deltaY);

      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    if (resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, resizeStart]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, dragStart]);

  // Dynamic Server Logs state
  const [bridgeLogs, setBridgeLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Initializing Data Bridge Server...`,
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Express v4.19 server listening on Port 8080`,
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Bound to Tailscale network interface (tailscale0: 100.80.90.10)`,
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Loaded configuration cache from /var/lib/data-bridge/config.json`,
    `[${new Date().toLocaleTimeString()}] [SYSTEM] Heartbeat thread active. Monitoring 102 fleet client APK instances over Tailscale...`
  ]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Autoscroll server log terminal
  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [bridgeLogs, activeTab]);

  // Log state change events representing actual Server Orchestration activity
  const appendLog = (logMsg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setBridgeLogs(prev => [...prev, `[${timestamp}] ${logMsg}`].slice(-60));
  };

  // Append polling log at interval to feel alive
  useEffect(() => {
    const interval = setInterval(() => {
      const activeIPs = endpoints.filter(e => !e.isDormant && e.status === 'ONLINE').map(e => e.tailscaleIp);
      if (activeIPs.length > 0) {
        const randomIP = activeIPs[Math.floor(Math.random() * activeIPs.length)];
        appendLog(`[HTTP] GET /api/status.json - 200 OK (Polling Request from client ${randomIP})`);
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [endpoints]);

  // Handle signal state logging
  const handleSignalToggleWithLogging = () => {
    const nextSignalState = !primaryFeedOnline;
    onTogglePrimaryFeed();
    
    if (!nextSignalState) {
      appendLog(`[RTMP_MONITOR] ⚠️ ALERT: Socket RESET on primary broadcast stream! Broadcaster signal offline.`);
      appendLog(`[ORCHESTRATOR] Writing status.json -> primaryFeedOnline: false. Dispatching emergency failback instructions to all active decoders.`);
    } else {
      appendLog(`[RTMP_MONITOR] ✓ SUCCESS: Broadcaster RTMP carrier signal restored.`);
      appendLog(`[ORCHESTRATOR] Writing status.json -> primaryFeedOnline: true. Synchronizing fleet decoders back to high-quality STREAM.`);
    }
  };

  // Handle webhook logging
  const handleWebhookWithLogging = (event: 'stream_start' | 'stream_stop') => {
    onTriggerWebhook(event);
    const targetState = event === 'stream_start' ? 'STREAM' : 'STANDBY';
    appendLog(`[WEBHOOK] RECEIVED Event "${event}" from TVU Broadcaster API.`);
    appendLog(`[ORCHESTRATOR] Global fleet state transition target: [${targetState}]. Updating status.json cache.`);
    appendLog(`[DISPATCHER] Notifying on-premise Android TV clients over Tailscale mesh network...`);
  };

  // Define static files & code snippets
  const getStatusJsonContent = () => `{
  "globalFleetState": "${globalFleetState}",
  "primaryFeedOnline": ${primaryFeedOnline},
  "targetStreamUri": "rtmp://10.150.8.20/live/main_venue_feed",
  "standbyStreamUri": "rtmp://10.200.4.1/live/ambient_multicam",
  "lastUpdated": ${Math.floor(Date.now() / 1000)},
  "meta": {
    "serverVersion": "1.0.4",
    "networkMesh": "Tailscale Encrypted DERP",
    "activeChannelsCount": ${endpoints.filter(e => e.status === 'ONLINE').length}
  }
}`;

  const payloadStart = `{
  "event": "stream_start",
  "channelId": "tvu_broadcast_main",
  "timestamp": ${Math.floor(Date.now() / 1000)},
  "meta": {
    "venue": "Main Arena Broadcast",
    "resolution": "1080p60",
    "encoder_id": "tvu_enc_9482"
  }
}`;

  const payloadStop = `{
  "event": "stream_stop",
  "channelId": "tvu_broadcast_main",
  "timestamp": ${Math.floor(Date.now() / 1000)},
  "meta": {
    "venue": "Main Arena Broadcast",
    "encoder_id": "tvu_enc_9482"
  }
}`;

  const isStandaloneMode = isStandalone || false;

  return (
    <div 
      style={isStandaloneMode ? undefined : {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: dragging ? 'grabbing' : 'auto',
        width: isMinimized ? '380px' : `${size.width}px`,
        height: isMinimized ? '40px' : `${size.height}px`,
        minWidth: '380px',
        minHeight: isMinimized ? '40px' : '300px',
      }}
      className={isStandaloneMode 
        ? "w-full h-full max-w-5xl bg-slate-950 border border-slate-800 rounded-xl shadow-2xl flex flex-col select-none text-slate-200 overflow-hidden" 
        : "bg-slate-950 border border-slate-700 rounded shadow-xl flex flex-col z-[1000] select-none text-slate-200 overflow-hidden relative"
      }
      id="data-bridge-floating-console"
      onMouseDown={isStandaloneMode ? undefined : handleMouseDown}
    >
      {/* Title bar - Drag Handle */}
      <div className={`${isStandaloneMode ? 'bg-slate-900' : 'drag-handle bg-slate-900'} px-3 py-2 flex items-center justify-between border-b border-slate-800 shrink-0 ${isStandaloneMode ? '' : 'cursor-grab'}`}>
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono text-[11px] font-bold tracking-wider text-slate-300 uppercase">
            {locale === 'ja' ? 'データブリッジ・コンソール v1.0.4' : 'DATA BRIDGE CONSOLE v1.0.4'}
          </span>
          <span className="hidden sm:inline-block text-[9px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            PORT: 8080 (MOCK)
          </span>
        </div>
        
        {/* Window controls */}
        {!isStandaloneMode ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:bg-slate-800/80 rounded transition-colors text-slate-400 hover:text-slate-200 cursor-pointer"
              title={locale === 'ja' ? '最小化' : 'Minimize'}
            >
              {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </button>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-rose-950/40 rounded transition-colors text-slate-400 hover:text-rose-400 cursor-pointer"
              title={locale === 'ja' ? '閉じる' : 'Close Console'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/40 px-2.5 py-0.5 rounded font-mono font-bold animate-pulse">
              {locale === 'ja' ? '独立ウインドウ' : 'STANDALONE WINDOW'}
            </span>
          </div>
        )}
      </div>

      {/* Expanded Body Content */}
      {!isMinimized && (
        <div 
          onMouseDown={(e) => e.stopPropagation()}
          className="p-5 flex flex-col gap-4 select-text flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900/95 backdrop-blur-sm"
        >
          {/* Status Bar Indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950 border border-indigo-950 p-2.5 rounded-lg text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <span className="text-slate-400 font-bold uppercase">{locale === 'ja' ? '仮想サーバ状態:' : 'BRIDGE RUNTIME:'}</span>
              <span className="text-emerald-400 font-black">STABLE & TUNNELED</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="text-slate-500">STATE:</span>
                <span className={`font-extrabold ${globalFleetState === 'STREAM' ? 'text-indigo-400' : 'text-yellow-400'}`}>
                  {globalFleetState}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">CARRIER:</span>
                <span className={`font-extrabold ${primaryFeedOnline ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {primaryFeedOnline ? 'NOMINAL' : 'LOST'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* Top section: Controls */}
            <div className="flex flex-col gap-4">
              
              {/* Signal Control */}
              <div className="bg-slate-950/80 rounded-lg p-3.5 border border-slate-900 flex flex-col gap-2.5">
                <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest block border-b border-slate-900 pb-1.5">
                  {locale === 'ja' ? '■ 配信ソース信号 (サーバー側)' : '■ SOURCE RTMP CARRIER'}
                </span>

                <button
                  onClick={handleSignalToggleWithLogging}
                  className={`py-2 px-3 rounded text-xs font-mono font-bold border transition-all cursor-pointer flex items-center justify-between group ${
                    primaryFeedOnline
                      ? 'bg-rose-950/30 text-rose-400 border-rose-900/40 hover:bg-rose-950/50 hover:border-rose-500'
                      : 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40 hover:bg-emerald-950/50 hover:border-emerald-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {primaryFeedOnline ? <Wifi className="w-3.5 h-3.5 animate-pulse" /> : <WifiOff className="w-3.5 h-3.5" />}
                    <span>
                      {primaryFeedOnline 
                        ? (locale === 'ja' ? '信号を遮断する (CUT)' : 'TRIGGER CARRIER CUT') 
                        : (locale === 'ja' ? '信号を復旧する (RESTORE)' : 'RESTORE CARRIER')
                      }
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                  {locale === 'ja' 
                    ? '主信号を遮断すると、status.jsonの値をポーリングしている端末が自動でUSB再生等のフェイルオーバーを始めます。'
                    : 'Cutting this simulates a loss of the main venue broadcast. Clients polling status.json will shift state.'}
                </p>
              </div>

              {/* Webhooks Ingestion */}
              <div className="bg-slate-950/80 rounded-lg p-3.5 border border-slate-900 flex flex-col gap-2.5">
                <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-widest block border-b border-slate-900 pb-1.5">
                  {locale === 'ja' ? '■ TVU クラウドウェブフック受信' : '■ TVU WEBHOOK INGESTION'}
                </span>
                
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleWebhookWithLogging('stream_start')}
                    className={`py-2 px-3 rounded text-xs font-mono font-bold border transition-all cursor-pointer flex items-center justify-between group ${
                      globalFleetState === 'STREAM'
                        ? 'bg-indigo-950/40 text-indigo-400 border-indigo-800/50 shadow-[0_0_12px_rgba(99,102,241,0.1)]'
                        : 'bg-slate-900 hover:bg-indigo-950/20 text-slate-300 border-slate-800 hover:border-indigo-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Play className={`w-3.5 h-3.5 text-indigo-400 ${globalFleetState === 'STREAM' ? 'animate-pulse' : ''}`} />
                      <span>{locale === 'ja' ? '配信開始 (STREAM_START)' : 'TVU: POST /stream_start'}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    onClick={() => handleWebhookWithLogging('stream_stop')}
                    className={`py-2 px-3 rounded text-xs font-mono font-bold border transition-all cursor-pointer flex items-center justify-between group ${
                      globalFleetState === 'STANDBY'
                        ? 'bg-yellow-950/40 text-yellow-400 border-yellow-800/50 shadow-[0_0_12px_rgba(250,204,21,0.1)]'
                        : 'bg-slate-900 hover:bg-yellow-950/20 text-slate-300 border-slate-800 hover:border-yellow-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Square className="w-3.5 h-3.5 text-yellow-400" />
                      <span>{locale === 'ja' ? '配信停止 (STREAM_STOP)' : 'TVU: POST /stream_stop'}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>

            </div>

            {/* Bottom section: Multi-tab server telemetry and configs */}
            <div className="flex flex-col gap-2.5">
              {/* Tabs header */}
              <div className="flex border-b border-slate-800 text-[10px] font-mono overflow-x-auto whitespace-nowrap">
                <button
                  onClick={() => setActiveTab('status_json')}
                  className={`pb-2 px-3 border-b-2 font-bold transition-all uppercase flex items-center gap-1 cursor-pointer ${
                    activeTab === 'status_json' ? 'border-indigo-500 text-indigo-400 font-black' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  <span>/api/status.json</span>
                </button>
                <button
                  onClick={() => setActiveTab('webhook')}
                  className={`pb-2 px-3 border-b-2 font-bold transition-all uppercase flex items-center gap-1 cursor-pointer ${
                    activeTab === 'webhook' ? 'border-indigo-500 text-indigo-400 font-black' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>status.json</span>
                </button>
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`pb-2 px-3 border-b-2 font-bold transition-all uppercase flex items-center gap-1 cursor-pointer ${
                    activeTab === 'logs' ? 'border-indigo-500 text-indigo-400 font-black' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Terminal className="w-3 h-3" />
                  <span>Data Bridge Logs</span>
                </button>
              </div>

              {/* Code Viewer Container */}
              <div className="flex-1 bg-slate-950 rounded-lg border border-slate-900 overflow-hidden flex flex-col min-h-[220px]">
                {/* Tab title bar */}
                <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-900 flex items-center justify-between text-[9px] font-mono text-slate-500">
                  <span className="uppercase">
                    {activeTab === 'status_json' && '/api/status.json'}
                    {activeTab === 'webhook' && 'TVU Webhook POST Structure'}
                    {activeTab === 'logs' && 'STDOUT Telemetry'}
                  </span>
                  {activeTab !== 'logs' && (
                    <button
                      onClick={() => {
                        let code = '';
                        if (activeTab === 'status_json') code = getStatusJsonContent();
                        if (activeTab === 'webhook') code = globalFleetState === 'STREAM' ? payloadStart : payloadStop;
                        handleCopy(code, activeTab);
                      }}
                      className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      {copiedId === activeTab ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>COPY CODE</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Tab Body */}
                <div className="p-3 overflow-auto max-h-[190px] font-mono text-[10px] leading-normal text-slate-300 custom-scrollbar flex-1 select-text">
                  
                  {activeTab === 'status_json' && (
                    <div className="space-y-2">
                      <div className="p-1.5 bg-indigo-950/20 border border-indigo-900/30 rounded text-[9px] text-slate-400 font-sans leading-relaxed">
                        {locale === 'ja'
                          ? '💡 クライアントAPKはこの JSON を定期的にポーリングし、主映像/待機映像の切替、USB再生フェイルオーバーを行います。'
                          : '💡 On-premise decoders poll this JSON state to dynamically govern their playback streams.'}
                      </div>
                      <pre className="text-indigo-400 font-mono text-xs select-all">
                        {getStatusJsonContent()}
                      </pre>
                    </div>
                  )}

                  {activeTab === 'webhook' && (
                    <div className="space-y-2">
                      <pre className="text-amber-400/95 font-mono text-xs select-all">
                        {globalFleetState === 'STREAM' ? payloadStart : payloadStop}
                      </pre>
                    </div>
                  )}

                  {activeTab === 'logs' && (
                    <div ref={terminalContainerRef} className="space-y-1 font-mono text-[10px] select-all">
                      {bridgeLogs.map((log, idx) => {
                        const isAlert = log.includes('ALERT') || log.includes('⚠️');
                        const isSuccess = log.includes('SUCCESS') || log.includes('✓');
                        const isWebhook = log.includes('WEBHOOK');
                        return (
                          <div 
                            key={idx} 
                            className={`py-0.5 border-l-2 pl-1.5 ${
                              isAlert ? 'text-amber-400 border-amber-500 bg-amber-500/5' :
                              isSuccess ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5' :
                              isWebhook ? 'text-indigo-400 border-indigo-500 bg-indigo-500/5' :
                              'text-slate-400 border-slate-850'
                            }`}
                          >
                            {log}
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Minimized view info bar */}
      {isMinimized && (
        <div className="bg-slate-900 px-4 py-1.5 border-t border-indigo-950 flex items-center justify-between text-[10px] font-mono text-slate-400 shrink-0 select-text">
          <span>{locale === 'ja' ? 'バックグラウンドで稼働中' : 'Engine running in background...'}</span>
          <div className="flex items-center gap-3">
            <span>STATE: <span className="text-indigo-400 font-black">{globalFleetState}</span></span>
            <button 
              onClick={() => setIsMinimized(false)}
              className="text-indigo-400 hover:text-indigo-300 underline font-bold cursor-pointer"
            >
              {locale === 'ja' ? '展開' : 'Restore'}
            </button>
          </div>
        </div>
      )}

      {/* Resizing Edge Handles (Only in non-standalone overlay mode) */}
      {!isStandaloneMode && (
        <>
          {/* Right edge resize handle */}
          <div 
            onMouseDown={(e) => handleResizeMouseDown(e, 'horizontal')}
            className="absolute top-0 right-0 w-2.5 h-full cursor-ew-resize hover:bg-indigo-500/20 transition-all z-[1001]"
          />
          {/* Bottom edge resize handle */}
          <div 
            onMouseDown={(e) => handleResizeMouseDown(e, 'vertical')}
            className="absolute bottom-0 left-0 h-2.5 w-full cursor-ns-resize hover:bg-indigo-500/20 transition-all z-[1001]"
          />
          {/* Bottom-right corner resize handle */}
          <div 
            onMouseDown={(e) => handleResizeMouseDown(e, 'both')}
            className="absolute bottom-0 right-0 w-4.5 h-4.5 cursor-nwse-resize hover:bg-indigo-500/40 transition-all z-[1002]"
            style={{
              clipPath: 'polygon(100% 0, 0 100%, 100% 100%)',
              background: 'rgba(99, 102, 241, 0.3)'
            }}
          />
        </>
      )}
    </div>
  );
}
