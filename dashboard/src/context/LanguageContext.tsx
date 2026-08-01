/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

type Locale = 'en' | 'ja';

type Translations = typeof translationsEN;

const translationsEN = {
  // Common / Tab Navigation
  brand: 'FLEETSTREAM BRIDGE',
  onPremiseHub: 'ON-PREMISE HUB',
  dashboardSubtitle: 'Streaming Redundancy & Remote Control Fleet Core Dashboard',
  tabVitals: 'Fleet Vitals & Controls',
  tabOta: 'Silent OTA Updates',
  tabProvisioning: 'Provisioning Pipeline',
  triggerCut: 'Trigger RTMP Feed Cut',
  restoreCut: 'Restore RTMP Feed',
  simulateCrash: 'Simulate VLC Crash',
  
  // Dashboard Overview
  centralBridge: 'CENTRAL DATA BRIDGE & RELAY ENGINE',
  encryptedMeshActive: 'TAILSCALE ENCRYPTED MESH ACTIVE',
  filterAll: 'All Discovered Nodes',
  filterOnline: 'Online Nodes',
  filterWarning: 'Warning (Crashed VLC)',
  filterOffline: 'Offline Nodes',
  ingestionLoad: 'Ingestion Load (Telebeat)',
  realtimeJitter: 'Real-time Jitter Stream',
  volatileStorage: 'Volatile Storage (/dev/shm)',
  
  // Device Grid
  searchPlaceholder: 'Search ID, Name, Tailscale IP...',
  activeMeshNodes: 'Active Mesh Nodes',
  noMatchingNodes: 'No matching fleet nodes discovered.',
  clearSearch: 'Clear Search',
  matrixView: 'Matrix View',
  listView: 'List View',
  
  // Device Detail
  noEndpointSelected: 'No Endpoint Selected',
  endpointInstructions: 'Select any television streamer endpoint block from the matrix grid to inspect live vitals, trigger failover parameters, connect USB storage, or review terminal ring logs.',
  onDemandDiagnosticTitle: 'ON-DEMAND TROUBLESHOOTING BRIDGE',
  onDemandDiagnosticDesc: 'Establish direct, reverse proxy-composited scrcpy stream over Tailscale for visual control.',
  initiateDiagnosticStream: 'INITIATE DIAGNOSTIC STREAM',
  activeWatchdogMonitor: 'Active Watchdog Monitor',
  watchdogDesc: 'Watchdog auto-reboot is monitoring player health.',
  watchdogAutoHealed: 'WATCHDOG AUTO-HEALED',
  watchdogRevived: 'The watchdog detected player stall and revived it!',
  forceWatchdog: 'Force Trigger Watchdog Recovery',
  manualVlcVitals: 'Manual VLC Vitals Management',
  vlcTargetStreamDirect: 'VLC Target Stream Direct Config',
  updateStreamTarget: 'Update Stream Target',
  usbController: 'Simulated USB Drive Controller',
  usbPriorityConnected: 'USB 2.0 Priority Storage Connected',
  usbFailoverLoopDesc: 'Mounting virtual storage triggers a high-priority hardware failover loop, overriding normal stream states.',
  unplugUsb: 'Unplug USB Storage',
  plugUsb: 'Plug USB 2.0 Flash Drive',
  terminalRingLog: 'Terminal Ring Log Buffer',
  harvestDiagnostics: 'Harvest Diagnostics Bundle',
  vitalsLogOutput: 'Vitals Log Output',
  
  // Troubleshoot Panel
  activeTunnelStream: 'ACTIVE TUNNEL STREAM',
  secureRemotePort: 'Secure Remote Composition Port | Max Rate Capped (Section 5.1)',
  streamCompositionSetup: 'Stream Composition Setup',
  scaleCap: '800px (Strict Cap)',
  scaleLow: '600px (Low Bandwidth)',
  bitrateCap: '1M (Strict Cap)',
  bitrateConsolidated: '500K (Consolidated Mesh)',
  fpsCap: '20 FPS (Strict Cap)',
  fpsConsolidated: '15 FPS (Consolidated)',
  dualPlayerHandoffPipeline: 'Dual-Player Handoff Pipeline',
  dualPlayerHandoffDesc: 'Hot-swaps hardware decoder rendering elements seamlessly in the background.',
  executeHotSwap: 'Execute Hot-Swap',
  executingSwap: 'Executing Swap...',
  accessibilityInputInjection: 'Accessibility Input Injection Panel',
  startRecordingCasting: 'Start recording or casting?',
  castingWarning: 'com.se_chukei.fleetcontroller will have access to all of the information that\'s visible on your screen or played from your device during recording or casting.',
  startNow: 'Start now',
  bypassed: 'Bypassed ✓',
  accessibilityBus: 'ACCESSIBILITY BUS:',
  
  // OTA Manager
  silentOtaUpgrade: 'Silent OTA Upgrade Management',
  otaSubtitle: 'Broadcast silent Android OTA packages to registered on-premise fleet controllers.',
  uploadNewApk: 'Upload New fleet-controller.apk',
  uploadingApk: 'Processing APK...',
  deploymentCompliance: 'Deployment Compliance Monitor',
  activeReleasesOnMirror: 'Active Releases on Local Mirror',
  approved: 'Approved',
  approveRollout: 'Approve Rollout',
  targetNodeUpdates: 'Target Node Updates',
  installApk: 'Install APK',
  version: 'Version',
  vlcPlayer: 'VLC Player',
  
  // Provisioning Lab
  hardwareProvisioning: 'Hardware Provisioning Lab',
  provisioningSubtitle: 'Generate direct adb-shell shell scripts for initial hardware provisioning over local USB.',
  interactiveScriptConfig: 'Interactive Script Configurator',
  targetApkFileName: 'Target APK File Name',
  packageIdentificationName: 'Package Identification Name',
  inactivitySleepTimeout: 'Inactivity Sleep Timeout (Seconds)',
  generatedShellScript: 'Generated Shell Script (.sh)',
  copied: 'Copied!',
  copyScript: 'Copy Script',
  adbChecklist: 'ADB Provisioning Checklist',
  adHocDiagnosticCommands: 'Ad-Hoc Manual Diagnostic Commands',
  targetDeviceIp: 'Target Device IP',
  establishLink: 'Establish Link',
  verifyWhitelists: 'Verify Whitelists',
  verifySleepMode: 'Verify Sleep Mode',
  shipErrorLogs: 'Ship Error Logs',

  // Footer
  tailscaleEndpointAgents: 'TAILSCALE ENDPOINT AGENTS: 102/102 ONLINE',
  subnet: 'SUBNET: 100.72.15.0/24',
  stationHqTunnel: 'STATION HEADQUARTERS DIRECT TUNNEL DERPER: ACTIVE',
  redundancyRatio: 'REDUNDANCY RATIO: 100% | BROADCAST RESOLUTION: 1080P COMPLIANT',
};

