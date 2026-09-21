/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FleetEndpoint, ActionState } from '../types';
import { Search, Grid, List, AlertCircle, HardDrive, RefreshCw, Zap, Play, Square, Lock, Unlock, Info, AlertTriangle, Check, Pin, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Power, HelpCircle } from 'lucide-react';
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

interface IssueGroup {
  id: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'WARNING';
  suggestedAction: 'RESYNC' | 'REBOOT' | 'STANDBY';
  suggestedActionLabel: string;
  actionExplanation: string;
  estimatedRecovery: string;
  endpoints: FleetEndpoint[];
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const { locale, t } = useTranslation();

  const handleToggleSelect = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeIds(prev =>
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
    );
  };

  const handleSelectGroupAll = (groupEndpoints: FleetEndpoint[], e: React.MouseEvent) => {
    e.stopPropagation();
    const groupIds = groupEndpoints.map(n => n.id);
    const allSelected = groupIds.every(id => selectedNodeIds.includes(id));
    if (allSelected) {
      setSelectedNodeIds(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setSelectedNodeIds(prev => Array.from(new Set([...prev, ...groupIds])));
    }
  };

  // Categorize endpoints into issue groups
  const frozenStreamNodes: FleetEndpoint[] = [];
  const highTempNodes: FleetEndpoint[] = [];
  const offlineNodes: FleetEndpoint[] = [];
  const nominalNodes: FleetEndpoint[] = [];

  endpoints.forEach(node => {
    // 1. Check dormant toggle filter
    if (showDormantOnly && !node.isDormant) return;
    if (!showDormantOnly && node.isDormant) return;

    // 2. Search term matching
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const displayName = node.name || `ANDROID_ID_${node.id.replace('ANDROID_ID_', '')}`;
      const matches = node.id.toLowerCase().includes(term) ||
                      displayName.toLowerCase().includes(term) ||
                      node.tailscaleIp.includes(term);
      if (!matches) return;
    }

    // 3. Issue categorization
    const isFrozen = (node.appState === 'STREAM' && node.vlcBitrateMbps < 1.0) || node.accessKeyRevoked;
    const isHot = node.deviceTempC >= 80;
    const isOffline = node.status === 'OFFLINE';

    if (isOffline) {
      offlineNodes.push(node);
    } else if (isFrozen) {
      frozenStreamNodes.push(node);
    } else if (isHot) {
      highTempNodes.push(node);
    } else {
      nominalNodes.push(node);
    }
  });

  const issueGroups: IssueGroup[] = [
    {
      id: 'FROZEN_STREAM',
      title: locale === 'ja' ? 'フリーズしたストリーム' : 'Frozen Video Stream',
      description: locale === 'ja' ? '映像デコーダーの応答がありません' : 'Video feed frozen or decoder unresponsive',
      severity: 'CRITICAL',
      suggestedAction: 'RESYNC',
      suggestedActionLabel: locale === 'ja' ? 'ストリーム再同期' : 'Restart Stream',
      actionExplanation: locale === 'ja' ? 'アプリや端末を再起動せずに映像ストリームを一時的にリセットします。' : 'Momentarily resets video stream decoder without restarting the app or device.',
      estimatedRecovery: '3 - 5s',
      endpoints: frozenStreamNodes
    },
    {
      id: 'HIGH_TEMP',
      title: locale === 'ja' ? '高温警告 (>80°C)' : 'High Temperature (>80°C)',
      description: locale === 'ja' ? '端末の温度が閾値を超えています' : 'Device core temperature exceeded safe operating threshold',
      severity: 'WARNING',
      suggestedAction: 'STANDBY',
      suggestedActionLabel: locale === 'ja' ? 'スタンバイに移行' : 'Force Standby',
      actionExplanation: locale === 'ja' ? '端末の負荷を下げるため、一時的に待機モードへ移行します。' : 'Forces device into low-power standby mode to allow thermal dissipation.',
      estimatedRecovery: '10 - 15s',
      endpoints: highTempNodes
    },
    {
      id: 'OFFLINE',
      title: locale === 'ja' ? 'オフライン / ハートビート停止' : 'Offline / Heartbeat Timeout',
      description: locale === 'ja' ? 'データブリッジとの通信が切断されています' : 'No telemetry ping received over Tailscale bridge',
      severity: 'CRITICAL',
      suggestedAction: 'REBOOT',
      suggestedActionLabel: locale === 'ja' ? '端末再起動' : 'Reboot Device',
      actionExplanation: locale === 'ja' ? 'Tailscale ADB経由でOS全体のハード再起動をトリガーします。' : 'Triggers a full system OS hardware reboot via ADB over Tailscale.',
      estimatedRecovery: '45 - 60s',
      endpoints: offlineNodes
    }
  ].filter(g => g.endpoints.length > 0);

  const totalAlertingCount = issueGroups.reduce((acc, g) => acc + g.endpoints.length, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100 p-4 space-y-4 overflow-hidden">
      {/* Search & Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={locale === 'ja' ? '端末名、ID、IPで検索...' : 'Search by name, ID, or IP...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onDormantToggle(!showDormantOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              showDormantOnly
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
            }`}
          >
            {showDormantOnly
              ? (locale === 'ja' ? '退役ノードのみ表示中' : 'Showing Retired')
              : (locale === 'ja' ? '退役ノードを表示' : 'Show Retired')}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar">
        {/* Issue Groups (Alerting Endpoints) */}
        {issueGroups.map(group => {
          const groupSelectedIds = group.endpoints.map(n => n.id).filter(id => selectedNodeIds.includes(id));
          const hasSelections = groupSelectedIds.length > 0;
          const targetIds = hasSelections ? groupSelectedIds : group.endpoints.map(n => n.id);
          const buttonText = hasSelections
            ? `${group.suggestedActionLabel} (${groupSelectedIds.length} ${locale === 'ja' ? '件選択' : 'Selected'})`
            : `${locale === 'ja' ? '一括' : 'Resolve All'} ${group.suggestedActionLabel} (${group.endpoints.length})`;

          const isCritical = group.severity === 'CRITICAL';
          const headerBg = isCritical
            ? 'bg-rose-950/90 border-rose-500/60 text-rose-200'
            : 'bg-amber-950/90 border-amber-500/60 text-amber-200';
          const badgeBg = isCritical ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-950';

          return (
            <div key={group.id} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-lg">
              {/* Sticky Issue Group Heading Panel */}
              <div className={`sticky top-0 z-20 flex flex-wrap items-center justify-between p-3.5 border-b backdrop-blur-md ${headerBg}`}>
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider ${badgeBg}`}>
                    {group.severity}
                  </span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold tracking-tight">{group.title}</h3>
                      <span className="text-xs font-mono font-semibold px-2 py-0.2 rounded-full bg-slate-950/60 border border-current opacity-80">
                        {group.endpoints.length} {locale === 'ja' ? '台' : 'devices'}
                      </span>
                    </div>
                    <p className="text-xs opacity-80 mt-0.5">{group.description}</p>
                  </div>
                </div>

                {/* Group Resolution Controls */}
                <div className="flex items-center space-x-3 mt-2 sm:mt-0">
                  <div className="relative">
                    <button
                      onMouseEnter={() => setActiveTooltip(group.id)}
                      onMouseLeave={() => setActiveTooltip(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTooltip(prev => prev === group.id ? null : group.id);
                      }}
                      className="p-1.5 rounded-lg bg-slate-950/50 hover:bg-slate-950 text-slate-300 transition-colors cursor-pointer border border-slate-700/50"
                      title="View Action Effect & Time"
                    >
                      <Info className="w-4 h-4" />
                    </button>

                    {activeTooltip === group.id && (
                      <div className="absolute right-0 top-10 z-30 w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-xs space-y-1.5 text-slate-200 pointer-events-none">
                        <div className="font-bold text-indigo-400 font-mono">
                          {locale === 'ja' ? '処置の影響と回復時間:' : 'Action Effect & Recovery:'}
                        </div>
                        <p className="text-slate-300 leading-relaxed">{group.actionExplanation}</p>
                        <div className="text-[10px] font-mono text-emerald-400 font-semibold pt-1 border-t border-slate-800">
                          ⏱️ {locale === 'ja' ? '推定回復時間:' : 'Estimated Recovery:'} {group.estimatedRecovery}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => onTriggerAction && onTriggerAction(targetIds, group.suggestedAction)}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-md hover:shadow-indigo-500/20 transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{buttonText}</span>
                  </button>
                </div>
              </div>

              {/* Endpoint Panels under this Issue */}
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.endpoints.map(node => {
                  const isSelected = selectedNodeIds.includes(node.id);
                  const isItemTooltipActive = activeTooltip === node.id;

                  return (
                    <div
                      key={node.id}
                      onClick={() => onSelectEndpoint(node)}
                      className={`relative p-3 rounded-xl border transition-all cursor-pointer bg-slate-950/80 hover:bg-slate-900 ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                          : isCritical
                          ? 'border-rose-900/60 hover:border-rose-500/60'
                          : 'border-amber-900/60 hover:border-amber-500/60'
                      }`}
                    >
                      {/* Selection Checkbox */}
                      <div className="absolute top-2.5 right-2.5 z-10" onClick={(e) => handleToggleSelect(node.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                      </div>

                      {/* Header Info */}
                      <div className="pr-6">
                        <div className="font-bold text-xs text-slate-100 truncate">
                          {node.name || `HW-${node.id.slice(-4)}`}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">{node.tailscaleIp}</div>
                      </div>

                      {/* Single Issue Description Badge */}
                      <div className="mt-2.5 py-1 px-2 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-amber-300 truncate">
                        ⚠️ {group.title}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEndpoint(node);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] transition-colors"
                        >
                          {locale === 'ja' ? '詳細' : 'Detail'}
                        </button>

                        <div className="flex items-center space-x-1 relative">
                          <button
                            onMouseEnter={() => setActiveTooltip(node.id)}
                            onMouseLeave={() => setActiveTooltip(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTooltip(prev => prev === node.id ? null : node.id);
                            }}
                            className="p-1 rounded bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          {isItemTooltipActive && (
                            <div className="absolute right-0 bottom-8 z-30 w-60 p-2.5 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-[11px] text-slate-300 pointer-events-none">
                              <p className="font-semibold text-indigo-400 mb-1">{group.suggestedActionLabel}</p>
                              <p>{group.actionExplanation}</p>
                              <span className="block mt-1 font-mono text-[10px] text-emerald-400">
                                ⏱️ {group.estimatedRecovery}
                              </span>
                            </div>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onTriggerAction) onTriggerAction([node.id], group.suggestedAction);
                            }}
                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            {locale === 'ja' ? '解決' : 'Resolve'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Nominal Devices Section (Green Traffic Light) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden p-4">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
              <h3 className="text-sm font-bold text-slate-200">
                {locale === 'ja' ? '正常稼働中の端末' : 'Nominal Endpoints'}
              </h3>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                {nominalNodes.length} {locale === 'ja' ? '台' : 'devices'}
              </span>
            </div>
          </div>

          {nominalNodes.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs font-mono">
              {locale === 'ja' ? '該当する正常端末はありません' : 'No nominal endpoints in this filter'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {nominalNodes.map(node => {
                const isSelected = selectedNodeIds.includes(node.id);
                return (
                  <div
                    key={node.id}
                    onClick={() => onSelectEndpoint(node)}
                    className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/60 hover:bg-slate-900 hover:border-slate-700 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="font-bold text-xs text-slate-200 truncate max-w-[120px]">
                            {node.name || `HW-${node.id.slice(-4)}`}
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelect(node.id, e as any)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-1 pl-4">{node.tailscaleIp}</div>

                      <div className="mt-2.5 pl-4 flex items-center space-x-2">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {node.appState}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEndpoint(node);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[10px] transition-colors"
                      >
                        {locale === 'ja' ? '詳細' : 'Detail'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
