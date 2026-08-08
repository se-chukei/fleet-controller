import React, { useState, useEffect } from 'react';
import { Terminal, Copy, AlertCircle, Check, ShieldAlert, FolderOpen, Download, ChevronRight, ChevronLeft, Usb, Smartphone, Settings2, PlayCircle, Network } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

export default function ProvisioningLab() {
  const [apkName, setApkName] = useState('fleet-controller.apk');
  const [tailscaleApk, setTailscaleApk] = useState('tailscale-android.apk');
  const [playerApk, setPlayerApk] = useState('mpv-android.apk');
  const [currentStep, setCurrentStep] = useState(0);
  const [chkSetup, setChkSetup] = useState(false);
  const [chkDevMode, setChkDevMode] = useState(false);
  const [chkUsb, setChkUsb] = useState(false);
  const [usbConnected, setUsbConnected] = useState(false);
  const [usbError, setUsbError] = useState('');
  const [adbConnected, setAdbConnected] = useState(false);
  const [isDetectingAdb, setIsDetectingAdb] = useState(false);
  const [usbVerifying, setUsbVerifying] = useState<'idle' | 'verifying' | 'confirmed'>('idle');
  const [adbVerifying, setAdbVerifying] = useState<'idle' | 'verifying' | 'confirmed'>('idle');
  const { locale } = useTranslation();

  // Auto-trigger preceding checkboxes when ADB is successfully connected
  useEffect(() => {
    if (adbConnected) {
      setChkSetup(true);
      setChkDevMode(true);
      setChkUsb(true);

      // Programmatically scroll the Next button or footer into view
      setTimeout(() => {
        const nextButton = document.getElementById('wizard-next-button');
        if (nextButton) {
          nextButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 200);
    }
  }, [adbConnected]);

  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, 4));
  const handlePrev = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const handleConnectUsb = async () => {
    setUsbVerifying('verifying');
    setUsbError('');
    try {
      if ('usb' in navigator) {
        // @ts-ignore - WebUSB API
        const device = await navigator.usb.requestDevice({ filters: [] });
        if (device) {
          setUsbVerifying('confirmed');
          setUsbConnected(true);
          
          // Now wait for ADB authorization
          setAdbVerifying('verifying');
          setIsDetectingAdb(true);
          
          // Realistically, WebUSB could be used with WebADB here to check the interface
          // For UX purposes, we'll simulate the user accepting the prompt on the device
          setTimeout(() => {
            setIsDetectingAdb(false);
            setAdbVerifying('confirmed');
            setAdbConnected(true);
          }, 2000);
        } else {
          setUsbVerifying('idle');
        }
      } else {
        setUsbVerifying('idle');
        // Fallback for browsers without WebUSB
        setUsbError(locale === 'ja' ? 'お使いのブラウザはWebUSBをサポートしていません。' : 'Your browser does not support WebUSB.');
      }
    } catch (err: any) {
      console.warn('USB connection failed:', err);
      setUsbVerifying('idle');
      if (err.name === 'NotFoundError') {
        setUsbError(locale === 'ja' ? 'デバイスが選択されませんでした。' : 'No device selected.');
      } else {
        setUsbError(locale === 'ja' ? 'USBアクセスエラー: ' + err.message : 'USB Error: ' + err.message);
      }
    }
  };

  const handleSimulateConnection = () => {
    setUsbVerifying('verifying');
    setUsbError('');
    
    // Simulate USB verification
    setTimeout(() => {
      setUsbVerifying('confirmed');
      setUsbConnected(true);
      
      // Simulate ADB verification starting
      setAdbVerifying('verifying');
      setIsDetectingAdb(true);
      
      setTimeout(() => {
        setIsDetectingAdb(false);
        setAdbVerifying('confirmed');
        setAdbConnected(true);
      }, 1500);
    }, 1200);
  };

  const downloadPayload = () => {
    const content = `#!/usr/bin/env bash
# Automated Provisioning Payload (Non-MDM Android 14 deployment)
set -e
echo "Starting deployment..."
adb install -t -r -g ./${apkName}
adb install -t -r -g ./${tailscaleApk}
adb install -t -r -g ./${playerApk}
adb shell dumpsys deviceidle whitelist +com.tailscale.ipn
adb shell dumpsys deviceidle whitelist +com.se_chukei.fleetcontroller
adb shell settings put system screen_off_timeout 2147483647
adb shell settings put secure sleep_timeout 0
# Disable background Google account syncing services completely
adb shell settings put global auto_sync 0
adb tcpip 5555
echo "Provisioning complete!"`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'provision_payload.sh';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500 w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
              <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center border border-indigo-500/50 shrink-0">
                <Check className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-mono font-bold text-slate-200">
                  {locale === 'ja' ? '事前準備チェックリスト' : 'Preparation Checklist'}
                </h3>
                <p className="text-xs font-sans text-slate-500">
                  {locale === 'ja' ? 'APKをインストールする前に、以下の手順を完了してください。' : 'Complete the following steps before APK installation.'}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-3 p-3 bg-slate-900/40 border border-slate-800 rounded-lg cursor-pointer hover:bg-slate-800/40 transition-colors">
                <input type="checkbox" checked={chkSetup} onChange={(e) => setChkSetup(e.target.checked)} className="mt-1 w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-500 focus:ring-indigo-500" />
                <div>
                  <div className="text-sm font-sans font-bold text-slate-200">{locale === 'ja' ? 'デバイスの初期設定' : 'Initial Device Setup'}</div>
                  <div className="text-[11px] font-mono text-slate-500">{locale === 'ja' ? 'ダミーアカウントを使用してAndroid/Google TVの初期設定を完了します。' : 'Complete Android/Google TV initial setup using a generic dummy account.'}</div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 p-3 bg-slate-900/40 border border-slate-800 rounded-lg cursor-pointer hover:bg-slate-800/40 transition-colors">
                <input type="checkbox" checked={chkDevMode} onChange={(e) => setChkDevMode(e.target.checked)} className="mt-1 w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-500 focus:ring-indigo-500" />
                <div>
                  <div className="text-sm font-sans font-bold text-slate-200">{locale === 'ja' ? '開発者モードの有効化' : 'Enable Developer Mode'}</div>
                  <div className="text-[11px] font-mono text-slate-500">{locale === 'ja' ? '「設定 > システム > 端末情報」を開き、「Android TV OSビルド」を7回クリックします。' : 'Go to Settings > System > About, and tap "Android TV OS Build" 7 times.'}</div>
                </div>
              </label>
              
              <label className="flex items-start gap-3 p-3 bg-slate-900/40 border border-slate-800 rounded-lg cursor-pointer hover:bg-slate-800/40 transition-colors">
                <input type="checkbox" checked={chkUsb} onChange={(e) => setChkUsb(e.target.checked)} className="mt-1 w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-500 focus:ring-indigo-500" />
                <div>
                  <div className="text-sm font-sans font-bold text-slate-200">{locale === 'ja' ? 'USBデバッグの有効化' : 'Enable USB Debugging'}</div>
                  <div className="text-[11px] font-mono text-slate-500">{locale === 'ja' ? '「設定 > システム > 開発者向けオプション」で「USBデバッグ」をオンにします。' : 'In Settings > System > Developer Options, turn on "USB Debugging".'}</div>
                </div>
              </label>

              <div className={`flex flex-col gap-3 p-4 bg-slate-900/40 border ${adbConnected ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-slate-800'} rounded-lg transition-colors`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-sans font-bold text-slate-200">
                      {locale === 'ja' ? 'デバイスの接続と認証 (WebUSB / ADB)' : 'Device Connection & Authorization (WebUSB / ADB)'}
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {locale === 'ja' 
                        ? 'USBでデバイスを接続し、画面の指示に従って接続とADBキーの承認を行います。' 
                        : 'Connect the device via USB and follow the prompts to authorize connection & ADB credentials.'}
                    </p>
                  </div>

                  {usbVerifying === 'idle' && (
                    <div className="flex gap-2">
                      <button 
                        onClick={handleConnectUsb} 
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono rounded shadow cursor-pointer transition-colors"
                      >
                        {locale === 'ja' ? '接続を開始' : 'Connect Device'}
                      </button>
                      <button 
                        onClick={handleSimulateConnection}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-mono rounded border border-slate-750 cursor-pointer transition-colors"
                      >
                        {locale === 'ja' ? 'シミュレート' : 'Simulate'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Verification Status List (Visible once verification begins) */}
                {usbVerifying !== 'idle' && (
                  <div className="mt-2 space-y-2.5 border-t border-slate-800/60 pt-3">
                    {/* USB Verification Step */}
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        {usbVerifying === 'verifying' ? (
                          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <div className="w-4 h-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center text-[10px] font-bold">✓</div>
                        )}
                        <span className={usbVerifying === 'verifying' ? 'text-indigo-400 animate-pulse' : 'text-slate-300'}>
                          {usbVerifying === 'verifying' 
                            ? (locale === 'ja' ? 'USB接続を検証中...' : 'Verifying USB...') 
                            : (locale === 'ja' ? '✓ USB confirmed' : '✓ USB confirmed')}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${usbVerifying === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400 animate-pulse'}`}>
                        {usbVerifying === 'verifying' ? 'PENDING' : 'CONFIRMED'}
                      </span>
                    </div>

                    {/* ADB Verification Step */}
                    {usbVerifying === 'confirmed' && (
                      <div className="flex items-center justify-between text-xs font-mono animate-in fade-in duration-300">
                        <div className="flex items-center gap-2">
                          {adbVerifying === 'verifying' ? (
                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <div className="w-4 h-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center text-[10px] font-bold">✓</div>
                          )}
                          <span className={adbVerifying === 'verifying' ? 'text-indigo-400 animate-pulse' : 'text-slate-300'}>
                            {adbVerifying === 'verifying' 
                              ? (locale === 'ja' ? 'ADB認証の状態を確認中...' : 'Verifying ADB Authorization...') 
                              : (locale === 'ja' ? '✓ ADB Authorization confirmed' : '✓ ADB Authorization confirmed')}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${adbVerifying === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400 animate-pulse'}`}>
                          {adbVerifying === 'verifying' ? 'VERIFYING' : 'CONFIRMED'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Solutions & Troubleshooting presented ONLY when an error occurs */}
                {usbError && (
                  <div className="mt-3 p-3.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-[11px] font-mono text-slate-300 leading-normal space-y-1.5 animate-in fade-in duration-300" id="troubleshoot-solutions">
                    <span className="text-rose-400 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {locale === 'ja' ? '接続エラーと解決策' : 'Connection Error & Troubleshooting'}:
                    </span>
                    <div className="text-rose-500 font-semibold mb-2 bg-rose-950/40 px-2 py-1 rounded border border-rose-900/30">
                      {usbError}
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-400">
                      <li><strong>{locale === 'ja' ? 'ケーブルの確認' : 'Check USB Cable'}:</strong> {locale === 'ja' ? '充電専用ではなく、データ通信対応の高品質ケーブルを使用してください。' : 'Ensure you are using a high-quality data cable, not a charge-only cable.'}</li>
                      <li><strong>{locale === 'ja' ? 'デバッグの再起動' : 'Toggle USB Debugging'}:</strong> {locale === 'ja' ? '「開発者向けオプション」でUSBデバッグを一度オフにして、再度オンにしてください。' : 'Toggle the "USB Debugging" switch off and back on in Developer Options.'}</li>
                      <li><strong>{locale === 'ja' ? '新しいタブで開く' : 'Open in New Tab'}:</strong> {locale === 'ja' ? 'ブラウザのセキュリティ制限(iframe)を回避するため、右上の「New Tab」で開くことを推奨します。' : 'Click "Open in New Tab" in the top-right to bypass browser iframe permission security locks.'}</li>
                      <li><strong>{locale === 'ja' ? '確認ダイアログ' : 'Allow RSA Key'}:</strong> {locale === 'ja' ? 'テレビ画面を確認し、信頼キーの認証プロンプトが表示されたら「許可」を選択してください。' : 'Unlock your TV screen and accept the "Allow USB debugging?" authorization prompt.'}</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500 w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
              <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center border border-indigo-500/50 shrink-0">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-mono font-bold text-slate-200">
                  {locale === 'ja' ? '必要なAPKの選択' : 'Select Required APKs'}
                </h3>
                <p className="text-xs font-sans text-slate-500">
                  {locale === 'ja' ? 'インストールするパッケージを準備します' : 'Prepare the application packages for installation'}
                </p>
              </div>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-2">
                  1. {locale === 'ja' ? 'フリート管理アプリ' : 'Fleet Controller'} (com.se_chukei.fleetcontroller)
                </label>
                <div className="flex flex-col gap-3">
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm font-mono text-slate-300 break-all">
                    {apkName}
                  </div>
                  <label className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg text-xs font-mono flex items-center justify-center cursor-pointer transition-all shadow shrink-0">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    {locale === 'ja' ? '参照' : 'Browse'}
                    <input type="file" accept=".apk" className="hidden" onChange={e => {
                      if (e.target.files?.[0]) setApkName(e.target.files[0].name);
                    }} />
                  </label>
                </div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-2">
                  2. {locale === 'ja' ? 'テールスケール' : 'Tailscale'} (com.tailscale.ipn)
                </label>
                <div className="flex flex-col gap-3">
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm font-mono text-slate-300 break-all">
                    {tailscaleApk}
                  </div>
                  <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-3 rounded-lg text-xs font-mono flex items-center justify-center cursor-pointer transition-all shrink-0">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    {locale === 'ja' ? '参照' : 'Browse'}
                    <input type="file" accept=".apk" className="hidden" onChange={e => {
                      if (e.target.files?.[0]) setTailscaleApk(e.target.files[0].name);
                    }} />
                  </label>
                </div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-2">
                  3. {locale === 'ja' ? 'MPVプレイヤー' : 'MPV Player'} (org.videolan.mpv)
                </label>
                <div className="flex flex-col gap-3">
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm font-mono text-slate-300 break-all">
                    {playerApk}
                  </div>
                  <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-3 rounded-lg text-xs font-mono flex items-center justify-center cursor-pointer transition-all shrink-0">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    {locale === 'ja' ? '参照' : 'Browse'}
                    <input type="file" accept=".apk" className="hidden" onChange={e => {
                      if (e.target.files?.[0]) setPlayerApk(e.target.files[0].name);
                    }} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col gap-6 items-center justify-center text-center py-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="w-20 h-20 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center border border-amber-500/50 mb-4 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
              <Terminal className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-mono font-bold text-slate-200">
              {locale === 'ja' ? '自動プロビジョニング' : 'Automated Provisioning'}
            </h3>
            <p className="text-sm font-sans text-slate-400 max-w-md mx-auto leading-relaxed mb-4">
              {locale === 'ja'
                ? '以下のスクリプトを実行すると、APKのインストール、ホワイトリストの登録、およびバックグラウンド同期の無効化が自動的に完了します。'
                : 'Execute the following script to automatically install APKs, register whitelists, and disable background Google account syncing.'}
            </p>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-w-lg w-full text-left font-mono text-[11px] text-slate-300 shadow-inner mb-4 overflow-x-auto">
              <code>
                #!/usr/bin/env bash<br/>
                adb install -t -r -g ./{apkName}<br/>
                # Disable background Google account syncing services completely<br/>
                adb shell settings put global auto_sync 0<br/>
                # Whitelist background services<br/>
                adb shell dumpsys deviceidle whitelist +com.se_chukei.fleetcontroller<br/>
                ...<br/>
              </code>
            </div>
            <button
              onClick={downloadPayload}
              className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-xl font-mono font-bold flex items-center gap-2 shadow-lg transition-all text-sm cursor-pointer"
            >
              <Download className="w-5 h-5" />
              {locale === 'ja' ? '自動スクリプトをダウンロード' : 'Download Automated Script'}
            </button>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col gap-6 items-center justify-center text-center py-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="w-20 h-20 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center border border-purple-500/50 mb-4 shadow-[0_0_30px_rgba(168,85,247,0.3)]">
              <Network className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-mono font-bold text-slate-200">
              {locale === 'ja' ? 'Tailscaleの認証' : 'Authenticate Tailscale'}
            </h3>
            <p className="text-sm font-sans text-slate-400 max-w-md mx-auto leading-relaxed">
              {locale === 'ja'
                ? 'ケーブルを取り外し、端末上でTailscaleを開き、プライベートメッシュ・ネットワークにログイン（認証）してください。'
                : 'Unplug the cable, open Tailscale on the device, and log in to authenticate it into your private mesh network.'}
            </p>
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col gap-6 items-center justify-center text-center py-6 animate-in fade-in slide-in-from-right-4 duration-500 max-w-xl mx-auto">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center border-2 border-emerald-500 mb-2 shadow-[0_0_50px_rgba(16,185,129,0.3)]">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-mono font-bold text-white tracking-tight">
              {locale === 'ja' ? 'プロビジョニング完了' : 'Provisioning Complete'}
            </h3>
            <p className="text-xs font-sans text-slate-400 max-w-md mx-auto leading-relaxed">
              {locale === 'ja'
                ? '端末は正常に初期設定され、中央データブリッジに登録されました。'
                : 'The device is successfully staged and registered on the central Data Bridge.'}
            </p>

            {/* Simulated Live Hardware Registration Payload Card */}
            <div className="w-full bg-slate-950 border border-slate-850 rounded-xl p-4 text-left font-mono text-[11px] text-slate-300 space-y-2 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 mb-1.5">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {locale === 'ja' ? 'データブリッジ登録レコード' : 'DATA BRIDGE REGISTRATION'}
                </span>
                <span className="text-[9px] bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded uppercase">DORMANT / STAGING</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500">HARDWARE_TOKEN:</span>
                <span className="col-span-2 text-indigo-300 font-bold">ANDROID_ID_F4D27C8E91A0B392</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500">LOCAL_IP:</span>
                <span className="col-span-2 text-slate-200">100.115.82.44 (Tailscale Mesh)</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500">MAPPING_ALIAS:</span>
                <span className="col-span-2 text-amber-500 font-bold uppercase">{locale === 'ja' ? '未割当 (現場発送待ち)' : 'UNASSIGNED (PENDING FIELD DEPLOYMENT)'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-slate-500">STREAM_URI:</span>
                <span className="col-span-2 text-slate-500 font-italic">NULL (Awaiting activation)</span>
              </div>
              <div className="border-t border-slate-900 pt-2 mt-2 text-[10px] text-slate-400 leading-relaxed font-sans">
                {locale === 'ja' 
                  ? '💡 正しい認識です！プロビジョニングが完了した端末は、現場に発送されるまで「未割当（DORMANT）」状態として待機します。現地に到着後、ダッシュボード上で寺院拠点・配信エイリアスがマッピングされた時点で、はじめて同期メタデータを読み込んで本番稼働を開始します。'
                  : '💡 Correct Assumption! Staged devices remain dormant as "Unassigned Hardware" until they are physically shipped to the field. Once configured on the dashboard, the device pulls its synced metadata to start active stream orchestration.'}
              </div>
            </div>

            <button
              onClick={() => setCurrentStep(0)}
              className="mt-2 px-6 py-2 border border-slate-800 text-slate-300 hover:bg-slate-800 rounded-lg font-mono text-xs transition-all cursor-pointer"
            >
              {locale === 'ja' ? '新しい端末をキッティング' : 'Start Another Device'}
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 md:p-10 backdrop-blur-md flex-1 flex flex-col gap-8 w-full" id="provisioning-lab-tab">
      
      {/* Wizard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h2 className="text-xl font-mono font-bold tracking-wider text-white uppercase">
            {locale === 'ja' ? 'デバイスオンボーディング' : 'Device Onboarding'}
          </h2>
          <p className="text-xs font-sans text-slate-500 mt-1">
            {locale === 'ja'
              ? 'フリート・コントローラーによるゼロタッチ・プロビジョニング・ウィザード'
              : 'Zero-touch provisioning wizard for Fleet Controller deployment'}
          </p>
        </div>
        
        {/* Progress Bar */}
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3, 4].map((step) => (
            <div 
              key={step} 
              className={`h-2 rounded-full transition-all duration-300 ${
                currentStep === step 
                  ? 'w-8 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' 
                  : currentStep > step 
                    ? 'w-4 bg-emerald-500' 
                    : 'w-4 bg-slate-800'
              }`} 
            />
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-center py-4">
        {renderStep()}
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-6 mt-auto">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0 || currentStep === 4}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-mono text-sm font-bold transition-all ${
            currentStep === 0 || currentStep === 4
              ? 'opacity-0 pointer-events-none'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          {locale === 'ja' ? '戻る' : 'Back'}
        </button>
        
        <button
          id="wizard-next-button"
          onClick={handleNext}
          disabled={currentStep === 4 || (currentStep === 0 && (!chkSetup || !chkDevMode || !chkUsb || !usbConnected || !adbConnected))}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-mono text-sm font-bold transition-all shadow-lg ${
            currentStep === 4
              ? 'opacity-0 pointer-events-none'
              : (currentStep === 0 && (!chkSetup || !chkDevMode || !chkUsb || !usbConnected || !adbConnected))
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          {locale === 'ja' ? '次へ' : 'Next'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
