/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FleetEndpoint, OtaRelease } from '../types';
import { INITIAL_OTA_RELEASES } from '../data/fleetData';
import { CheckCircle2, ArrowUpCircle, HardDrive, Cpu, AlertTriangle, Play } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  endpoints: FleetEndpoint[];
  onTriggerNodeOta: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, updates: Partial<FleetEndpoint>) => void;
}

export default function OTAManager({ endpoints, onTriggerNodeOta, onUpdateNode }: Props) {
  const [releases, setReleases] = useState<OtaRelease[]>(INITIAL_OTA_RELEASES);
  const [approvedCode, setApprovedCode] = useState(104);
  const [uploading, setUploading] = useState(false);
  const { locale } = useTranslation();

  // Vitals calculations
  const totalNodes = endpoints.length;
  const nodesUpToDate = endpoints.filter((n) => n.versionCode >= approvedCode).length;
  const nodesOutdated = totalNodes - nodesUpToDate;
  const rolloutPercentage = Math.round((nodesUpToDate / totalNodes) * 100);

  // Trigger global silent OTA update across all outdated nodes
  const triggerGlobalOtaRollout = () => {
    const outdated = endpoints.filter((n) => n.versionCode < approvedCode && n.status === 'ONLINE');
    if (outdated.length === 0) {
      alert(locale === 'ja' 
        ? `すべてのオンライン・ノードは既に承認済みバージョン ${approvedCode} で最新です！` 
        : 'All online nodes are already up to date with approvedVersionCode ' + approvedCode + '!');
      return;
    }

    const confirmMsg = locale === 'ja' 
      ? `オンラインの ${outdated.length} 台のノードにサイレント・バックグラウンドアップデート（バージョンコード: ${approvedCode}）を配信しますか？` 
      : `Push Silent background update (versionCode: ${approvedCode}) to ${outdated.length} online nodes?`;

    if (confirm(confirmMsg)) {
      outdated.forEach((node) => {
        onTriggerNodeOta(node.id);
      });
    }
  };

  // Simulate uploading a new OTA apk
  const handleSimulatedApkUpload = () => {
    setUploading(true);
    setTimeout(() => {
      const nextCode = Math.max(...releases.map((r) => r.versionCode)) + 1;
      const newRelease: OtaRelease = {
        versionCode: nextCode,
        versionName: `v1.0.${nextCode - 100}-stable`,
        releaseNotes: locale === 'ja' 
          ? 'パフォーマンスの最適化。WorkManagerのネイティブスレッド起動スケジュールの調整。' 
          : 'Performance optimization. Optimized WorkManager native thread wake schedules.',
        releasedAt: new Date().toISOString().split('T')[0],
        fileSizeMb: 18.6,
        downloadCount: 0
      };

      setReleases([newRelease, ...releases]);
      setApprovedCode(nextCode); // Auto approve new release
      setUploading(false);

      // Force one random node onto older version for demonstration
      const randomNode = endpoints[Math.floor(Math.random() * endpoints.length)];
      onUpdateNode(randomNode.id, {
        versionCode: nextCode - 1,
        logs: [
          ...randomNode.logs,
          `[${new Date().toLocaleTimeString()}] WARNING: New fleet firmware approved (vCode: ${nextCode}). Node version (${randomNode.versionCode}) is now deprecated.`
        ]
      });

    }, 1500);
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 backdrop-blur-md flex-1 flex flex-col gap-6" id="ota-manager-tab">
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <h2 className="text-sm font-mono font-bold tracking-wider text-slate-300 uppercase">
            {locale === 'ja' ? 'サイレントOTAアップデートエンジン' : 'SILENT OTA UPDATE ENGINE'}
          </h2>
          <p className="text-[11px] font-sans text-slate-500 mt-1 leading-normal">
            {locale === 'ja' 
              ? 'デバイス所有者（MDM）権限を必要とせず、ローカルのシステムバインド連携と自己修復ウォッチドッグを介して、バックグラウンドでのシームレスなサイレント・ソフトウェアデプロイを実現します。' 
              : 'Uses standard Android package installation helper APIs with local system-bound coordination and self-healing watchdogs to facilitate seamless background deployments without requiring strict Device Owner (MDM) status.'
            }
          </p>
        </div>

        <button
          onClick={handleSimulatedApkUpload}
          disabled={uploading}
          className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all border cursor-pointer ${
            uploading 
              ? 'bg-slate-950 border-slate-900 text-slate-500' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/30 font-bold shadow-lg shadow-indigo-500/5'
          }`}
        >
          {uploading 
            ? (locale === 'ja' ? 'APK処理中...' : 'Processing APK...') 
            : (locale === 'ja' ? '新しいfleet-controller.apkをアップロード' : 'Upload New fleet-controller.apk')}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="ota-stats">
        <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4">
          <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">
            {locale === 'ja' ? '承認済みフリートコード' : 'Approved Fleet Code'}
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">
            {approvedCode}
          </div>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">
            {locale === 'ja' ? 'アクティブ: ' : 'Active: '}{releases.find((r) => r.versionCode === approvedCode)?.versionName || 'Custom'}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4">
          <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">
            {locale === 'ja' ? 'フリート適合率' : 'Fleet Compliance'}
          </div>
          <div className="text-2xl font-mono font-bold text-slate-200">
            {rolloutPercentage}%
          </div>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">
            {locale === 'ja' 
              ? `${nodesUpToDate} / ${totalNodes} 台のノードが最新` 
              : `${nodesUpToDate} of ${totalNodes} nodes up to date`}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">
              {locale === 'ja' ? '更新保留中のノード' : 'Pending Outdated Nodes'}
            </div>
            <div className="text-2xl font-mono font-bold text-amber-500">
              {nodesOutdated}
            </div>
          </div>
          <button
            onClick={triggerGlobalOtaRollout}
            disabled={nodesOutdated === 0}
            className={`w-full mt-2 py-1.5 rounded text-[10px] font-mono font-bold uppercase transition-all border cursor-pointer ${
              nodesOutdated === 0
                ? 'bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed'
                : 'bg-amber-950/20 hover:bg-amber-950/40 border-amber-800/40 text-amber-400'
            }`}
          >
            {locale === 'ja' ? 'バックグラウンド配信を実行' : 'Trigger Background Rollout'}
          </button>
        </div>
      </div>

      {/* Compliance Bar graph */}
      <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
        <div className="flex items-center justify-between text-xs font-mono mb-2">
          <span className="text-slate-400 font-bold uppercase">
            {locale === 'ja' ? 'デプロイ適合監視モニター' : 'Deployment Compliance Monitor'}
          </span>
          <span className="text-indigo-400">
            {rolloutPercentage}% {locale === 'ja' ? '完了' : 'complete'}
          </span>
        </div>
        <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-900 flex">
          <div 
            className="bg-indigo-500 h-full transition-all duration-500" 
            style={{ width: `${rolloutPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Releases table and pending nodes split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="ota-lists">
        {/* Release History */}
        <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-4">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase mb-3 border-b border-slate-900 pb-2">
            {locale === 'ja' ? 'ソフトウェア・リリース登録簿' : 'Software Release Registry'}
          </h3>

          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
            {releases.map((release) => {
              const isApproved = release.versionCode === approvedCode;
              return (
                <div 
                  key={release.versionCode}
                  className={`p-3 rounded-lg border text-left flex items-start justify-between ${
                    isApproved ? 'bg-slate-900/60 border-indigo-800/40' : 'bg-slate-950 border-slate-900'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-slate-200">{release.versionName}</span>
                      <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-900">
                        {locale === 'ja' ? 'コード: ' : 'Code: '}{release.versionCode}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono leading-relaxed line-clamp-2">
                      {release.releaseNotes}
                    </p>
                    <span className="text-[8px] font-mono text-slate-600 block mt-1.5">
                      {locale === 'ja' 
                        ? `リリース日: ${release.releasedAt} | バイナリサイズ: ${release.fileSizeMb}MB` 
                        : `Released: ${release.releasedAt} | Binary Size: ${release.fileSizeMb}MB`}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 text-right font-mono">
                    {isApproved ? (
                      <span className="text-[10px] text-indigo-400 bg-indigo-950/30 border border-indigo-800/30 px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {locale === 'ja' ? '承認済み' : 'Approved'}
                      </span>
                    ) : (
                      <button
                        onClick={() => setApprovedCode(release.versionCode)}
                        className="text-[9px] text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 bg-slate-950 px-2 py-0.5 rounded font-bold uppercase cursor-pointer"
                      >
                        {locale === 'ja' ? '承認する' : 'Approve'}
                      </button>
                    )}
                    <span className="text-[9px] text-slate-500">
                      {locale === 'ja' ? 'インストール数: ' : 'Installs: '}{release.downloadCount}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Devices */}
        <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-4">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase mb-3 border-b border-slate-900 pb-2 flex items-center justify-between">
            <span>{locale === 'ja' ? `更新保留中のノード (${nodesOutdated})` : `Pending Outdated Nodes (${nodesOutdated})`}</span>
            {nodesOutdated > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          </h3>

          <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
            {nodesOutdated === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-slate-800 rounded-lg">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <p className="text-slate-400 text-xs font-mono">
                  {locale === 'ja' ? 'すべてのノードが最新バージョンにアップデートされています。' : '100% of the active fleet is up to date.'}
                </p>
              </div>
            ) : (
              endpoints
                .filter((n) => n.versionCode < approvedCode)
                .map((node) => (
                  <div 
                    key={node.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-900 bg-slate-950 text-xs font-mono"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        {node.id}
                      </div>
                      <span className="text-[9px] text-slate-500 block truncate max-w-[200px]">
                        {node.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block">{locale === 'ja' ? 'バージョン' : 'VERSION'}</span>
                        <span className="text-amber-500 font-semibold">{node.versionCode}</span>
                      </div>

                      <button
                        onClick={() => onTriggerNodeOta(node.id)}
                        disabled={node.status !== 'ONLINE'}
                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all cursor-pointer ${
                          node.status === 'ONLINE'
                            ? 'bg-indigo-950/30 hover:bg-indigo-950/50 border border-indigo-800/40 text-indigo-400'
                            : 'bg-slate-900 border-slate-850 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        {locale === 'ja' ? 'OTA送信' : 'Push OTA'}
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

