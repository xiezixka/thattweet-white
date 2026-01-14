import React from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { TweetCard } from '../../shared/components/TweetCard';
import { Loader2, Search, Filter } from 'lucide-react';
import { cn } from '../../shared/utils/cn';

const FilterItem: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={cn(
            "w-full text-left px-4 py-2 text-sm transition-colors",
            active ? "bg-brand/20 text-brand font-bold" : "text-zinc-400 hover:bg-white/5 hover:text-white"
        )}
    >
        {children}
    </button>
);

export const FeedView: React.FC = () => {
    const { tweets, loading } = useTweets();
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [filterType, setFilterType] = React.useState<'all' | 'bookmarked' | 'media' | 'recent'>('all');
    const [isFilterOpen, setIsFilterOpen] = React.useState(false);

    const filteredTweets = React.useMemo(() => {
        let result = tweets;

        // Apply Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.text.toLowerCase().includes(q) ||
                (t.author?.name || '').toLowerCase().includes(q) ||
                (t.author?.handle || '').toLowerCase().includes(q)
            );
        }

        // Apply Filter
        if (filterType === 'bookmarked') {
            result = result.filter(t => t.isBookmarked);
        } else if (filterType === 'media') {
            result = result.filter(t => (t.media && t.media.length > 0));
        } else if (filterType === 'recent') {
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            result = result.filter(t => t.savedAt > oneDayAgo);
        }

        return result;
    }, [tweets, searchQuery, filterType]);

    return (
        <div className="p-4 lg:p-8 w-full min-h-screen flex flex-col">
            {/* Header Area */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 px-2 leading-none">
                <div>
                    <h1 className="text-3xl font-black bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent italic tracking-tight">
                        {t('feed_title')}
                    </h1>
                    <p className="text-[13px] text-zinc-500 font-medium mt-1">
                        {t('feed_stat_prefix')} <span className="text-brand/80 font-bold">{filteredTweets.length}</span> {t('feed_stat_suffix')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-brand transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder={t('feed_search_placeholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-64 lg:w-96 h-11 pl-11 pr-4 bg-zinc-900/40 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-brand/30 transition-all placeholder:text-zinc-700 font-medium"
                        />
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={cn(
                                "h-11 px-4 bg-zinc-900/40 border border-white/5 rounded-2xl hover:bg-white/5 transition-all text-zinc-500 flex items-center gap-2",
                                filterType !== 'all' && "border-brand/40 text-brand bg-brand/5"
                            )}
                        >
                            <Filter size={18} />
                            {filterType !== 'all' && <span className="text-xs font-bold uppercase">{filterType}</span>}
                        </button>

                        {isFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsFilterOpen(false)} />
                                <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-white/5 rounded-2xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-200">
                                    <FilterItem active={filterType === 'all'} onClick={() => { setFilterType('all'); setIsFilterOpen(false); }}>{t('filter_all') || '全部'}</FilterItem>
                                    <FilterItem active={filterType === 'bookmarked'} onClick={() => { setFilterType('bookmarked'); setIsFilterOpen(false); }}>{t('filter_bookmarked') || '精选收藏'}</FilterItem>
                                    <FilterItem active={filterType === 'media'} onClick={() => { setFilterType('media'); setIsFilterOpen(false); }}>{t('filter_has_media') || '包含媒体'}</FilterItem>
                                    <FilterItem active={filterType === 'recent'} onClick={() => { setFilterType('recent'); setIsFilterOpen(false); }}>{t('filter_recent') || '最近 24 小时'}</FilterItem>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* 🛠️ 基于旧版基因的“流体瀑布流” */}
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <Loader2 className="animate-spin text-brand/50" size={32} />
                </div>
            ) : (
                <div className="w-full px-2">
                    <div className="columns-[320px] gap-6 space-y-6">
                        {filteredTweets.map((item) => (
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
