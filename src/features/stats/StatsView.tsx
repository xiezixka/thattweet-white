import React, { useMemo, useState, useEffect } from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { TweetCard } from '../../shared/components/TweetCard';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart3, TrendingUp, Users, Tag, Calendar, Star,
    Image, MessageCircle, Filter, ChevronDown, X, Sparkles
} from 'lucide-react';
import { cn } from '../../shared/utils/cn';

interface CategoryStat {
    name: string;
    count: number;
    percentage: number;
}

interface AuthorStat {
    handle: string;
    name: string;
    avatar?: string;
    count: number;
}

interface ScoreRange {
    label: string;
    min: number;
    max: number;
    count: number;
    color: string;
}

interface TimeRange {
    label: string;
    key: string;
    since: number;
}

export const StatsView: React.FC = () => {
    const { tweets } = useTweets();
    const { t } = useTranslation();

    // 分面过滤状态
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
    const [selectedScoreRange, setSelectedScoreRange] = useState<string | null>(null);
    const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // 视觉过渡缓冲区状态
    const [isTransitioning, setIsTransitioning] = useState(false);

    // 监听过滤器变化，触发视觉缓冲
    useEffect(() => {
        setIsTransitioning(true);
        const timer = setTimeout(() => setIsTransitioning(false), 250);
        return () => clearTimeout(timer);
    }, [selectedCategories, selectedAuthors, selectedScoreRange, selectedTimeRange, selectedTags]);

    // 时间范围定义
    const timeRanges: TimeRange[] = useMemo(() => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;
        return [
            { label: t('stats_time_all'), key: 'all', since: 0 },
            { label: t('stats_time_today'), key: 'today', since: now - day },
            { label: t('stats_time_week'), key: 'week', since: now - 7 * day },
            { label: t('stats_time_month'), key: 'month', since: now - 30 * day },
        ];
    }, [t]);

    // 分数区间定义
    const scoreRanges: ScoreRange[] = useMemo(() => {
        const ranges = [
            { label: t('stats_score_high'), min: 80, max: 100, color: 'rose' },
            { label: t('stats_score_featured'), min: 60, max: 79, color: 'amber' },
            { label: t('stats_score_normal'), min: 40, max: 59, color: 'emerald' },
            { label: t('stats_score_low'), min: 0, max: 39, color: 'zinc' },
        ];
        return ranges.map(r => ({
            ...r,
            count: tweets.filter(t => (t.aiScore ?? 0) >= r.min && (t.aiScore ?? 0) <= r.max).length
        }));
    }, [tweets, t]);


    // 分类统计
    const categoryStats: CategoryStat[] = useMemo(() => {
        const map = new Map<string, number>();
        tweets.forEach(t => {
            const cat = t.aiCategory || '未分类';
            map.set(cat, (map.get(cat) || 0) + 1);
        });
        const total = tweets.length || 1;
        return Array.from(map.entries())
            .map(([name, count]) => ({ name, count, percentage: (count / total) * 100 }))
            .sort((a, b) => b.count - a.count);
    }, [tweets]);

    // 作者统计 (Top 10)
    const authorStats: AuthorStat[] = useMemo(() => {
        const map = new Map<string, AuthorStat>();
        tweets.forEach(t => {
            const handle = t.author?.handle || 'unknown';
            if (!map.has(handle)) {
                map.set(handle, {
                    handle,
                    name: t.author?.name || handle,
                    avatar: t.author?.avatar,
                    count: 0
                });
            }
            map.get(handle)!.count++;
        });
        return Array.from(map.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, [tweets]);

    // 标签统计 (Top 20)
    const tagStats = useMemo(() => {
        const map = new Map<string, number>();
        tweets.forEach(t => {
            (t.aiTags || []).forEach(tag => {
                map.set(tag, (map.get(tag) || 0) + 1);
            });
        });
        return Array.from(map.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);
    }, [tweets]);

    // 应用分面过滤
    const filteredTweets = useMemo(() => {
        let result = tweets;

        // 时间过滤
        if (selectedTimeRange !== 'all') {
            const range = timeRanges.find(r => r.key === selectedTimeRange);
            if (range) {
                result = result.filter(t => t.savedAt >= range.since);
            }
        }

        // 分类过滤
        if (selectedCategories.length > 0) {
            result = result.filter(t => selectedCategories.includes(t.aiCategory || '未分类'));
        }

        // 作者过滤
        if (selectedAuthors.length > 0) {
            result = result.filter(t => selectedAuthors.includes(t.author?.handle || 'unknown'));
        }

        // 分数过滤
        if (selectedScoreRange) {
            const range = scoreRanges.find(r => r.label === selectedScoreRange);
            if (range) {
                result = result.filter(t => (t.aiScore ?? 0) >= range.min && (t.aiScore ?? 0) <= range.max);
            }
        }

        // 标签过滤
        if (selectedTags.length > 0) {
            result = result.filter(t =>
                selectedTags.some(tag => (t.aiTags || []).includes(tag))
            );
        }

        return result;
    }, [tweets, selectedTimeRange, selectedCategories, selectedAuthors, selectedScoreRange, selectedTags, timeRanges, scoreRanges]);

    // 清除所有过滤器
    const clearAllFilters = () => {
        setSelectedCategories([]);
        setSelectedAuthors([]);
        setSelectedScoreRange(null);
        setSelectedTimeRange('all');
        setSelectedTags([]);
    };

    const hasActiveFilters = selectedCategories.length > 0 || selectedAuthors.length > 0 ||
        selectedScoreRange !== null || selectedTimeRange !== 'all' || selectedTags.length > 0;

    // 切换分类选择
    const toggleCategory = (cat: string) => {
        setSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    // 切换作者选择
    const toggleAuthor = (handle: string) => {
        setSelectedAuthors(prev =>
            prev.includes(handle) ? prev.filter(a => a !== handle) : [...prev, handle]
        );
    };

    // 切换标签选择
    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    return (

        <div className="p-4 lg:p-8 w-full min-h-screen">
            <div className="flex gap-6">
                {/* Left: Faceted Filters Panel */}
                <aside className="w-72 shrink-0 space-y-6">
                    {/* Filter Status & Analytics Summary */}
                    <div className="glass-card rounded-2xl p-4 border border-white/10 bg-white/5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('stats_active_filters')}</span>
                            {hasActiveFilters && (
                                <button
                                    onClick={clearAllFilters}
                                    className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                                >
                                    <X size={10} /> {t('stats_clear_all')}
                                </button>
                            )}
                        </div>
                        <p className="text-sm text-zinc-300">
                            {t('stats_showing_count')} <span className="font-bold text-brand">{filteredTweets.length}</span> / {tweets.length} {t('stats_showing_suffix')}
                        </p>
                    </div>

                    {/* Time Range */}
                    <div className="glass-card rounded-2xl p-4 border border-white/5">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Calendar size={14} /> {t('stats_time_range')}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {timeRanges.map(range => (
                                <button
                                    key={range.key}
                                    onClick={() => setSelectedTimeRange(range.key)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                        selectedTimeRange === range.key
                                            ? "bg-brand text-white"
                                            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Score Ranges */}
                    <div className="glass-card rounded-2xl p-4 border border-white/5">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Star size={14} /> {t('stats_quality_dist')}
                        </h3>
                        <div className="space-y-2">
                            {scoreRanges.map(range => (
                                <button
                                    key={range.label}
                                    onClick={() => setSelectedScoreRange(prev => prev === range.label ? null : range.label)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-2 rounded-lg transition-all",
                                        selectedScoreRange === range.label
                                            ? `bg-${range.color}-500/20 border border-${range.color}-500/30`
                                            : "hover:bg-white/5"
                                    )}
                                >
                                    <span className={cn(
                                        "text-sm font-medium",
                                        selectedScoreRange === range.label ? `text-${range.color}-400` : "text-zinc-400"
                                    )}>
                                        {range.label} ({range.min}-{range.max})
                                    </span>
                                    <span className="text-xs text-zinc-500">{range.count}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="glass-card rounded-2xl p-4 border border-white/5">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Tag size={14} /> {t('stats_categories')}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                            {categoryStats.map(cat => (
                                <button
                                    key={cat.name}
                                    onClick={() => toggleCategory(cat.name)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                                        selectedCategories.includes(cat.name)
                                            ? "bg-brand text-white"
                                            : "bg-white/5 text-zinc-400 hover:bg-white/10"
                                    )}
                                >
                                    {cat.name} <span className="opacity-60">({cat.count})</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Top Authors */}
                    <div className="glass-card rounded-2xl p-4 border border-white/5">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Users size={14} /> {t('stats_top_authors')}
                        </h3>
                        <div className="space-y-1.5">
                            {authorStats.slice(0, 5).map((author, index) => {
                                // 前三名的奖牌颜色
                                const rankColors = [
                                    'bg-amber-500 text-amber-900', // 🥇 金
                                    'bg-zinc-300 text-zinc-700',   // 🥈 银
                                    'bg-amber-700 text-amber-100'  // 🥉 铜
                                ];
                                const isTopThree = index < 3;

                                return (
                                    <button
                                        key={author.handle}
                                        onClick={() => toggleAuthor(author.handle)}
                                        className={cn(
                                            "w-full flex items-center gap-2 p-2 rounded-lg transition-all text-left",
                                            selectedAuthors.includes(author.handle)
                                                ? "bg-brand/20 border border-brand/30"
                                                : "hover:bg-white/5"
                                        )}
                                    >
                                        {/* 排名徽章 */}
                                        <div className={cn(
                                            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                                            isTopThree ? rankColors[index] : "bg-zinc-700 text-zinc-400"
                                        )}>
                                            {index + 1}
                                        </div>

                                        <div className={cn(
                                            "w-6 h-6 rounded-full bg-zinc-700 overflow-hidden shrink-0",
                                            isTopThree && index === 0 && "ring-2 ring-amber-500/50",
                                            isTopThree && index === 1 && "ring-2 ring-zinc-300/50",
                                            isTopThree && index === 2 && "ring-2 ring-amber-700/50"
                                        )}>
                                            {author.avatar && (
                                                <img src={author.avatar} alt="" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn(
                                                "text-xs font-medium truncate",
                                                index === 0 ? "text-amber-400" :
                                                    index === 1 ? "text-zinc-200" :
                                                        index === 2 ? "text-amber-600" :
                                                            "text-zinc-300"
                                            )}>{author.name}</p>
                                            <p className="text-[10px] text-zinc-500">@{author.handle}</p>
                                        </div>
                                        <span className={cn(
                                            "text-xs font-bold",
                                            index === 0 ? "text-amber-400" :
                                                index === 1 ? "text-zinc-300" :
                                                    index === 2 ? "text-amber-600" :
                                                        "text-zinc-500"
                                        )}>{author.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Hot Tags */}
                    <div className="glass-card rounded-2xl p-4 border border-white/5">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Sparkles size={14} /> {t('stats_hot_tags')}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                            {tagStats.slice(0, 15).map(({ tag, count }) => (
                                <button
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    className={cn(
                                        "px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all",
                                        selectedTags.includes(tag)
                                            ? "bg-brand text-white"
                                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                    )}
                                >
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Right: Results Grid */}
                <main className="flex-1">
                    {/* Summary Stats Bar */}
                    <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="glass-card rounded-xl p-4 border border-white/5">
                            <p className="text-2xl font-black text-white">{tweets.length}</p>
                            <p className="text-xs text-zinc-500">{t('stats_total_tweets')}</p>
                        </div>
                        <div className="glass-card rounded-xl p-4 border border-white/5">
                            <p className="text-2xl font-black text-brand">{tweets.filter(t => (t.aiScore ?? 0) >= 80).length}</p>
                            <p className="text-xs text-zinc-500">{t('stats_high_quality')}</p>
                        </div>
                        <div className="glass-card rounded-xl p-4 border border-white/5">
                            <p className="text-2xl font-black text-amber-400">{tweets.filter(t => t.isBookmarked).length}</p>
                            <p className="text-xs text-zinc-500">{t('stats_bookmarked')}</p>
                        </div>
                        <div className="glass-card rounded-xl p-4 border border-white/5">
                            <p className="text-2xl font-black text-emerald-400">{authorStats.length}</p>
                            <p className="text-xs text-zinc-500">{t('stats_authors')}</p>
                        </div>
                    </div>

                    {/* Filtered Results with Transitions */}
                    <div className={cn(
                        "transition-all duration-300 ease-out",
                        isTransitioning ? "opacity-50 blur-md scale-[0.99]" : "opacity-100 blur-0 scale-100"
                    )}>
                        <div className="columns-[320px] gap-4">
                            <AnimatePresence mode="popLayout">
                                {filteredTweets.slice(0, 50).map((item) => (
                                    <motion.div
                                        layout
                                        key={item.id}
                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 100,
                                            damping: 15,
                                            mass: 1
                                        }}
                                        className="break-inside-avoid mb-4"
                                    >
                                        <TweetCard
                                            tweet={item}
                                            author={item.author}
                                            mode="masonry"
                                            onTagClick={(tag) => toggleTag(tag)}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>

                    {filteredTweets.length > 50 && (
                        <p className="text-center text-zinc-500 text-sm mt-6">
                            {t('stats_showing_limit').replace('{{count}}', filteredTweets.length.toString())}
                        </p>
                    )}
                </main>
            </div>
        </div>
    );
};
