import re

with open('src/components/ProvisioningLab.tsx', 'r') as f:
    content = f.read()

# Replace step numbering in cases
content = content.replace('case 4:', 'case 5:')
content = content.replace('case 3:', 'case 4:')
content = content.replace('case 2:', 'case 3:')
content = content.replace('case 1:', 'case 2:')
content = content.replace('case 0:', 'case 1:')

# Add new case 0
case0 = '''      case 0:
        return (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500 w-full max-w-2xl mx-auto">
            <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
              <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center border border-rose-500/50 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-mono font-bold text-slate-200">
                  {locale === 'ja' ? 'ダミーアカウントの設定確認' : 'Confirm Dummy Account Setup'}
                </h3>
                <p className="text-xs font-sans text-slate-500">
                  {locale === 'ja' ? 'GTS（Google TV Streamer）に専用のダミーアカウントが設定されていることを確認してください。' : 'Ensure that GTS (Google TV Streamer) has been set up with a dedicated dummy account.'}
                </p>
              </div>
            </div>
            
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-6 text-center">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-4 animate-pulse" />
              <h4 className="text-sm font-mono font-bold text-rose-400 mb-2 uppercase">
                {locale === 'ja' ? '警告: 個人のアカウントを使用しないでください' : 'WARNING: Do Not Use Personal Accounts'}
              </h4>
              <p className="text-[11px] font-mono text-slate-400 leading-relaxed max-w-md mx-auto">
                {locale === 'ja' ? 'フリートデバイスは自動的にプロビジョニングされ、完全にロックダウンされます。個人のGoogleアカウントを使用すると、予期しないデータ同期やセキュリティリスクが発生する可能性があります。' : 'Fleet devices will be automatically provisioned and completely locked down. Using a personal Google account may result in unexpected data synchronization or security risks.'}
              </p>
            </div>
          </div>
        );
'''
content = content.replace('switch (currentStep) {\n', f'switch (currentStep) {{\n{case0}')

# change handleNext
content = content.replace('Math.min(prev + 1, 5)', 'Math.min(prev + 1, 6)')

# change the download step to mention webusb (step 4 which is now step 5)
content = re.sub(r'\{locale === \'ja\' \? \'USBをGTSに挿入し、以下のスクリプトをadbで実行してください。\' : \'Insert the USB into the GTS and execute the following script via adb:\'\}', 
                 r"{locale === 'ja' ? 'USBをGTSに挿入し、以下のスクリプトをadbで実行してください（WebUSB経由の直接実行はネイティブデーモンが必要です）。' : 'Insert the USB into the GTS and execute the following script via adb (direct execution via WebUSB requires a native daemon):'}", 
                 content)

with open('src/components/ProvisioningLab.tsx', 'w') as f:
    f.write(content)
