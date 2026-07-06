import React, { useEffect, useState } from 'react';
import { Bird, ArrowRight, Download, History, Loader2 } from 'lucide-react';
import { db } from '../../core/storage/db';
import { liveQuery } from 'dexie';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { TweetRepository } from '../../core/storage/TweetRepository';

export default function Popup() {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<{ id: string, text: string, author: string }[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      const data: any = await TweetRepository.exportAllData();

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const storageData = await new Promise<Record<string, any>>((resolve) => {
          chrome.storage.local.get(null, (res) => resolve(res || {}));
        });
        if (storageData.aiSettings) {
          data.settings = storageData.aiSettings;
        }
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `ThatTweet-Backup-${new Date().toISOString().slice(0, 10)}.json`;

      if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
        chrome.downloads.download({ url, filename, saveAs: true });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    // 实时监听总数
    const countSub = liveQuery(() => db.tweets.count()).subscribe(setCount);

    // 实时监听最近 3 条
    const recentSub = liveQuery(async () => {
      const tweets = await db.tweets.orderBy('savedAt').reverse().limit(3).toArray();
      return Promise.all(tweets.map(async t => {
        const user = await db.users.get(t.authorId);
        return {
          id: t.id,
          text: (t.text || "").slice(0, 40) + (t.text && t.text.length > 40 ? '...' : ''),
          author: user?.handle || user?.name || 'Unknown'
        };
      }));
    }).subscribe(setRecent);

    return () => {
      countSub.unsubscribe();
      recentSub.unsubscribe();
    };
  }, []);

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-5 font-sans flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg">
          <img src="/icon.png" alt="Logo" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight text-white">{t('extName')}</h1>
          <p className="text-[10px] text-zinc-500">{t('popup_tagline')}</p>
        </div>
      </div>

      {/* Stats Card */}
      <div className="bg-zinc-900 border border-white/5 rounded-2xl p-5 mb-6 relative overflow-hidden group">
        <div className="relative z-10">
          <p className="text-xs text-zinc-500 mb-1">{t('popup_captured')}</p>
          <div className="text-4xl font-black text-white flex items-baseline gap-1">
            {count} <span className="text-xs font-normal text-zinc-600">{t('popup_unit')}</span>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="absolute right-5 top-5 z-20 p-2 rounded-lg bg-zinc-800 text-zinc-500 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Download size={18} />
          )}
        </button>
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-brand/5 rounded-full blur-2xl group-hover:bg-brand/10 transition-colors" />
      </div>

      {/* Recent Activity */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <History size={12} /> {t('popup_recent')}
          </span>
          {count > 3 && <span className="text-[10px] text-zinc-600">+{count - 3}</span>}
        </div>

        <div className="space-y-2">
          {recent.map(item => (
            <div key={item.id} className="p-3 bg-zinc-900/50 border border-white/5 rounded-xl hover:bg-zinc-900 transition-colors">
              <div className="text-[10px] font-bold text-brand mb-1">@{item.author}</div>
              <div className="text-xs text-zinc-400 line-clamp-1">{item.text}</div>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="py-4 text-center text-xs text-zinc-600 italic">
              {t('popup_no_data')}
            </div>
          )}
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={openOptions}
        className="w-full h-12 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all active:scale-95 shadow-xl shadow-white/5 mt-auto"
      >
        {t('popup_open_dashboard')} <ArrowRight size={18} />
      </button>
    </div>
  );
}
