/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { FleetEndpoint } from '../types';
import { 
  X, Monitor, Sliders, Activity
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  node: FleetEndpoint;
  onClose: () => void;
  onUpdateNode: (nodeId: string, updates: Partial<FleetEndpoint>) => void;
}

export default function TroubleshootPanel({ node, onClose, onUpdateNode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { locale } = useTranslation();
  
  // Interactive click injection positions
  const [clickCoordinates, setClickCoordinates] = useState<{ x: number; y: number } | null>(null);

  // Dynamic remote support states
  const [latency, setLatency] = useState<string>('Measuring...');
  const [framerate, setFramerate] = useState<'15 FPS' | '30 FPS' | 'AUTO'>('AUTO');
  const [bitrate, setBitrate] = useState<'1.5 Mbps' | '3.0 Mbps' | 'AUTO'>('AUTO');
  const [showSettings, setShowSettings] = useState(false);

  // Measure simulated latency on mount
  useEffect(() => {
    setLatency('Measuring (DERP-Mesh)...');
    const timer = setTimeout(() => {
      const baseLatency = 4.2 + Math.random() * 8.5;
      setLatency(`${baseLatency.toFixed(1)} ms`);
    }, 1200);

    const interval = setInterval(() => {
      setLatency(prev => {
        if (prev.includes('Measuring')) return prev;
        const current = parseFloat(prev);
        const jitter = (Math.random() - 0.5) * 1.2;
        const next = Math.max(2.5, Math.min(35.0, current + jitter));
        return `${next.toFixed(1)} ms`;
      });
    }, 3000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Compute dynamic settings when AUTO is selected
  const numericLatency = latency.includes('Measuring') ? 10 : parseFloat(latency);
  const computedFramerate = framerate === 'AUTO' 
    ? (numericLatency > 15 ? '15 FPS' : '30 FPS') 
    : framerate;
  
  // Real-time dynamic computed bitrate when AUTO is active
  const computedBitrate = bitrate === 'AUTO'
    ? `${(Math.max(1.1, Math.min(3.4, 3.2 - (numericLatency * 0.08) + Math.sin(Date.now() / 5000) * 0.15))).toFixed(2)} Mbps`
    : bitrate;

  // Animation frame for streaming canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animId: number;
    let angle = 0;
    
    const render = () => {
      ctx.fillStyle = '#020617'; // slate-950
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw grid lines to feel like broadcast monitoring
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      
      // Draw standard SMPTE/Abstract broadcast test signal or dynamic motion
      angle += 0.02;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle * 0.5);
      
      // Draw spinning graphic representing streaming video content
      const grad = ctx.createLinearGradient(-120, -120, 120, 120);
      grad.addColorStop(0, '#4338ca');
      grad.addColorStop(1, '#818cf8');
      
      ctx.fillStyle = grad;
      ctx.fillRect(-120, -120, 240, 240);
      
      // Inner rotating diamond
      ctx.rotate(-angle * 1.5);
      ctx.fillStyle = '#312e81';
      ctx.fillRect(-60, -60, 120, 120);
      
      ctx.restore();
      
      animId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setClickCoordinates({ x, y });
    
    // Scale coords to simulated 1080p android device
    const androidX = Math.round((x / rect.width) * 1920);
    const androidY = Math.round((y / rect.height) * 1080);
    
    const actionLog = `[${new Date().toLocaleTimeString()}] AccessibilityService: Injected click at (x:${androidX}, y:${androidY})`;
    
    onUpdateNode(node.id, {
      logs: [...node.logs, actionLog]
    });
    
    // Clear indicator after 1 second
    setTimeout(() => {
      setClickCoordinates(null);
    }, 1000);
  };

  // Trigger click injection on remote key pad
  const handleKeyInjection = (keyName: string) => {
    const actionLog = `[${new Date().toLocaleTimeString()}] com.se_chukei.fleetcontroller - AccessibilityService: Injected KEYCODE_${keyName} event`;
    
    onUpdateNode(node.id, {
      logs: [...node.logs, actionLog]
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" id="diagnostic-screen-modal">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl flex flex-col shadow-2xl relative overflow-hidden h-[95vh] max-h-[920px]" id="diagnostic-modal-content">
        
        {/* Content Body (Expanded Viewport with no top header and padding removed for edge-to-edge layout) */}
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 relative overflow-hidden" id="diagnostic-screen">
          <div className="w-full h-full flex items-center justify-center">
            {/* Screen bezel & content - edge frame goes right up against the sides */}
            <div className="relative aspect-video w-full h-full bg-black shadow-2xl flex items-center justify-center overflow-hidden">
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                onClick={handleCanvasClick}
                className="w-full h-full object-fill cursor-crosshair"
                title={locale === 'ja' ? 'インタラクティブ表示キャンバス。クリックして管理者クリックジェスチャを注入します。' : 'Interactive display canvas. Click to inject administrative click gestures.'}
              />
              
              {/* Click position indicator ring */}
              {clickCoordinates && (
                <div 
                  className="absolute pointer-events-none flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(clickCoordinates.x / 1280) * 100}%`, top: `${(clickCoordinates.y / 720) * 100}%` }}
                >
                  <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500 shadow shadow-black"></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Bar / Controls (Bottom) */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-800/80 bg-slate-900 gap-4 relative z-10">
          <div className="flex-1 min-w-0 text-center sm:text-left flex flex-col items-center sm:items-start">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <Monitor className="w-5 h-5 text-indigo-400 shrink-0" />
              <h2 className="text-sm sm:text-base font-sans font-bold text-slate-100 uppercase truncate max-w-[280px] sm:max-w-md">
                {locale === 'ja' ? `リモートサポート: ${node.name}` : `REMOTE SUPPORT: ${node.name}`}
              </h2>
            </div>
            <span className="text-[10px] sm:text-xs font-mono text-slate-500 truncate block mb-3">
              {node.id} : {node.tailscaleIp}
            </span>

            {/* Browser-style Back Button (below the Remote Support label and ID) */}
            <button 
              onClick={onClose}
              className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer group"
              title={locale === 'ja' ? 'フリート監視に戻る' : 'Back to Fleet Monitor'}
            >
              <svg 
                className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>{locale === 'ja' ? 'フリート監視に戻る' : 'BACK TO FLEET MONITOR'}</span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-4 shrink-0">
            <button onClick={() => handleKeyInjection('BACK')} className="w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shadow-lg cursor-pointer" title={locale === 'ja' ? '戻る' : 'Back'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button onClick={() => handleKeyInjection('HOME')} className="w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shadow-lg cursor-pointer" title={locale === 'ja' ? 'ホーム' : 'Home'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
            </button>
            <button onClick={() => handleKeyInjection('APP_SWITCH')} className="w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shadow-lg cursor-pointer" title={locale === 'ja' ? '最近のアプリ' : 'Recent Apps'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
            </button>
          </div>
          
          <div className="flex-1 flex flex-col items-end justify-center relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="group text-right flex flex-col items-end gap-0.5 p-2 rounded-lg bg-slate-950/40 hover:bg-slate-950/90 border border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer select-none"
              title={locale === 'ja' ? '接続設定を調整するにはクリックしてください' : 'Click to adjust connection settings'}
            >
              <div className="flex items-center gap-2 text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5">
                <Sliders className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                <span>{locale === 'ja' ? '接続設定 (調整可)' : 'CONNECTION SETTINGS (CLICK)'}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span>LATENCY:</span>
                <span className={`font-bold font-mono ${latency.includes('Measuring') ? 'text-amber-500 animate-pulse' : 'text-indigo-400'}`}>
                  {latency}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span>FRAMERATE:</span>
                <span className="text-slate-300 font-bold">
                  {framerate === 'AUTO' ? `AUTO (${computedFramerate})` : framerate}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span>BITRATE:</span>
                <span className="text-emerald-400 font-bold">
                  {bitrate === 'AUTO' ? `AUTO (${computedBitrate})` : bitrate}
                </span>
              </div>
            </button>

            {/* Connection Settings Dropdown Overlay */}
            {showSettings && (
              <>
                {/* Click outside backdrop specifically for the settings dropdown */}
                <div 
                  className="fixed inset-0 z-40 cursor-default" 
                  onClick={() => setShowSettings(false)}
                />
                
                <div className="absolute bottom-full right-0 mb-2 w-72 bg-slate-900/95 border border-indigo-500/30 rounded-xl p-4 shadow-2xl backdrop-blur-md z-50 animate-in fade-in slide-in-from-bottom-2 duration-250">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      {locale === 'ja' ? 'リモートセッション構成' : 'Remote Session Config'}
                    </span>
                    <button 
                      onClick={() => setShowSettings(false)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-4 text-left">
                    {/* Framerate */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[9px] font-mono font-bold text-slate-400 uppercase">
                          {locale === 'ja' ? '最大フレームレート制限' : 'Max Framerate Cap'}
                        </label>
                        <span className="text-[9px] font-mono text-indigo-400 font-bold">
                          {locale === 'ja' ? 'レスポンス重視' : 'Response Priority'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['15 FPS', '30 FPS', 'AUTO'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => {
                              setFramerate(f);
                              onUpdateNode(node.id, {
                                logs: [...node.logs, `[${new Date().toLocaleTimeString()}] REMOTE_SUPPORT: Adjusted rendering framerate cap to ${f}`]
                              });
                            }}
                            className={`px-1.5 py-1 text-[9px] font-mono font-bold rounded border transition-all text-center cursor-pointer ${
                              framerate === f
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] font-sans text-slate-500 mt-1 leading-normal">
                        {locale === 'ja' 
                          ? 'AUTO設定は遅延に応じて15〜30 FPSの間で動的スケーリングされます。' 
                          : 'AUTO option dynamically scales between 15-30 FPS based on measured round-trip latency.'
                        }
                      </p>
                    </div>

                    {/* Bitrate */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[9px] font-mono font-bold text-slate-400 uppercase">
                          {locale === 'ja' ? 'ビットレート品質' : 'Bitrate Quality'}
                        </label>
                        <span className="text-[9px] font-mono text-emerald-400 font-bold">
                          {locale === 'ja' ? 'アダプティブ' : 'Adaptive Stream'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['1.5 Mbps', '3.0 Mbps', 'AUTO'] as const).map((b) => (
                          <button
                            key={b}
                            onClick={() => {
                              setBitrate(b);
                              onUpdateNode(node.id, {
                                logs: [...node.logs, `[${new Date().toLocaleTimeString()}] REMOTE_SUPPORT: Adjusted network stream bandwidth cap to ${b}`]
                              });
                            }}
                            className={`px-1.5 py-1 text-[9px] font-mono font-bold rounded border transition-all text-center cursor-pointer ${
                              bitrate === b
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] font-sans text-slate-500 mt-1 leading-normal">
                        {locale === 'ja' 
                          ? 'AUTO設定は実測の通信速度に合わせてビットレートをインテリジェントに調整します。' 
                          : 'AUTO option dynamically throttles/scales bandwidth consumption to optimize response speed.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
