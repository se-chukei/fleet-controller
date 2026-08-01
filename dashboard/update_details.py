import re

with open('src/components/DeviceDetail.tsx', 'r') as f:
    content = f.read()

# Pattern matches from "Failover State Overrides" up to just before "RAM Log Terminal Viewer"
pattern = r'\{\/\* Failover State Overrides \*\/\}.*?\{\/\* RAM Log Terminal Viewer \(Section 6\.3\) \*\/\}'
replacement = r'''{/* Failover State Overrides */}
      <div className={`mb-4 border rounded-xl p-4 transition-all ${controlsUnlocked ? 'bg-rose-950/20 border-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.15)]' : 'bg-slate-950/50 border-rose-900/40'}`} id="failover-control-panel">
        <div className="flex items-center justify-between mb-3">
          <h4 className={`text-xs font-mono font-bold uppercase flex items-center gap-1.5 ${controlsUnlocked ? 'text-rose-400' : 'text-rose-700'}`}>
            <AlertTriangle className={`w-3.5 h-3.5 ${controlsUnlocked ? 'animate-pulse' : ''}`} />
            {locale === 'ja' ? '自動フェイルオーバー制御' : 'Core Failover Controls'}
          </h4>
          <button 
            onClick={() => setControlsUnlocked(!controlsUnlocked)}
            className={`px-2 py-1 text-[9px] font-mono font-bold rounded border uppercase transition-all ${controlsUnlocked ? 'bg-rose-600 text-white border-rose-500' : 'bg-rose-950/30 text-rose-500 border-rose-900/50 hover:bg-rose-900/40'}`}
          >
            {controlsUnlocked ? 'Lock Controls' : 'Unlock Controls'}
          </button>
        </div>
        
        {/* State Toggle Buttons */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {controlsUnlocked ? (
            <>
              <button
                onClick={() => changeOperationalState('STREAM')}
                className={`py-2 rounded text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                  node.appState === 'STREAM'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_10px_rgba(225,29,72,0.4)]'
                    : 'bg-slate-950 border-rose-900/50 hover:bg-rose-950/40 text-rose-400'
                }`}
              >
                FORCE STREAM
              </button>
              <button
                onClick={() => changeOperationalState('STANDBY')}
                className={`py-2 rounded text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                  node.appState === 'STANDBY'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-[0_0_10px_rgba(225,29,72,0.4)]'
                    : 'bg-slate-950 border-rose-900/50 hover:bg-rose-950/40 text-rose-400'
                }`}
              >
                FORCE STANDBY
              </button>
            </>
          ) : (
             <div className="col-span-2 py-2 text-center border border-dashed border-rose-900/30 rounded text-[9px] font-mono text-rose-800 uppercase">
                Controls Locked
             </div>
          )}
        </div>

        {/* RTMP URI configuration */}
        <div className={`flex flex-col gap-2 transition-all ${controlsUnlocked ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <label className="text-[9px] font-mono text-slate-500 uppercase">{locale === 'ja' ? '対象配信フィード (RTMP)' : 'Target Broadcast Feed (RTMP)'}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={streamInput}
              onChange={(e) => setStreamInput(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-rose-500/50"
            />
            <button 
              onClick={updateTargetStream}
              className="px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-mono rounded font-bold transition-all cursor-pointer"
            >
              {locale === 'ja' ? '適用' : 'Apply'}
            </button>
          </div>
          <span className="text-[9px] font-mono text-slate-500 block leading-relaxed italic">
            {locale === 'ja' ? '現在再生中:' : 'Currently Playing:'} {node.streamUri}
          </span>
        </div>
      </div>

      {/* RAM Log Terminal Viewer (Section 6.3) */}'''

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
with open('src/components/DeviceDetail.tsx', 'w') as f:
    f.write(new_content)
