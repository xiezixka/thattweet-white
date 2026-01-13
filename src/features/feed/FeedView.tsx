import React from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { TweetCard } from '../../shared/components/TweetCard';
import { Loader2, Search, Filter } from 'lucide-react';

export const FeedView: React.FC = () => {
    const { tweets, loading } = useTweets();
    const { t } = useTranslation();

    return (
        <div className="p-8 max-w-(--breakpoint-2xl) mx-auto">
            {/* Header with Search */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                <div>
                    <h1 className="text-4xl font-black bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
                        {t('feed_title')}
                    </h1>
                    <p className="text-zinc-500 mt-2 font-medium">
                        {t('feed_stat_prefix')} <span className="text-brand">{tweets.length}</span> {t('feed_stat_suffix')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-brand transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder={t('feed_search_placeholder')}
                            className="w-64 lg:w-80 h-12 pl-12 pr-4 bg-zinc-900/50 border border-white/5 rounded-2xl focus:outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand/10 transition-all"
                        />
                    </div>
                    <button className="h-12 px-4 bg-zinc-900/50 border border-white/5 rounded-2xl hover:bg-white/5 transition-colors text-zinc-400">
                        <Filter size={20} />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            {loading ? (
                <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-brand" size={40} />
                    <p className="text-zinc-500 animate-pulse">Loading Data...</p>
                </div>
            ) : tweets.length === 0 ? (
                <div className="h-[50vh] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mb-6 border border-white/5">
                        <Search className="text-zinc-700" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-300">No Intelligence Found</h3>
                    <p className="text-zinc-500 mt-2 max-w-xs">Start browsing X.com to capture valuable intelligence automatically.</p>
                </div>
            ) : (
                <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
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
            )}
        </div>
    );
};
