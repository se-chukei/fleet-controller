import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Save, Upload, X } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface LocalizationPanelProps {
  onClose: () => void;
}

export default function LocalizationPanel({ onClose }: LocalizationPanelProps) {
  const { locale, catalog, saveTranslation, importTranslations } = useTranslation();
  const [selectedKey, setSelectedKey] = useState('');
  const [english, setEnglish] = useState('');
  const [japanese, setJapanese] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const keys = useMemo(
    () => Object.keys(catalog).filter(key => key.toLowerCase().includes(filter.toLowerCase())).sort(),
    [catalog, filter]
  );

  useEffect(() => {
    if (!selectedKey && keys.length > 0) setSelectedKey(keys[0]);
    if (selectedKey && !catalog[selectedKey]) setSelectedKey(keys[0] || '');
  }, [catalog, keys, selectedKey]);

  useEffect(() => {
    const entry = selectedKey ? catalog[selectedKey] : undefined;
    setEnglish(entry?.en || '');
    setJapanese(entry?.ja || '');
  }, [catalog, selectedKey]);

  const save = async () => {
    if (!selectedKey) return;
    setSaving(true);
    try {
      await saveTranslation(selectedKey, 'en', english);
      await saveTranslation(selectedKey, 'ja', japanese);
    } finally {
      setSaving(false);
    }
  };

  const downloadCsv = async () => {
    const response = await fetch('/api/localization.csv');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'localization.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importTranslations(await file.text());
    event.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <section className="w-full max-w-5xl max-h-[90vh] bg-slate-950 border border-indigo-500/40 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-mono font-bold tracking-widest text-indigo-300 uppercase">
              {locale === 'ja' ? 'ローカライズ設定' : 'Localization Configuration'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">
              {locale === 'ja' ? 'CSVカタログを編集してUI文言を管理します。' : 'Manage UI text through the shared CSV catalog.'}
            </p>
          </div>
          <button onClick={onClose} title={locale === 'ja' ? '閉じる' : 'Close'} className="p-2 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 grid md:grid-cols-[260px_1fr]">
          <aside className="border-b md:border-b-0 md:border-r border-slate-800 p-3 min-h-0 flex flex-col">
            <input
              value={filter}
              onChange={event => setFilter(event.target.value)}
              placeholder={locale === 'ja' ? 'キーを検索' : 'Filter keys'}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
            />
            <div className="mt-2 overflow-y-auto space-y-1">
              {keys.map(key => (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono truncate ${selectedKey === key ? 'bg-indigo-600/30 text-indigo-200' : 'text-slate-400 hover:bg-slate-900'}`}
                >
                  {key}
                </button>
              ))}
            </div>
          </aside>

          <div className="p-5 overflow-y-auto">
            {selectedKey ? (
              <div className="space-y-4">
                <div className="text-xs font-mono text-slate-500">KEY: <span className="text-indigo-300">{selectedKey}</span></div>
                <label className="block text-xs text-slate-400">
                  English
                  <textarea value={english} onChange={event => setEnglish(event.target.value)} rows={4} className="mt-1 w-full bg-slate-900 border border-slate-800 rounded p-3 text-sm text-slate-100 outline-none focus:border-indigo-500" />
                </label>
                <label className="block text-xs text-slate-400">
                  日本語
                  <textarea value={japanese} onChange={event => setJapanese(event.target.value)} rows={4} className="mt-1 w-full bg-slate-900 border border-slate-800 rounded p-3 text-sm text-slate-100 outline-none focus:border-indigo-500" />
                </label>
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-xs font-bold text-white">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save translation'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No translation keys available.</p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-700 rounded text-xs text-slate-300 hover:bg-slate-900">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button onClick={downloadCsv} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-700 rounded text-xs text-slate-300 hover:bg-slate-900">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </footer>
      </section>
    </div>
  );
}
