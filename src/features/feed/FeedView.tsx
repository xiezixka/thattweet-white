import React from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { TweetCard } from '../../shared/components/TweetCard';
import { Loader2, Search, Filter } from 'lucide-react';

export const FeedView: React.FC = () => {
    const { tweets, loading } = useTweets();
    const { t } = useTranslation();

    return (
        <div className="p-4 lg:p-8 w-full min-h-screen flex flex-col">
            {/* Header Area */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 px-2">
                <div>
                    <h1 className="text-3xl font-black bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent italic tracking-tight">
                        {t('feed_title')}
                    </h1>
                    <p className="text-[13px] text-zinc-500 font-medium mt-1">
                        {t('feed_stat_prefix')} <span className="text-brand/80 font-bold">{tweets.length}</span> {t('feed_stat_suffix')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-brand transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder={t('feed_search_placeholder')}
                            className="w-64 lg:w-96 h-11 pl-11 pr-4 bg-zinc-900/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-brand/30 transition-all placeholder:text-zinc-700"
                        />
                    </div>
                    <button className="h-11 px-4 bg-zinc-900/40 border border-white/5 rounded-2xl hover:bg-white/5 transition-colors text-zinc-500">
                        <Filter size={18} />
                    </button>
                </div>
            </header>

            {/* 🛠️ 基于旧版基因的“流体瀑布流” */}
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <Loader2 className="animate-spin text-brand/50" size={32} />
                </div>
            ) : (
                <div className="w-full px-2">
                    {/* 
                        使用 columns-[320px] 实现平滑自适应。
                        这是旧版原生 CSS Columns 的现代升级版：
                        1. 它保留了旧版完美的垂直填充（不留行间距）。
                        2. 不需要繁琐的媒体查询断点，列数随宽度自动增减。
                        3. 保持 16px (gap-4) 的呼吸感空隙。
                    */}
                    <div className="columns-[320px] gap-6 space-y-6">
                        {tweets.map((item) => (
                            <div key={item.id} className="break-inside-avoid">
                                <TweetCard
                                    tweet={item}
                                    author={item.author}
                                    mode="masonry"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
