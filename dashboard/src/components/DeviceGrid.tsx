/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FleetEndpoint, ActionState } from '../types';
import { Search, Grid, List, AlertCircle, HardDrive, RefreshCw, Zap, Play, Square, Lock, Unlock, Info, AlertTriangle, Check, Pin, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Power } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  endpoints: FleetEndpoint[];
  onSelectEndpoint: (endpoint: FleetEndpoint) => void;
  selectedEndpointId?: string;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  globalFleetState?: string;
  isAdmin?: boolean;
  showDormantOnly: boolean;
  onDormantToggle: (val: boolean) => void;
  activeActions?: { [nodeId: string]: ActionState } | null;
  onTriggerAction?: (nodeIds: string[], type: 'STREAM' | 'STANDBY' | 'RESYNC' | 'REBOOT', streamUri?: string) => void;
}

export default function DeviceGrid({ 
  endpoints, 
  onSelectEndpoint, 
  selectedEndpointId, 
  activeFilter, 
  onFilterChange, 
  globalFleetState = 'STREAM',
  isAdmin = false,
  showDormantOnly,
  onDormantToggle,
  activeActions,
  onTriggerAction
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [bulkControlsUnlocked, setBulkControlsUnlocked] = useState(false);
  const [bulkStreamUri, setBulkStreamUri] = useState('rtmp://10.200.4.1/live/main_multicast');
  const [pendingBulkAction, setPendingBulkAction] = useState<{ type: 'STREAM' | 'STANDBY' | 'RESYNC' | 'REBOOT'; streamUri?: string } | null>(null);
  const [targetNodeIds, setTargetNodeIds] = useState<string[]>([]);
  
  const { locale, t } = useTranslation();

  const [pinnedNodeIds, setPinnedNodeIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pinnedNodeIds') || '[]');
    } catch {
      return [];
    }
  });

  const savePinnedNodeIds = (ids: string[]) => {
    setPinnedNodeIds(ids);
    localStorage.setItem('pinnedNodeIds', JSON.stringify(ids));
  };

  const togglePin = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinnedNodeIds.includes(nodeId)) {
      savePinnedNodeIds(pinnedNodeIds.filter(id => id !== nodeId));
    } else {
      savePinnedNodeIds([...pinnedNodeIds, nodeId]);
    }
  };

  const movePinnedIndex = (nodeId: string, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const index = pinnedNodeIds.indexOf(nodeId);
    if (index === -1) return;
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= pinnedNodeIds.length) return;
    
    const nextPinned = [...pinnedNodeIds];
    const temp = nextPinned[index];
    nextPinned[index] = nextPinned[nextIndex];
    nextPinned[nextIndex] = temp;
    
    savePinnedNodeIds(nextPinned);
  };

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null);

  const handleDragStart = (nodeId: string, e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedNodeId(nodeId);
  };

  const handleDragOver = (nodeId: string, e: React.DragEvent) => {
    if (draggedNodeId === nodeId) return;
    const isNodePinned = pinnedNodeIds.includes(nodeId);
    const isDraggedPinned = pinnedNodeIds.includes(draggedNodeId || '');
    if (!isNodePinned || !isDraggedPinned) return;

    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOverNodeId(nodeId);

    if (viewMode === 'grid') {
      const relativeX = e.clientX - rect.left;
      const position = relativeX < rect.width / 2 ? 'left' : 'right';
      setDragOverPosition(position);
    } else {
      const relativeY = e.clientY - rect.top;
      const position = relativeY < rect.height / 2 ? 'top' : 'bottom';
      setDragOverPosition(position);
    }
  };

  const handleDragLeave = () => {
    setDragOverNodeId(null);
    setDragOverPosition(null);
  };

  const handleDrop = (targetNodeId: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceNodeId = e.dataTransfer.getData('text/plain') || draggedNodeId;
    if (!sourceNodeId || sourceNodeId === targetNodeId) {
      setDraggedNodeId(null);
      setDragOverNodeId(null);
      setDragOverPosition(null);
      return;
    }

    const isSourcePinned = pinnedNodeIds.includes(sourceNodeId);
    const isTargetPinned = pinnedNodeIds.includes(targetNodeId);
    if (!isSourcePinned || !isTargetPinned) {
      setDraggedNodeId(null);
      setDragOverNodeId(null);
      setDragOverPosition(null);
      return;
    }

    const otherPinned = pinnedNodeIds.filter(id => id !== sourceNodeId);
    const targetIdxInOthers = otherPinned.indexOf(targetNodeId);
    if (targetIdxInOthers !== -1) {
      const insertAt = (dragOverPosition === 'top' || dragOverPosition === 'left') 
        ? targetIdxInOthers 
        : targetIdxInOthers + 1;
      const nextPinned = [...otherPinned];
      nextPinned.splice(insertAt, 0, sourceNodeId);
      savePinnedNodeIds(nextPinned);
    }

    setDraggedNodeId(null);
    setDragOverNodeId(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDragOverNodeId(null);
    setDragOverPosition(null);
  };

  // Auto-scroll selected node to viewport inside grid/list containers ONLY if not in view
  useEffect(() => {
    if (!selectedEndpointId) return;

    const timer = setTimeout(() => {
      // 1. Grid (Matrix) container scroll
      const matrixEl = document.getElementById(`matrix-node-${selectedEndpointId}`);
      const matrixContainer = document.getElementById('nodes-matrix');
      if (matrixEl && matrixContainer) {
        const containerRect = matrixContainer.getBoundingClientRect();
        const elRect = matrixEl.getBoundingClientRect();
        const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
        if (!isVisible) {
          matrixContainer.scrollTo({
            top: matrixContainer.scrollTop + (elRect.top - containerRect.top) - 12,
            behavior: 'smooth'
          });
        }
      }

      // 2. List container scroll
      const listEl = document.getElementById(`list-node-${selectedEndpointId}`);
      const listContainer = document.getElementById('nodes-list');
      if (listEl && listContainer) {
        const containerRect = listContainer.getBoundingClientRect();
        const elRect = listEl.getBoundingClientRect();
        const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
        if (!isVisible) {
          listContainer.scrollTo({
            top: listContainer.scrollTop + (elRect.top - containerRect.top) - 12,
            behavior: 'smooth'
          });
        }
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [selectedEndpointId, viewMode]);

  // Filter and search logic
  const filtered = endpoints.filter((node) => {
    // 1. Admin/Dormant filter routing:
    // Non-admin mode: never show dormant nodes
    // Admin mode: if showDormantOnly, ONLY show dormant nodes. Otherwise, ONLY show active (non-dormant) nodes.
    if (!isAdmin) {
      if (node.isDormant) return false;
    } else {
      if (showDormantOnly) {
        if (!node.isDormant) return false;
      } else {
        if (node.isDormant) return false;
      }
    }

    // 2. Active Operation/Status Filter (if active and not "ALL")
    if (activeFilter && activeFilter !== 'ALL') {
      if (activeFilter === 'ONLINE' && node.status !== 'ONLINE' && node.status !== 'WARNING') return false;
      if (activeFilter === 'WARNING' && node.status !== 'WARNING' && !node.accessKeyRevoked) return false;
      if (activeFilter === 'OFFLINE' && node.status !== 'OFFLINE') return false;
      if (activeFilter === 'STREAM' && node.appState !== 'STREAM') return false;
      if (activeFilter === 'PLAYBACK' && node.appState !== 'PLAYBACK') return false;
      if (activeFilter === 'STANDBY' && node.appState !== 'STANDBY') return false;
    }

    // 3. Search term matching
    if (searchTerm.trim() === '') return true;
    const term = searchTerm.toLowerCase();
    const displayName = node.name || `ANDROID_ID_${node.id.replace('ANDROID_ID_', '')}`;
    return (
      node.id.toLowerCase().includes(term) ||
      displayName.toLowerCase().includes(term) ||
      node.tailscaleIp.includes(term)
    );
  });

  // Sort endpoints:
  // 1. Pinned nodes first, sorted by their position in `pinnedNodeIds`
  // 2. Unpinned nodes next, sorted alphabetically by name or ID
  const sorted = [...filtered].sort((a, b) => {
    const indexA = pinnedNodeIds.indexOf(a.id);
    const indexB = pinnedNodeIds.indexOf(b.id);
    const isPinnedA = indexA !== -1;
    const isPinnedB = indexB !== -1;

    if (isPinnedA && isPinnedB) {
      return indexA - indexB;
    }
    if (isPinnedA) return -1;
    if (isPinnedB) return 1;

    // Both unpinned: maintain standard alphabetical determinism
    const nameA = a.name || a.id;
    const nameB = b.name || b.id;
    return nameA.localeCompare(nameB);
  });

  const getBaseStatusColor = (node: FleetEndpoint) => {
    if (node.accessKeyRevoked) return 'bg-rose-500';
    if (node.status === 'OFFLINE') return 'bg-slate-700';
    switch (node.appState) {
      case 'STREAM': return 'bg-emerald-500';
      case 'PLAYBACK': return 'bg-pink-500';
      case 'STANDBY': return 'bg-yellow-400';
      default: return 'bg-slate-500';
    }
  };

  const renderStatusIndicator = (node: FleetEndpoint, className: string, telemetryMismatch?: boolean) => {
    const baseColor = getBaseStatusColor(node);
    const isSquare = !!node.isDormant;
    
    // Substitute standard rounded shapes with square layout if dormant
    const cleanClassName = className
      .replace('rounded-full', isSquare ? 'rounded-none' : 'rounded-full')
      .replace('rounded-md', isSquare ? 'rounded-none' : 'rounded-md')
      .replace('rounded', isSquare ? 'rounded-none' : 'rounded');

    if (node.status === 'WARNING' || telemetryMismatch) {
      return (
        <div className={`relative ${cleanClassName}`}>
          <span className={`absolute inset-0 ${isSquare ? 'rounded-none' : 'rounded-sm'} ${baseColor}`}></span>
          <span className={`absolute inset-0 ${isSquare ? 'rounded-none' : 'rounded-sm'} ${node.status === 'WARNING' ? 'bg-rose-500' : baseColor} animate-sync-pulse`}></span>
        </div>
      );
    }
    return <span className={`${cleanClassName} ${baseColor} ${isSquare ? 'rounded-none' : 'rounded'}`} />;
  };

  const getBorderColor = (node: FleetEndpoint, telemetryMismatch: boolean) => {
    if (node.isDecommissioned) {
      if (node.id === selectedEndpointId) {
        return 'border-slate-500/80 shadow-[0_0_10px_rgba(148,163,184,0.3)] ring-2 ring-slate-500/20 bg-slate-900/60';
      }
      return 'border-slate-850/60 border-dashed bg-slate-950/20 opacity-50';
    }
    if (telemetryMismatch) {
      if (node.id === selectedEndpointId) {
        return 'border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.8)] ring-2 ring-rose-500/30 bg-rose-900/60 animate-glow-pulse';
      }
      return 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)] bg-rose-900/40 animate-glow-pulse';
    }
    if (node.id === selectedEndpointId) {
      return 'border-indigo-500/60 shadow-[0_0_12px_rgba(99,102,241,0.4)] ring-2 ring-indigo-500/20';
    }
    return 'border-slate-800/80';
  };

  // Helper to toggle active status filter
  const handleFilterClick = (filter: string) => {
    if (activeFilter === filter) {
      onFilterChange(''); // Deactivate
    } else {
      onFilterChange(filter);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 backdrop-blur-md flex-1 flex flex-col" id="device-management-grid">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-mono font-bold tracking-wider text-slate-300 uppercase">
            {locale === 'ja' ? 'フリート・ステータス・モニター' : 'FLEET STATUS MONITOR'}
          </h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-950 border border-slate-800 text-slate-400">
            {locale === 'ja' 
              ? `${endpoints.filter(e => isAdmin ? (showDormantOnly ? e.isDormant : !e.isDormant) : !e.isDormant).length}台中 ${filtered.length}台のノード` 
              : `${filtered.length} of ${endpoints.filter(e => isAdmin ? (showDormantOnly ? e.isDormant : !e.isDormant) : !e.isDormant).length} nodes`
            }
          </span>
        </div>

        {/* Search & Layout Toggles */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800/80 text-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500/50 w-full sm:w-60 transition-all placeholder:text-slate-600"
            />
          </div>

          <div className="flex border border-slate-800/80 rounded-lg p-0.5 bg-slate-950">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
              title={t('matrixView')}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-all cursor-pointer ${viewMode === 'list' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
              title={t('listView')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter / Legend Block */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-4 px-3 py-2 rounded-lg bg-slate-950/40 border border-slate-900/60 text-[10px] font-mono text-slate-400">
        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mr-2">{locale === 'ja' ? 'アクティブ状態フィルター:' : 'Filter State:'}</span>
        
        <button onClick={() => handleFilterClick('STREAM')} className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all cursor-pointer ${activeFilter === 'STREAM' ? 'bg-slate-800 border-slate-600 text-white' : 'border-transparent hover:bg-slate-900'}`}>
          <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
          <span>{locale === 'ja' ? 'STREAM (ライブRTMPフィード)' : 'STREAM (Live RTMP Feed)'}</span>
        </button>
        <button onClick={() => handleFilterClick('PLAYBACK')} className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all cursor-pointer ${activeFilter === 'PLAYBACK' ? 'bg-slate-800 border-slate-600 text-white' : 'border-transparent hover:bg-slate-900'}`}>
          <span className="w-2.5 h-2.5 rounded bg-fuchsia-500"></span>
          <span>{locale === 'ja' ? 'PLAYBACK (ローカルUSB優先)' : 'PLAYBACK (Local USB Priority)'}</span>
        </button>
        <button onClick={() => handleFilterClick('STANDBY')} className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all cursor-pointer ${activeFilter === 'STANDBY' ? 'bg-slate-800 border-slate-600 text-white' : 'border-transparent hover:bg-slate-900'}`}>
          <span className="w-2.5 h-2.5 rounded bg-yellow-400"></span>
          <span>{locale === 'ja' ? 'STANDBY (環境用バックアップ)' : 'STANDBY (Ambient Backup)'}</span>
        </button>
        <button onClick={() => handleFilterClick('WARNING')} className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all cursor-pointer ${activeFilter === 'WARNING' ? 'bg-slate-800 border-slate-600 text-white' : 'border-transparent hover:bg-slate-900'}`}>
          <div className="relative w-2.5 h-2.5">
            <span className="absolute inset-0 rounded bg-slate-500"></span>
            <span className="absolute inset-0 rounded bg-rose-500 animate-pulse"></span>
          </div>
          <span>{locale === 'ja' ? 'WARNING (自己修復中 / 高温検出)' : 'WARNING (Self-Healing / Overheat)'}</span>
        </button>
        <button onClick={() => handleFilterClick('OFFLINE')} className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all cursor-pointer ${activeFilter === 'OFFLINE' ? 'bg-slate-800 border-slate-600 text-white' : 'border-transparent hover:bg-slate-900'}`}>
          <span className="w-2.5 h-2.5 rounded bg-slate-700"></span>
          <span>{locale === 'ja' ? 'OFFLINE (オフライン)' : 'OFFLINE'}</span>
        </button>

        {/* Admin-only DORMANT toggle (Moved to the end of the filter list) */}
        {isAdmin && (
          <button 
            onClick={() => {
              onDormantToggle(!showDormantOnly);
              // Deactivate operation filter when switching dormant status to show only/all dormant devices first
              onFilterChange(''); 
            }} 
            className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all cursor-pointer ${showDormantOnly ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-300' : 'border-transparent hover:bg-slate-900'}`}
            title={locale === 'ja' ? 'キッティング待ちの未割当端末を表示' : 'Toggle Pending Field Staging (Dormant) Devices'}
          >
            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-none"></span>
            <span className="font-bold">{locale === 'ja' ? 'DORMANT (キッティング待ち/未割当)' : 'DORMANT (Pending Staging)'}</span>
          </button>
        )}
      </div>

      {/* EMERGENCY FLEET CONTROL PANEL */}
      {isAdmin && (
        <div className={`mb-5 rounded-xl border-2 transition-all duration-300 ${
          bulkControlsUnlocked 
            ? 'p-3.5 bg-rose-950/10 border-red-950 shadow-[0_0_20px_rgba(225,29,72,0.1)]' 
            : 'p-2 px-3.5 bg-slate-950/40 border-red-950/60 shadow-sm'
        }`}>
          {/* Header Row */}
          <div className={`flex items-center justify-between gap-3 flex-wrap ${bulkControlsUnlocked ? 'border-b border-slate-900 pb-2 mb-2.5' : ''}`}>
            <div className="flex items-center gap-2">
              <Zap className={`w-3.5 h-3.5 ${bulkControlsUnlocked ? 'text-rose-500 animate-pulse' : 'text-slate-500'}`} />
              <span className="text-xs font-mono font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                EMERGENCY FLEET CONTROL
              </span>
              
              {/* Info Bubble (Mouseover / Tooltip) */}
              <div className="relative group inline-block">
                <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded-lg shadow-2xl font-mono leading-normal z-50">
                  {locale === 'ja' 
                    ? '緊急時専用。全アクティブ端末に対して一括でステート命令を強制送信し、配信アドレス、待機状態、システム再同期、またはハードウェア再起動を制御します。'
                    : 'Broadcast instant global overrides to force changes in stream addresses, standby states, resync pipelines, or cold reboot hardware.'}
                </div>
              </div>
            </div>

            {/* Lock/Unlock Button */}
            <button
              onClick={() => setBulkControlsUnlocked(!bulkControlsUnlocked)}
              className={`px-2.5 py-0.5 text-[9px] font-mono font-extrabold uppercase rounded transition-all cursor-pointer flex items-center gap-1.5 border ${
                bulkControlsUnlocked
                  ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-500 animate-pulse'
                  : 'bg-black text-rose-500 border-rose-950 hover:bg-slate-950'
              }`}
            >
              {bulkControlsUnlocked ? (
                <>
                  <Unlock className="w-2.5 h-2.5" />
                  <span>{locale === 'ja' ? 'UNLOCKED' : 'UNLOCKED'}</span>
                </>
              ) : (
                <>
                  <Lock className="w-2.5 h-2.5" />
                  <span>{locale === 'ja' ? 'LOCKED' : 'LOCKED'}</span>
                </>
              )}
            </button>
          </div>

          {/* Locked Panel Outer Wrapper - Completely hidden when locked */}
          {bulkControlsUnlocked && (
            <div className="animate-in fade-in duration-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. FORCE STREAM section (Spans full-width) */}
                <div className="md:col-span-3 flex flex-col gap-1.5 p-2 bg-slate-900/20 border border-slate-900 rounded-lg">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                      {locale === 'ja' ? 'FORCE STREAM (ストリーム強制)' : 'FORCE STREAM'}
                    </span>
                    {/* Info Bubble */}
                    <div className="relative group inline-block">
                      <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-xl font-mono leading-normal z-50">
                        {locale === 'ja'
                          ? 'すべての稼働中端末に対して、指定した配信ストリームアドレスの再生を強制します。'
                          : 'Forces the selected endpoints to receive the designated stream.'}
                      </div>
                    </div>
                  </div>

                  {/* Input + Button Row */}
                  <div className="flex flex-col sm:flex-row gap-2 items-center w-full">
                    <input
                      type="text"
                      value={bulkStreamUri}
                      onChange={(e) => setBulkStreamUri(e.target.value)}
                      className="w-full sm:flex-1 bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-rose-500/50 h-7"
                      placeholder="rtmp://..."
                    />
                    <button
                      onClick={() => {
                        const finalUri = bulkStreamUri.trim();
                        if (!finalUri) {
                          alert(locale === 'ja' ? 'ストリームURLを入力してください。' : 'Please enter a stream URL.');
                          return;
                        }
                        setPendingBulkAction({ type: 'STREAM', streamUri: finalUri });
                        setTargetNodeIds(endpoints.filter(node => !node.isDormant && !node.isDecommissioned).map(node => node.id));
                      }}
                      className="w-full sm:w-auto px-3 h-7 bg-emerald-950/40 border border-emerald-900/50 hover:bg-emerald-900/20 text-emerald-400 rounded text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                    >
                      <Play className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                      <span>{locale === 'ja' ? 'FORCE STREAM' : 'FORCE STREAM'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. FORCE STANDBY section */}
                <div className="flex flex-col gap-1.5 p-2 bg-slate-900/20 border border-slate-900 rounded-lg">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                      {locale === 'ja' ? 'FORCE STANDBY (強制待機)' : 'FORCE STANDBY'}
                    </span>
                    {/* Info Bubble */}
                    <div className="relative group inline-block">
                      <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-xl font-mono leading-normal z-50">
                        {locale === 'ja'
                          ? 'すべての稼働中端末を待機状態に強制移行します。'
                          : 'Forces the selected endpoints to enter the default standby state.'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setPendingBulkAction({ type: 'STANDBY' });
                      setTargetNodeIds(endpoints.filter(node => !node.isDormant && !node.isDecommissioned).map(node => node.id));
                    }}
                    className="w-full h-7 bg-yellow-950/40 border border-yellow-900/50 text-yellow-400 hover:bg-yellow-900/20 rounded text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Square className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                    <span>{locale === 'ja' ? 'FORCE STANDBY' : 'FORCE STANDBY'}</span>
                  </button>
                </div>

                {/* 3. SYSTEM RESYNC section */}
                <div className="flex flex-col gap-1.5 p-2 bg-slate-900/20 border border-slate-900 rounded-lg">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                      {locale === 'ja' ? 'SYSTEM RESYNC (システム再同期)' : 'SYSTEM RESYNC'}
                    </span>
                    {/* Info Bubble */}
                    <div className="relative group inline-block">
                      <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-xl font-mono leading-normal z-50">
                        {locale === 'ja'
                          ? 'フリーズした再生パイプラインを強制リサイクルし、ストリームの再同期を実行します。'
                          : 'Forces the selected endpoints to perform self-diagnostics, recycle stuck playback pipelines, and re-sync feed connection.'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setPendingBulkAction({ type: 'RESYNC' });
                      setTargetNodeIds(endpoints.filter(node => !node.isDormant && !node.isDecommissioned).map(node => node.id));
                    }}
                    className="w-full h-7 bg-rose-950/30 border border-rose-900/50 text-rose-400 hover:bg-rose-900/20 rounded text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5 text-rose-400" />
                    <span>{locale === 'ja' ? 'SYSTEM RESYNC' : 'SYSTEM RESYNC'}</span>
                  </button>
                </div>

                {/* 4. REBOOT DEVICE section */}
                <div className="flex flex-col gap-1.5 p-2 bg-slate-900/20 border border-slate-900 rounded-lg">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                      {locale === 'ja' ? 'REBOOT DEVICE (一括再起動)' : 'REBOOT DEVICE'}
                    </span>
                    {/* Info Bubble */}
                    <div className="relative group inline-block">
                      <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2 bg-slate-950 border border-slate-800 text-slate-300 text-[10px] rounded shadow-xl font-mono leading-normal z-50">
                        {locale === 'ja'
                          ? 'すべての稼働中端末に対してOSコールドハードウェア再起動を実行します。'
                          : 'Triggers a full hardware OS cold reboot across all selected endpoints.'}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setPendingBulkAction({ type: 'REBOOT' });
                      setTargetNodeIds(endpoints.filter(node => !node.isDormant && !node.isDecommissioned).map(node => node.id));
                    }}
                    className="w-full h-7 bg-red-950/40 border border-red-900/50 text-red-400 hover:bg-red-900/20 rounded text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Power className="w-2.5 h-2.5 text-red-400" />
                    <span>{locale === 'ja' ? 'REBOOT DEVICE' : 'REBOOT DEVICE'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Matrix / List Display */}
      {sorted.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-800/80 rounded-xl bg-slate-950/20">
          <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
          <p className="text-slate-400 text-xs font-mono">{t('noMatchingNodes')}</p>
          <button 
            onClick={() => { setSearchTerm(''); }}
            className="text-indigo-400 font-mono text-[10px] mt-2 underline cursor-pointer"
          >
            {t('clearSearch')}
          </button>
        </div>
            ) : viewMode === 'grid' ? (
        /* Matrix Grid Layout */
        <div className="flex-1 overflow-y-auto max-h-[460px] pr-2 custom-scrollbar" id="nodes-matrix">
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3.5 p-1">
            {sorted.map((node, index) => {
              const isSelected = node.id === selectedEndpointId;
              const telemetryMismatch = (node.appState === 'STANDBY' && globalFleetState === 'STREAM' && !node.accessKeyRevoked) || node.status === 'WARNING' || !!node.accessKeyRevoked;
              
              // Pin and Resync states
              const isPinned = pinnedNodeIds.includes(node.id);
              const indexInPinned = pinnedNodeIds.indexOf(node.id);
              const isResyncing = activeActions && activeActions[node.id] && activeActions[node.id].phase !== 'NOMINAL';
              const isBeingDragged = draggedNodeId === node.id;
              const isTargetOver = dragOverNodeId === node.id;
              
              // Japanese location names / fallback, dynamically scaled font sizing
              const rawName = node.isDecommissioned
                ? (locale === 'ja' ? '退役済' : 'RETIRED')
                : (node.name || (locale === 'ja' ? '未割当' : `HW-${node.id.slice(-4)}`));
              const displayName = rawName.replace('GTV Streamer - ', '');
              
              const displayedName = displayName;

              // Solid background based on status for Grid View
              const getGridBgStyle = () => {
                let baseBgColor = '#1e293b'; // slate-800
                let baseBorderColor = '#334155'; // slate-700
                let baseShadow = '0 0 0px transparent';
                let textColorClass = 'text-white';
                let baseClasses = 'bg-slate-800 text-white border-slate-700';

                if (node.status === 'WARNING') {
                  baseBgColor = '#d97706'; // amber-600
                  baseBorderColor = '#fbbf24'; // amber-400
                  baseShadow = '0 0 10px rgba(251,191,36,0.5)';
                  baseClasses = 'bg-amber-600 text-white border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]';
                }
                else if (node.status === 'OFFLINE') {
                  baseClasses = 'bg-slate-800 text-slate-400 border-slate-700 opacity-70';
                }
                else if (node.appState === 'STREAM') {
                  baseBgColor = '#047857'; // emerald-700
                  baseBorderColor = '#10b981'; // emerald-500
                  baseShadow = '0 0 10px rgba(16,185,129,0.3)';
                  baseClasses = 'bg-emerald-700 text-white border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]';
                }
                else if (node.appState === 'PLAYBACK') {
                  baseBgColor = '#be185d'; // pink-700
                  baseBorderColor = '#ec4899'; // pink-500
                  baseShadow = '0 0 10px rgba(236,72,153,0.3)';
                  baseClasses = 'bg-pink-700 text-white border-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.3)]';
                }
                else if (node.appState === 'STANDBY') {
                  baseBgColor = '#ca8a04'; // yellow-600
                  baseBorderColor = '#facc15'; // yellow-400
                  baseShadow = '0 0 10px rgba(250,204,21,0.3)';
                  baseClasses = 'bg-yellow-600 text-white border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]';
                }

                if (telemetryMismatch) {
                   return { 
                     className: `${textColorClass} border-2 animate-grid-warning`,
                     style: {
                       '--warning-bg': baseBgColor,
                       '--warning-border': baseBorderColor,
                       '--warning-shadow': baseShadow,
                     } as React.CSSProperties
                   }
                }
                
                return { className: baseClasses, style: {} };
              };

              const gridStyleProps = isResyncing 
                ? { className: 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)] bg-cyan-950 text-white font-bold relative overflow-hidden', style: {} }
                : getGridBgStyle();

              return (
                <div
                  key={node.id}
                  onClick={() => onSelectEndpoint(node)}
                  draggable={isPinned}
                  onDragStart={(e) => handleDragStart(node.id, e)}
                  onDragOver={(e) => handleDragOver(node.id, e)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(node.id, e)}
                  onDragEnd={handleDragEnd}
                  className={`group relative flex flex-col items-center justify-center py-1.5 px-1 ${node.isDormant ? 'rounded-none' : 'rounded-sm'} border h-[50px] transition-all cursor-pointer ${
                    isBeingDragged ? 'opacity-30 border-dashed border-indigo-500/50 bg-slate-950/20' : gridStyleProps.className
                  } ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-950' : ''}`}
                  style={gridStyleProps.style}
                  id={`matrix-node-${node.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectEndpoint(node);
                    }
                  }}
                >
                  {/* DRAG HANDLE FOR PINNED ENDPOINTS */}
                  {isPinned && (
                    <div 
                      className="absolute top-1 left-1 flex flex-col gap-[2px] p-0.5 cursor-grab active:cursor-grabbing text-white/50 hover:text-white z-20 group-hover:opacity-100 opacity-60 transition-opacity"
                      title={locale === 'ja' ? 'ドラッグして並び替え' : 'Drag to reorder'}
                    >
                      <div className="w-2.5 h-[1.5px] bg-current rounded-full" />
                      <div className="w-2.5 h-[1.5px] bg-current rounded-full" />
                      <div className="w-2.5 h-[1.5px] bg-current rounded-full" />
                    </div>
                  )}

                  {/* DRAG INSERTION INDICATORS */}
                  {isTargetOver && (dragOverPosition === 'left' || dragOverPosition === 'top') && (
                    <div className="absolute top-0 bottom-0 left-[-4px] w-[3px] bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.8)] z-30 rounded-full animate-pulse" />
                  )}
                  {isTargetOver && (dragOverPosition === 'right' || dragOverPosition === 'bottom') && (
                    <div className="absolute top-0 bottom-0 right-[-4px] w-[3px] bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.8)] z-30 rounded-full animate-pulse" />
                  )}

                  {isResyncing && (
                    <div className="absolute inset-0 bg-cyan-950 border border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)] animate-pulse rounded-sm pointer-events-none" />
                  )}

                  <div className="relative flex items-center justify-center w-full px-1 min-h-[30px]">
                    <span 
                      className={`text-center font-sans text-[12.5px] font-black tracking-tight leading-[1.1] whitespace-normal break-all line-clamp-2 max-w-[6.5ch] z-10 ${
                        isResyncing ? 'text-slate-300' : ''
                      }`}
                    >
                      {displayedName}
                    </span>
                    {isResyncing && (
                      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none bg-cyan-950/20 rounded">
                        <RefreshCw className="w-4 h-4 text-cyan-200 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Tiny details overlays */}
                  {node.troubleshootActive && !isResyncing && (
                    <span className="absolute bottom-1 right-1">
                      <RefreshCw className="w-2 h-2 text-white opacity-80 animate-spin" />
                    </span>
                  )}

                  {/* Pin overlay indicator & toggle */}
                  {isPinned ? (
                    <button 
                      onClick={(e) => togglePin(node.id, e)}
                      className="absolute top-0.5 right-0.5 p-0.5 text-white/90 hover:text-rose-200 transition-colors z-10"
                      title={locale === 'ja' ? 'ピン留め解除' : 'Unpin'}
                    >
                      <Pin className="w-2 h-2 fill-current" />
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => togglePin(node.id, e)}
                      className="absolute top-0.5 right-0.5 p-0.5 text-white/50 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-10"
                      title={locale === 'ja' ? 'トップにピン留め' : 'Pin to top'}
                    >
                      <Pin className="w-2 h-2" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List Layout */
        <div className="flex-1 overflow-y-auto max-h-[460px] pr-2 custom-scrollbar" id="nodes-list">
          <div className="flex flex-col gap-1.5 p-1">
            {sorted.map((node) => {
              const isSelected = node.id === selectedEndpointId;
              
              const telemetryMismatch = (node.appState === 'STANDBY' && globalFleetState === 'STREAM' && !node.accessKeyRevoked) || node.status === 'WARNING' || !!node.accessKeyRevoked;
              const mismatchGlow = telemetryMismatch ? 'shadow-[0_0_20px_rgba(244,63,94,0.8)] border-rose-500 bg-rose-900/40' : '';
              
              let bitrateColor = 'text-slate-300';
              if (node.appState === 'STREAM') {
                if (node.mediaBitrateMbps < 2.0) bitrateColor = 'text-rose-400';
                else if (node.mediaBitrateMbps < 3.5) bitrateColor = 'text-amber-400';
              } else if (node.appState === 'STANDBY') {
                if (node.mediaBitrateMbps < 1.0) bitrateColor = 'text-rose-400';
                else if (node.mediaBitrateMbps < 2.0) bitrateColor = 'text-amber-400';
              } else if (node.appState === 'PLAYBACK') {
                if (node.mediaBitrateMbps < 5.0) bitrateColor = 'text-rose-400';
                else if (node.mediaBitrateMbps < 10.0) bitrateColor = 'text-amber-400';
              }
              
              let tempColor = 'text-slate-300';
              if (node.deviceTempC > 75) tempColor = 'text-rose-400';
              else if (node.deviceTempC > 65) tempColor = 'text-amber-400';

              const isPinned = pinnedNodeIds.includes(node.id);
              const indexInPinned = pinnedNodeIds.indexOf(node.id);
              const isResyncing = activeActions && activeActions[node.id] && activeActions[node.id].phase !== 'NOMINAL';
              const isBeingDragged = draggedNodeId === node.id;
              const isTargetOver = dragOverNodeId === node.id;

              const listRowStyle = isResyncing
                ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] bg-cyan-950 text-white animate-pulse font-bold'
                : isBeingDragged
                  ? 'opacity-30 border-dashed border-indigo-500/50 bg-slate-950/20'
                  : `${getBorderColor(node, telemetryMismatch)} ${
                      isSelected 
                        ? (telemetryMismatch ? 'bg-rose-900/70' : 'bg-slate-900/60') 
                        : (telemetryMismatch ? 'hover:bg-rose-900/50' : 'bg-slate-950/40 hover:bg-slate-950/80')
                    }`;

              return (
                <div
                  key={node.id}
                  onClick={() => onSelectEndpoint(node)}
                  draggable={isPinned}
                  onDragStart={(e) => handleDragStart(node.id, e)}
                  onDragOver={(e) => handleDragOver(node.id, e)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(node.id, e)}
                  onDragEnd={handleDragEnd}
                  className={`group relative flex items-center justify-between p-3 pl-6 rounded-lg border transition-all text-left cursor-pointer ${listRowStyle}`}
                  id={`list-node-${node.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectEndpoint(node);
                    }
                  }}
                >
                  {/* DRAG HANDLE FOR PINNED ENDPOINTS */}
                  {isPinned && (
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 left-1 flex flex-col gap-[2px] p-1 cursor-grab active:cursor-grabbing text-slate-500 hover:text-indigo-400 z-20 group-hover:opacity-100 opacity-60 transition-opacity"
                      title={locale === 'ja' ? 'ドラッグして並び替え' : 'Drag to reorder'}
                    >
                      <div className="w-3.5 h-[1.5px] bg-current rounded-full" />
                      <div className="w-3.5 h-[1.5px] bg-current rounded-full" />
                      <div className="w-3.5 h-[1.5px] bg-current rounded-full" />
                    </div>
                  )}

                  {/* DRAG INSERTION INDICATORS */}
                  {isTargetOver && (dragOverPosition === 'top' || dragOverPosition === 'left') && (
                    <div className="absolute top-0 left-0 right-0 h-[3.5px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] z-30 rounded-full animate-pulse" />
                  )}
                  {isTargetOver && (dragOverPosition === 'bottom' || dragOverPosition === 'right') && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3.5px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] z-30 rounded-full animate-pulse" />
                  )}
                  <div className="flex items-center gap-3 min-w-0">
                    {renderStatusIndicator(node, "w-2.5 h-2.5 rounded shrink-0", telemetryMismatch)}
                    <div className="min-w-0">
                      <div className="text-sm font-sans font-bold text-slate-200 truncate">
                        {node.isDecommissioned
                          ? (locale === 'ja' ? `退役済ハードウェア (HW-${node.id.slice(-4)})` : `Decommissioned Hardware (HW-${node.id.slice(-4)})`)
                          : (node.name || (locale === 'ja' ? `未割当ハードウェア (HW-${node.id.slice(-4)})` : `Unassigned Hardware (HW-${node.id.slice(-4)})`))
                        }
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate flex flex-wrap items-center gap-x-2">
                        {node.isDecommissioned ? (
                          <span className="text-amber-500/80 bg-amber-950/20 border border-amber-900/30 px-1.5 py-0.5 rounded text-[9px] font-bold">
                            {locale === 'ja'
                              ? `旧拠点: ${node.decommissionedFrom} | 置換機: HW-${node.replacementNodeId?.slice(-4)}`
                              : `Retired ex-${node.decommissionedFrom} | Replaced by: HW-${node.replacementNodeId?.slice(-4)}`
                            }
                          </span>
                        ) : (
                          <>
                            <span>{node.id}:{node.tailscaleIp}</span>
                            {telemetryMismatch && (
                              <span className="text-[9px] font-bold text-rose-400 bg-rose-950/60 border border-rose-800/60 px-1.5 py-0.2 rounded tracking-tight shrink-0 animate-pulse">
                                {node.accessKeyRevoked
                                  ? (locale === 'ja' ? 'デバイスロック' : 'DEVICE LOCKED')
                                  : node.status === 'WARNING'
                                    ? (locale === 'ja' ? 'MPVクラッシュ' : 'DECODER CRASH')
                                    : (locale === 'ja' ? '同期エラー' : 'FLEET DESYNC')
                                }
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono shrink-0 ml-4">
                    <div className="hidden md:block text-right w-36 sm:w-40">
                      <span className="text-[10px] text-slate-500 block uppercase">{locale === 'ja' ? 'ステータス' : 'Status'}</span>
                      {isResyncing ? (
                        <span className="font-mono font-black text-cyan-400 animate-pulse flex items-center gap-1 justify-end whitespace-nowrap">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin shrink-0 text-cyan-400" />
                          <span className="text-xs font-semibold whitespace-nowrap">
                            {activeActions[node.id].type === 'REBOOT' ? (
                              <>
                                {activeActions[node.id].phase === 'PENDING' && (locale === 'ja' ? '待機中' : 'WAITING')}
                                {activeActions[node.id].phase === 'PHASE_1' && (locale === 'ja' ? '1/3 終了中' : '1/3 SHUTDOWN')}
                                {activeActions[node.id].phase === 'PHASE_2' && (locale === 'ja' ? '2/3 再起動中' : '2/3 REBOOTING')}
                                {activeActions[node.id].phase === 'PHASE_3' && (locale === 'ja' ? '3/3 起動中' : '3/3 STARTING')}
                                {activeActions[node.id].phase === 'NOMINAL' && (locale === 'ja' ? '完了' : 'NOMINAL')}
                              </>
                            ) : activeActions[node.id].type === 'RESYNC' ? (
                              <>
                                {activeActions[node.id].phase === 'PENDING' && (locale === 'ja' ? '待機中' : 'WAITING')}
                                {activeActions[node.id].phase === 'PHASE_1' && (locale === 'ja' ? '1/3 切断中' : '1/3 DISCONNECTING')}
                                {activeActions[node.id].phase === 'PHASE_2' && (locale === 'ja' ? '2/3 再同期中' : '2/3 RESYNCING')}
                                {activeActions[node.id].phase === 'PHASE_3' && (locale === 'ja' ? '3/3 同期中' : '3/3 SYNCING')}
                                {activeActions[node.id].phase === 'NOMINAL' && (locale === 'ja' ? '完了' : 'NOMINAL')}
                              </>
                            ) : (
                              <>
                                {activeActions[node.id].phase === 'PENDING' && (locale === 'ja' ? '待機中' : 'WAITING')}
                                {activeActions[node.id].phase === 'PHASE_1' && (locale === 'ja' ? '1/3 実行中' : '1/3 EXECUTING')}
                                {activeActions[node.id].phase === 'PHASE_2' && (locale === 'ja' ? '2/3 処理中' : '2/3 PROCESSING')}
                                {activeActions[node.id].phase === 'PHASE_3' && (locale === 'ja' ? '3/3 同期中' : '3/3 SYNCING')}
                                {activeActions[node.id].phase === 'NOMINAL' && (locale === 'ja' ? '完了' : 'NOMINAL')}
                              </>
                            )}
                          </span>
                        </span>
                      ) : (
                        <span className={`font-semibold whitespace-nowrap ${node.accessKeyRevoked ? 'text-rose-500 animate-pulse' : node.appState === 'PLAYBACK' ? 'text-pink-400' : node.appState === 'STREAM' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          {node.accessKeyRevoked ? (locale === 'ja' ? 'キー失効中' : 'KEY REVOKED') : node.appState}
                        </span>
                      )}
                    </div>
                    <div className="text-right w-20">
                      <span className="text-[10px] text-slate-500 block uppercase">{locale === 'ja' ? 'ビットレート' : 'Bitrate'}</span>
                      <span className={`font-semibold text-right block w-full ${bitrateColor}`}>{node.mediaBitrateMbps.toFixed(2)} Mbps</span>
                    </div>
                    <div className="hidden sm:block text-right w-16">
                      <span className="text-[10px] text-slate-500 block uppercase">Temp</span>
                      <span className={`font-semibold text-right block w-full pr-1 ${tempColor}`}>{node.deviceTempC}°C</span>
                    </div>

                    {/* PIN AND REORDER CONTROLS */}
                    <div className="flex items-center gap-1 border-l border-slate-800/80 pl-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => togglePin(node.id, e)}
                        className={`p-1 hover:bg-slate-800 rounded transition-colors ${isPinned ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-300'}`}
                        title={isPinned ? (locale === 'ja' ? 'ピン留め解除' : 'Unpin Endpoint') : (locale === 'ja' ? 'トップにピン留め' : 'Pin Endpoint to Top')}
                      >
                        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-indigo-500/20' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm Override Action dialog for EMERGENCY FLEET CONTROL */}
      {pendingBulkAction && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border-2 border-red-950 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-rose-950/20 border-b border-red-950/50 p-4 flex items-center gap-2.5">
              <AlertTriangle className="text-rose-500 w-5 h-5 shrink-0 animate-bounce" />
              <h3 className="text-xs font-mono font-black text-slate-200 tracking-wider uppercase">
                {locale === 'ja' ? '強制一括オーバーライドの確認 (CONFIRM OVERRIDE ACTION)' : 'CONFIRM OVERRIDE ACTION'}
              </h3>
            </div>

            {/* Body */}
            <div className="p-4 flex flex-col gap-3">
              <p className="text-[11px] text-slate-300 font-mono leading-relaxed bg-rose-950/10 border border-rose-900/20 p-2.5 rounded">
                {locale === 'ja'
                  ? '注意: 強制オーバーライドは現在のシステムスケジュールを無視します。この操作はネットワークの一時的な中断を引き起こす可能性があります。'
                  : 'WARNING: Force override ignores current system schedule and telemetry logic. This may cause a brief interruption in active streams.'}
              </p>

              <div className="mt-1 bg-slate-900/80 rounded border border-slate-800 p-3 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-sans font-bold text-slate-300">
                    {locale === 'ja' ? '対象エンドポイント選択:' : 'Target Endpoints:'}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-indigo-400">
                    <button
                      type="button"
                      onClick={() => setTargetNodeIds(endpoints.filter(node => !node.isDormant && !node.isDecommissioned).map(n => n.id))}
                      className="hover:underline cursor-pointer"
                    >
                      {locale === 'ja' ? 'すべて選択' : 'SELECT ALL'}
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => setTargetNodeIds([])}
                      className="hover:underline cursor-pointer"
                    >
                      {locale === 'ja' ? '選択解除' : 'DESELECT ALL'}
                    </button>
                    <span className="text-xs font-mono font-bold text-white px-2 py-0.5 bg-slate-800 rounded ml-1">
                      {targetNodeIds.length} / {endpoints.filter(node => !node.isDormant && !node.isDecommissioned).length}
                    </span>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto bg-slate-950/60 border border-slate-900 rounded p-1 divide-y divide-slate-900/40 custom-scrollbar">
                  {[...endpoints]
                    .filter((node) => !node.isDormant && !node.isDecommissioned)
                    .map((node) => {
                      const isChecked = targetNodeIds.includes(node.id);
                      return (
                        <label 
                          key={node.id} 
                          className="px-2.5 py-1.5 flex items-center justify-between group hover:bg-slate-900/40 cursor-pointer select-none transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTargetNodeIds([...targetNodeIds, node.id]);
                                } else {
                                  setTargetNodeIds(targetNodeIds.filter(id => id !== node.id));
                                }
                              }}
                              className="w-3.5 h-3.5 accent-rose-500 rounded bg-slate-950 border-slate-800 cursor-pointer"
                            />
                            <span className="text-[11px] font-mono font-bold text-slate-200 truncate">
                              {node.name || (locale === 'ja' ? `HW-${node.id.slice(-4)}` : node.id)}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">
                              ({node.tailscaleIp})
                            </span>
                          </div>

                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ml-2 ${
                            isChecked
                              ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                              : 'bg-slate-900/60 border-slate-800 text-slate-500'
                          }`}>
                            {isChecked ? (locale === 'ja' ? '選択中' : 'TARGET') : (locale === 'ja' ? '除外' : 'EXCLUDED')}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="mt-1 flex flex-col gap-1">
                <p className="text-xs font-mono font-bold text-rose-400">
                  {locale === 'ja' ? '実行するアクション:' : 'Action to execute:'}
                </p>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  {pendingBulkAction.type === 'STREAM' && (
                    locale === 'ja'
                      ? `選択したエンドポイントに本番ストリームの再生を強制します: ${pendingBulkAction.streamUri || bulkStreamUri}`
                      : `This will force the selected decoders to receive the designated stream: ${pendingBulkAction.streamUri || bulkStreamUri}`
                  )}
                  {pendingBulkAction.type === 'STANDBY' && (
                    locale === 'ja'
                      ? `選択したエンドポイントを環境用待機フィードの再生状態に強制移行します。`
                      : `This will force the selected decoders to enter the default standby state.`
                  )}
                  {pendingBulkAction.type === 'RESYNC' && (
                    locale === 'ja'
                      ? `選択したエンドポイントのデコーダープロセスを強制リセット・同期します。`
                      : `This will force the selected decoders to perform a system reset and re-sync, recycling frozen playback pipelines.`
                  )}
                  {pendingBulkAction.type === 'REBOOT' && (
                    locale === 'ja'
                      ? `選択したエンドポイントのフルハードウェアコールド再起動を実行します（接続が一時的に切断されます）。`
                      : `This will trigger a full OS cold hardware reboot across all selected endpoints, temporarily interrupting feed connectivity.`
                  )}
                </p>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="bg-slate-900/20 border-t border-slate-900/60 p-3.5 flex justify-end gap-2.5">
              <button
                onClick={() => {
                  setPendingBulkAction(null);
                  setTargetNodeIds([]);
                }}
                className="px-4 py-2 text-xs font-mono font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
              >
                {locale === 'ja' ? 'キャンセル' : 'CANCEL'}
              </button>
              <button
                onClick={() => {
                  if (targetNodeIds.length === 0) {
                    alert(locale === 'ja' ? '少なくとも1台のエンドポイントを選択してください。' : 'Please select at least one endpoint.');
                    return;
                  }
                  if (onTriggerAction) {
                    onTriggerAction(targetNodeIds, pendingBulkAction.type, pendingBulkAction.streamUri || bulkStreamUri);
                  }
                  setPendingBulkAction(null);
                  setTargetNodeIds([]);
                }}
                className="px-4 py-2 text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 rounded shadow-[0_0_15px_rgba(225,29,72,0.4)] transition-all flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {locale === 'ja' ? '強制実行 (EXECUTE)' : 'EXECUTE FORCE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