const translationsJA: Translations = {
  // Common / Tab Navigation
  brand: 'フリートストリーム・ブリッジ',
  onPremiseHub: 'オンプレミス・ハブ',
  dashboardSubtitle: 'ストリーミング冗長化＆遠隔制御 フリート・コア・ダッシュボード',
  tabVitals: 'フリート・バイタル＆制御',
  tabOta: 'サイレントOTAアップデート',
  tabProvisioning: 'プロビジョニング・パイプライン',
  triggerCut: 'RTMPフィード遮断テスト',
  restoreCut: 'RTMPフィード復旧',
  simulateCrash: 'VLCクラッシュテスト',
  
  // Dashboard Overview
  centralBridge: '中央データブリッジ ＆ リレーエンジン',
  encryptedMeshActive: 'Tailscale暗号化メッシュ有効',
  filterAll: '全検出ノード',
  filterOnline: 'オンラインノード',
  filterWarning: '警告（VLCダウン）',
  filterOffline: 'オフラインノード',
  ingestionLoad: 'インジェスト負荷（テレメトリ）',
  realtimeJitter: 'リアルタイムジッターストリーム',
  volatileStorage: '/dev/shm（RAMディスク）',
  
  // Device Grid
  searchPlaceholder: 'ID, 拠点名, Tailscale IPで検索...',
  activeMeshNodes: 'アクティブなメッシュノード',
  noMatchingNodes: '該当するフリートノードが見つかりません。',
  clearSearch: '検索をクリア',
  matrixView: 'マトリクス表示',
  listView: 'リスト表示',
  
  // Device Detail
  noEndpointSelected: 'エンドポイント未選択',
  endpointInstructions: 'マトリクスまたはリストからエンドポイントを選択して、ライブ・バイタルの検査、フェイルオーバー実行、仮想USBストレージのマウント、ターミナルログの確認を行ってください。',
  onDemandDiagnosticTitle: 'オンデマンド・トラブルシューティング・ブリッジ',
  onDemandDiagnosticDesc: 'Tailscale経由で、視覚的制御を可能にする直接的な逆プロキシ合成scrcpyストリームを確立します。',
  initiateDiagnosticStream: '診断ストリームを開始',
  activeWatchdogMonitor: 'アクティブ・ウォッチドッグ・モニター',
  watchdogDesc: 'ウォッチドッグ（自動再起動プロセス）がプレイヤーの稼働状態を監視しています。',
  watchdogAutoHealed: 'ウォッチドッグ自己修復完了',
  watchdogRevived: 'ウォッチドッグがプレイヤーのフリーズを検知し、自動復旧しました。',
  forceWatchdog: 'ウォッチドッグ強制復旧',
  manualVlcVitals: 'VLC手動制御パネル',
  vlcTargetStreamDirect: 'VLCターゲットストリーム直接設定',
  updateStreamTarget: 'ストリームターゲットを更新',
  usbController: '仮想USBドライブコントローラ',
  usbPriorityConnected: 'USB 2.0優先ストレージ接続中',
  usbFailoverLoopDesc: '仮想USBをマウントすると、高優先度のハードウェアフェイルオーバーが作動し、通常のストリーム状態を上書きしてローカルファイルを再生します。',
  unplugUsb: 'USBストレージを取り外す',
  plugUsb: 'USB 2.0フラッシュドライブを接続',
  terminalRingLog: 'ターミナル・リングログ・バッファ',
  harvestDiagnostics: '診断バンドルを収集',
  vitalsLogOutput: 'バイタルログ出力',
  
  // Troubleshoot Panel
  activeTunnelStream: 'アクティブ・トンネル・ストリーム',
  secureRemotePort: 'セキュアリモート合成ポート | 最大レート制限あり (セクション5.1)',
  streamCompositionSetup: 'ストリーム合成設定',
  scaleCap: '800px (帯域制限)',
  scaleLow: '600px (低帯域)',
  bitrateCap: '1M (最大レート)',
  bitrateConsolidated: '500K (圧縮メッシュ)',
  fpsCap: '20 FPS (最大レート)',
  fpsConsolidated: '15 FPS (フレームレート圧縮)',
  dualPlayerHandoffPipeline: 'デュアルプレイヤー・ハンドオフ・パイプライン',
  dualPlayerHandoffDesc: 'バックグラウンドでハードウェアデコーダーレンダリング要素をシームレスにホットスワップします。',
  executeHotSwap: 'ホットスワップを実行',
  executingSwap: 'スワップ実行中...',
  accessibilityInputInjection: 'アクセシビリティ入力インジェクションパネル',
  startRecordingCasting: '録画またはキャストを開始しますか？',
  castingWarning: 'com.se_chukei.fleetcontroller は、録画またはキャスト中、画面に表示されるすべての情報やデバイスから再生される情報にアクセスできるようになります。',
  startNow: '今すぐ開始',
  bypassed: 'バイパス完了 ✓',
  accessibilityBus: 'アクセシビリティ・バス:',
  
  // OTA Manager
  silentOtaUpgrade: 'サイレントOTAアップグレード管理',
  otaSubtitle: '登録済みのオンプレミス・フリートコントローラにサイレントAndroid OTAパッケージを配信します。',
  uploadNewApk: '新しい fleet-controller.apk をアップロード',
  uploadingApk: 'APKを処理中...',
  deploymentCompliance: 'デプロイメント・コンプライアンス・モニター',
  activeReleasesOnMirror: 'ローカルミラー上のアクティブなリリース',
  approved: '承認済み',
  approveRollout: 'ロールアウトを承認',
  targetNodeUpdates: '対象ノードの更新',
  installApk: 'APKをインストール',
  version: 'バージョン',
  vlcPlayer: 'VLCプレイヤー',
  
  // Provisioning Lab
  hardwareProvisioning: 'ハードウェア・プロビジョニング・ラボ',
  provisioningSubtitle: 'ローカルUSB経由での初期ハードウェア・プロビジョニング用の adb-shell シェルスクリプトを生成します。',
  interactiveScriptConfig: 'インタラクティブ・スクリプト・コンフィギュレータ',
  targetApkFileName: '対象APKファイル名',
  packageIdentificationName: 'パッケージ識別名',
  inactivitySleepTimeout: '無操作スリープタイムアウト (秒)',
  generatedShellScript: '生成されたシェルスクリプト (.sh)',
  copied: 'コピーしました！',
  copyScript: 'スクリプトをコピー',
  adbChecklist: 'ADBプロビジョニング・チェックリスト',
  adHocDiagnosticCommands: 'アドホック手動診断コマンド',
  targetDeviceIp: '対象デバイスIP',
  establishLink: 'リンク確立',
  verifyWhitelists: 'ホワイトリスト検証',
  verifySleepMode: 'スリープモード検証',
  shipErrorLogs: 'エラーログ送信',

  // Footer
  tailscaleEndpointAgents: 'TAILSCALEエンドポイントエージェント: 102/102 オンライン',
  subnet: 'サブネット: 100.72.15.0/24',
  stationHqTunnel: 'ステーション本部直接トンネルDERPER: アクティブ',
  redundancyRatio: '冗長性比率: 100% | 放送解像度: 1080P準拠',
};

interface LanguageContextProps {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof Translations) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  const t = (key: keyof Translations): string => {
    const dict = locale === 'ja' ? translationsJA : translationsEN;
    return dict[key] || translationsEN[key] || String(key);
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
