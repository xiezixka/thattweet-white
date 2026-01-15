import React from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { TweetCard } from '../../shared/components/TweetCard';
import { Loader2, Search, Filter, HelpCircle, X } from 'lucide-react';
import { cn } from '../../shared/utils/cn';
import { parseSearchQuery, filterTweetsByQuery, SEARCH_SYNTAX_HELP } from '../../shared/utils/searchParser';

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
    const [showSyntaxHelp, setShowSyntaxHelp] = React.useState(false);

    const filteredTweets = React.useMemo(() => {
        let result = tweets;

        // 使用高级搜索解析器 (已覆盖了旧的过滤逻辑)
        if (searchQuery.trim()) {
            const parsed = parseSearchQuery(searchQuery);
            result = filterTweetsByQuery(result, parsed);
        }

        return result;
    }, [tweets, searchQuery]);

    // 检测是否使用了高级语法
    const hasAdvancedSyntax = /\w+:/.test(searchQuery);

    return (
        <div className="p-4 lg:p-8 w-full min-h-screen flex flex-col">
            {/* 核心 Header: 左右 Title，中间 Search */}
            <header className="relative w-full flex items-center justify-between mb-12 px-2">
                {/* Left: Title Area (fixed width to prevent shifting) */}
                <div className="w-1/4 shrink-0">
                    <h1 className="text-3xl font-black bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent italic tracking-tight">
                        {t('feed_title')}
                    </h1>
                    <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mt-1 opacity-60">
                        {filteredTweets.length} {t('feed_stat_suffix')}
                    </p>
                </div>

                {/* Center: Search Area (Absolute or Centered Flex) */}
                <div className="flex-1 flex justify-center px-4">
                    <div className="relative w-full max-w-xl group">
                        <div className={cn(
                            "absolute inset-0 bg-brand/20 blur-2xl rounded-full transition-opacity duration-500",
                            hasAdvancedSyntax ? "opacity-20" : "opacity-0"
                        )} />

                        <div className="relative flex items-center">
                            <Search className={cn(
                                "absolute left-4 text-zinc-600 transition-colors duration-300",
                                hasAdvancedSyntax ? "text-brand" : "group-focus-within:text-brand"
                            )} size={18} />

                            <input
                                type="text"
                                placeholder={t('feed_search_placeholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={cn(
                                    "w-full h-12 pl-12 pr-12 bg-zinc-900/60 backdrop-blur-xl border rounded-[20px] text-[15px] font-medium transition-all duration-300 shadow-2xl",
                                    hasAdvancedSyntax
                                        ? "border-brand/40 ring-4 ring-brand/5 text-white"
                                        : "border-white/5 focus:border-brand/30 focus:bg-zinc-900/80 text-zinc-200"
                                )}
                            />

                            {/* Actions Group (Right) */}
                            <div className="absolute right-4 flex items-center gap-2">
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="p-1 text-zinc-500 hover:text-white transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                )}

                                <button
                                    onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
                                    className={cn(
                                        "p-1.5 rounded-lg transition-all",
                                        showSyntaxHelp ? "bg-brand/10 text-brand" : "text-zinc-600 hover:text-zinc-400 hover:bg-white/5"
                                    )}
                                >
                                    <HelpCircle size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Syntax Menu Dropdown */}
                        {showSyntaxHelp && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowSyntaxHelp(false)} />
                                <div className="absolute top-full left-0 right-0 mt-3 bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 overflow-hidden p-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-[10px] font-black text-brand uppercase tracking-[0.2em]">智能搜索语法</h4>
                                        <span className="text-[10px] text-zinc-600">按 ESC 退出</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SEARCH_SYNTAX_HELP.map((item, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setSearchQuery(prev => (prev.trim() + ' ' + item.syntax).trim());
                                                    setShowSyntaxHelp(false);
                                                }}
                                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group"
                                            >
                                                <code className="px-2 py-0.5 bg-zinc-800 text-brand text-xs font-mono rounded border border-white/5 group-hover:border-brand/30">
                                                    {item.syntax}
                                                </code>
                                                <span className="text-[11px] text-zinc-500 font-medium">{item.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
                                        <button
                                            onClick={() => { setSearchQuery('is:bookmarked'); setShowSyntaxHelp(false); }}
                                            className="px-3 py-1.5 rounded-full bg-amber-500/5 border border-amber-500/10 text-amber-500 text-[10px] font-bold hover:bg-amber-500/10 transition-colors"
                                        >
                                            ⭐ 已收藏
                                        </button>
                                        <button
                                            onClick={() => { setSearchQuery('has:media'); setShowSyntaxHelp(false); }}
                                            className="px-3 py-1.5 rounded-full bg-blue-500/5 border border-blue-500/10 text-blue-500 text-[10px] font-bold hover:bg-blue-500/10 transition-colors"
                                        >
                                            🖼️ 包含媒体
                                        </button>
                                        <button
                                            onClick={() => { setSearchQuery('since:today'); setShowSyntaxHelp(false); }}
                                            className="px-3 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/10 text-emerald-500 text-[10px] font-bold hover:bg-emerald-500/10 transition-colors"
                                        >
                                            🕒 今日新增
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Functional/Empty Space (To balance layout) */}
                <div className="w-1/4 flex justify-end">
                    {/* 这个区域可以放切换视图模式的按钮或者其他操作 */}
                </div>
            </header>

            {/* Masonry Grid */}
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
                                    onAuthorClick={(author) => setSearchQuery(`from:${author.handle || author.name}`)}
                                    onTagClick={(tag) => setSearchQuery(`tag:${tag}`)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
