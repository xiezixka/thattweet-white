import React, { useMemo, useState } from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { TweetCard } from '../../shared/components/TweetCard';
import { normalizeTwitterImage } from '../../shared/utils/image';
import { TweetWithUser } from '../../shared/types/tweet';
import {
    TrendingUp, Search, Zap,
    ChevronRight, Sparkles, Activity,
    BarChart3, Medal, Crown, Trophy,
    ScanFace, RefreshCw
} from 'lucide-react';
import { useSettingsStore } from '../../shared/store/useSettingsStore';
import { TweetAnalyzer } from '../../core/ai/analyzer';
import { TweetRepository } from '../../core/storage/TweetRepository';
import { UserCache } from '../../shared/types/tweet';
import { cn } from '../../shared/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface AuthorStats {
    handle: string;
    name: string;
    avatar: string | undefined;
    tweets: TweetWithUser[];
    totalLikes: number;
    totalViews: number;
    avgScore: number;
    maxHvi: number;
    totalHvi: number;
    lastActive: number;
    aiProfile?: UserCache['aiProfile'];
}

interface ViralMetrics {
    mediaRate: number;
    textRate: number;
    linkRate: number;
    avgLength: number;
    primeCategory: string;
}

// --- HVI Algorithm ---
const calculateHVI = (tweet: TweetWithUser) => {
    const likes = tweet.favoriteCount || 0;
    const rts = tweet.retweetCount || 0;
    const views = tweet.viewCount || 100;
    const score = tweet.aiScore || 50;

    // 效率分: 每1000次观看带来的互动
    const efficiency = ((likes * 1 + rts * 2) / Math.max(views, 1)) * 1000;

    // 动量分: 简单的时间衰减模型，越新越活跃
    // 这里简化为绝对互动量，因为历史数据时间久远，动量意义不大，不如看绝对爆发力
    const impact = (likes + rts * 2);

    // 质量修正
    const qualityMultiplier = score / 50; // 1.0 - 2.0

    // 归一化 (Log scale to flatten huge numbers)
    const rawScore = (efficiency * 0.4 + Math.log10(impact + 1) * 20) * qualityMultiplier;

    return Math.min(Math.round(rawScore), 99);
};

// --- Components ---

// 1. 极简平滑曲线图 (SVG)
const SmoothTrendChart: React.FC<{ data: number[], color?: string }> = ({ data, color = '#10b981' }) => {
    if (data.length < 2) return null;

    const height = 60;
    const width = 200;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min;

    // 生成平滑贝塞尔曲线
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return [x, y];
    });

    const path = points.reduce((acc, [x, y], i, arr) => {
        if (i === 0) return `M ${x},${y}`;
        const [px, py] = arr[i - 1];
        const cx1 = px + (x - px) / 2;
        const cx2 = px + (x - px) / 2;
        return `${acc} C ${cx1},${py} ${cx2},${y} ${x},${y}`;
    }, "");

    return (
        <svg viewBox={`0 -4 ${width} ${height + 8}`} className="w-full h-full overflow-visible">
            <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                className="drop-shadow-lg"
            />
            {/* 渐变填充 */}
            <path
                d={`${path} L ${width},${height} L 0,${height} Z`}
                fill={color}
                fillOpacity="0.1"
            />
        </svg>
    );
};

// 2. DNA 指标条
const MetricBar: React.FC<{ label: string; value: number; icon: React.ElementType }> = ({ label, value, icon: Icon }) => (
    <div className="flex items-center gap-3 group">
        <div className="p-2 rounded-lg bg-white/5 text-zinc-400 group-hover:text-zinc-100 group-hover:bg-white/10 transition-colors">
            <Icon size={14} />
        </div>
        <div className="flex-1">
            <div className="flex justify-between items-end mb-1">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
                <span className="text-xs font-bold text-zinc-300 tabular-nums">{value}%</span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full bg-zinc-500/50 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${value}%` }}
                />
            </div>
        </div>
    </div>
);

export const AnalyticsView: React.FC = () => {
    const { tweets, loading } = useTweets();
    const { t } = useTranslation();
    const settings = useSettingsStore((s) => s.settings);
    const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [analyzing, setAnalyzing] = useState(false);

    // --- Action: 生成/更新画像 ---
    const handleGenerateProfile = async (author: AuthorStats) => {
        if (analyzing || !author) return;
        setAnalyzing(true);
        try {
            // 1. 获取 Top 10 Tweets (HVI Sorted)
            const topTweets = author.tweets.slice(0, 15);

            // 2. 调用 AI
            const profile = await TweetAnalyzer.analyzeAuthorProfile(topTweets, settings);

            // 3. 更新数据库
            const userId = author.tweets[0]?.authorId;
            if (userId) {
                await TweetRepository.updateAuthorProfile(userId, {
                    aiProfile: {
                        summary: profile.summary,
                        keywords: profile.keywords,
                        lastAnalyzedAt: Date.now(),
                        tweetCountAtAnalysis: author.tweets.length
                    }
                });
            }
        } catch (e) {
            console.error("Profile Gen Error", e);
            alert("生成失败，请检查 AI 设置或网络");
        } finally {
            setAnalyzing(false);
        }
    };

    // --- Data Processing ---
    const authors = useMemo(() => {
        const map = new Map<string, AuthorStats>();

        // 1. 聚合数据
        tweets.forEach((t: TweetWithUser) => {
            const handle = t.author?.handle || 'unknown';
            if (!map.has(handle)) {
                map.set(handle, {
                    handle,
                    name: t.author?.name || 'Unknown',
                    avatar: normalizeTwitterImage(t.author?.avatar, 'avatar'),
                    tweets: [],
                    totalLikes: 0,
                    totalViews: 0,
                    avgScore: 0,
                    maxHvi: 0,
                    totalHvi: 0,
                    lastActive: 0,
                    aiProfile: t.author?.aiProfile
                });
            }
            const stat = map.get(handle)!;
            const hvi = calculateHVI(t);

            stat.tweets.push({ ...t, hvi } as any); // 把 HVI 注入 tweet 对象
            stat.totalLikes += (t.favoriteCount || 0);
            stat.totalViews += (t.viewCount || 0);
            stat.avgScore += (t.aiScore || 0);
            stat.totalHvi += hvi;
            stat.maxHvi = Math.max(stat.maxHvi, hvi);
            stat.lastActive = Math.max(stat.lastActive, t.savedAt);
        });

        // 2. 计算平均值并排序
        return Array.from(map.values())
            .map(a => ({
                ...a,
                avgScore: Math.round(a.avgScore / a.tweets.length),
                // 对 tweets 进行内部排序 (HVI Desc)
                tweets: a.tweets.sort((t1: any, t2: any) => t2.hvi - t1.hvi)
            }))
            // 默认作者列表排序：按总影响力 (Total HVI) 降序
            .sort((a, b) => b.totalHvi - a.totalHvi);
    }, [tweets]);

    // 过滤作者
    const filteredAuthors = useMemo(() => {
        return authors.filter(a =>
            a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.handle.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [authors, searchTerm]);

    // 当前选中作者
    const current = useMemo(() => {
        return selectedHandle
            ? authors.find(a => a.handle === selectedHandle)
            : authors[0];
    }, [selectedHandle, authors]);

    // 计算 Viral DNA
    const viralMetrics = useMemo<ViralMetrics | null>(() => {
        if (!current) return null;
        const topTweets = current.tweets.slice(0, 10); // 取前10篇代表作
        if (topTweets.length === 0) return null;

        const hasMedia = topTweets.filter(t => t.media?.length > 0).length;
        const hasText = topTweets.length - hasMedia;
        const hasLink = topTweets.filter(t => t.text.includes('http')).length;
        const avgLen = topTweets.reduce((acc, t) => acc + t.text.length, 0) / topTweets.length;

        // 找出这种类
        const cats: Record<string, number> = {};
        topTweets.forEach(t => {
            const c = t.aiCategory || 'Other';
            cats[c] = (cats[c] || 0) + 1;
        });
        const primeCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];

        return {
            mediaRate: Math.round((hasMedia / topTweets.length) * 100),
            textRate: Math.round((hasText / topTweets.length) * 100),
            linkRate: Math.round((hasLink / topTweets.length) * 100),
            avgLength: Math.round(avgLen),
            primeCategory: primeCat
        };
    }, [current]);

    // 生成走势图数据 (时间序)
    const trendData = useMemo(() => {
        if (!current) return [];
        return [...current.tweets]
            .sort((a, b) => a.savedAt - b.savedAt)
            .slice(-20) // 最近20篇
            .map((t: any) => t.hvi);
    }, [current]);

    if (loading) return null;

    return (
        <div className="flex h-full w-full bg-zinc-950 font-sans selection:bg-brand/20">
            {/* === Main Content (Left) === */}
            <main className="flex-1 flex flex-col min-w-0 border-r border-white/5 overflow-hidden relative">
                {current ? (
                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        {/* Header Section */}
                        <div className="relative p-8 lg:p-12 pb-6">
                            {/* ... (Background stays same) */}

                            <div className="flex items-start justify-between relative z-10">
                                <div className="flex gap-6">
                                    <div className="relative group">
                                        {/* ... (Avatar stays same) */}
                                    </div>

                                    <div className="pt-1">
                                        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">{current.name}</h1>
                                        <div className="flex items-center gap-3 text-zinc-500 text-sm font-medium mb-4">
                                            <span>@{current.handle}</span>
                                            <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                            <span>{current.tweets.length} {t('analytics_archives')}</span>
                                        </div>

                                        {/* HVI Tags */}
                                        <div className="flex gap-2">
                                            {current.avgScore >= 80 && (
                                                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                                                    {t('analytics_high_quality')}
                                                </span>
                                            )}
                                            {current.maxHvi >= 90 && (
                                                <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 text-[10px] font-bold uppercase tracking-wider border border-rose-500/20">
                                                    {t('analytics_viral_creator')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Mini Trend Chart */}
                                <div className="hidden lg:block w-48 h-20 opacity-60">
                                    <SmoothTrendChart data={trendData} color={current.maxHvi > 80 ? '#f43f5e' : '#3b82f6'} />
                                    <p className="text-right text-[9px] font-bold text-zinc-600 uppercase mt-2 tracking-widest">{t('analytics_momentum')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-4 px-8 lg:px-12 mb-10">
                            {[
                                { label: t('analytics_viral_index'), value: current.totalHvi, icon: Zap, color: 'text-amber-400' },
                                { label: t('analytics_peak_play'), value: current.maxHvi, icon: Crown, color: 'text-rose-400' },
                                { label: t('analytics_avg_quality'), value: current.avgScore, icon: Sparkles, color: 'text-brand' },
                                { label: t('analytics_total_likes'), value: (current.totalLikes / 1000).toFixed(1) + 'K', icon: TrendingUp, color: 'text-white' },
                            ].map((s, i) => (
                                <div key={i} className="flex flex-col p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                                        <s.icon size={12} /> {s.label}
                                    </div>
                                    <div className={cn("text-2xl font-black tabular-nums tracking-tight", s.color)}>
                                        {s.value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Content & DNA Layout */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 px-8 lg:px-12 pb-12">
                            {/* Left: Masterpieces (Content) */}
                            <div className="xl:col-span-2 space-y-8">
                                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
                                        <Trophy size={14} className="text-amber-400" />
                                        {t('analytics_masterpiece')}
                                    </h3>
                                    <span className="text-[10px] font-medium text-zinc-600">{t('analytics_sorted_by_hvi')}</span>
                                </div>

                                {/* #1 MASTERPIECE */}
                                {current.tweets[0] && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="relative group rounded-3xl overflow-hidden bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10"
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-400 to-transparent opacity-50" />
                                        <div className="p-6 md:p-8">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="flex gap-2">
                                                    <span className="px-2 py-1 bg-amber-400 text-black text-[10px] font-black rounded uppercase tracking-wider">Rank #1</span>
                                                    <span className="px-2 py-1 bg-white/5 text-zinc-300 text-[10px] font-bold rounded uppercase tracking-wider border border-white/5">
                                                        {(current.tweets[0] as any).hvi} HVI
                                                    </span>
                                                </div>
                                                <div className="text-zinc-500 text-[10px] font-mono opacity-50">ID: {current.tweets[0].id.slice(-6)}</div>
                                            </div>

                                            <div className="tweet-content-preview text-lg md:text-xl text-zinc-200 font-medium leading-relaxed mb-6 line-clamp-6">
                                                {current.tweets[0].text}
                                            </div>

                                            <div className="flex items-center gap-6 text-xs font-bold text-zinc-500 uppercase tracking-wider tabular-nums">
                                                <span className="flex items-center gap-1.5"><TrendingUp size={14} /> {current.tweets[0].favoriteCount}</span>
                                                <span className="flex items-center gap-1.5"><Activity size={14} /> {current.tweets[0].retweetCount}</span>
                                                <span className="ml-auto text-emerald-500">{(current.tweets[0] as any).hvi > 90 ? t('analytics_supernova') : t('analytics_viral_hit')}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* #2 & #3 */}
                                <div className="grid grid-cols-2 gap-4">
                                    {current.tweets.slice(1, 3).map((t, i) => (
                                        <div key={t.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors flex flex-col">
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Rank #{i + 2}</span>
                                                <span className="text-sm font-black text-zinc-400">{(t as any).hvi}</span>
                                            </div>
                                            <p className="text-sm text-zinc-300 line-clamp-3 mb-4 flex-1">{t.text}</p>
                                            <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-600">
                                                <span>{t.favoriteCount} Likes</span>
                                                <span>{t.viewCount} Views</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* 4-10 List */}
                                <div className="space-y-1 pt-4">
                                    {current.tweets.slice(3, 8).map((t, i) => (
                                        <div key={t.id} className="group flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                            <span className="text-xs font-mono text-zinc-600 w-6">0{i + 4}</span>
                                            <div className="flex-1 text-xs text-zinc-400 line-clamp-1 group-hover:text-zinc-200">{t.text}</div>
                                            <div className="text-xs font-bold text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">{(t as any).hvi}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: DNA & Insights */}
                            <div className="space-y-8">
                                <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
                                    <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
                                        <Activity size={14} className="text-brand" /> {t('analytics_content_dna')}
                                    </h4>

                                    {viralMetrics && (
                                        <div className="space-y-5">
                                            <MetricBar label={t('analytics_visual_heavy')} value={viralMetrics.mediaRate} icon={Zap} />
                                            <MetricBar label={t('analytics_text_driven')} value={viralMetrics.textRate} icon={Zap} />
                                            <MetricBar label={t('analytics_link_driven')} value={viralMetrics.linkRate} icon={Zap} />

                                            <div className="pt-4 border-t border-white/5">
                                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">{t('analytics_prime_domain')}</div>
                                                <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/5 text-xs font-bold text-zinc-200">
                                                    #{viralMetrics.primeCategory}
                                                </div>
                                            </div>

                                            <div className="pt-2">
                                                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{t('analytics_avg_length')}</div>
                                                <div className="text-lg font-black text-white tabular-nums">{viralMetrics.avgLength} <span className="text-[10px] text-zinc-600 font-bold">chars</span></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="relative p-6 rounded-3xl bg-gradient-to-br from-brand/5 to-transparent border border-brand/10 overflow-hidden">
                                    <h4 className="text-xs font-bold text-brand uppercase tracking-widest mb-3 flex items-center justify-between">
                                        <span className="flex items-center gap-2"><ScanFace size={14} /> AI 深度画像</span>
                                        {/* 更新指示器 */}
                                        {current.aiProfile && (current.tweets.length - current.aiProfile.tweetCountAtAnalysis >= 25) && (
                                            <span className="flex h-2 w-2 relative">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
                                            </span>
                                        )}
                                    </h4>

                                    {current.aiProfile ? (
                                        <div className="space-y-4">
                                            {/* Keywords */}
                                            <div className="flex flex-wrap gap-2">
                                                {current.aiProfile.keywords.map(k => (
                                                    <span key={k} className="px-2 py-1 rounded bg-brand/10 text-brand border border-brand/20 text-[10px] font-bold">
                                                        #{k}
                                                    </span>
                                                ))}
                                            </div>
                                            {/* Summary */}
                                            <p className="text-xs text-brand/90 leading-relaxed font-medium">
                                                {current.aiProfile.summary}
                                            </p>

                                            {/* Update Trigger (Always Visible) */}
                                            <button
                                                onClick={() => handleGenerateProfile(current)}
                                                disabled={analyzing}
                                                className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-[10px] font-bold text-brand/70 hover:text-brand bg-brand/5 hover:bg-brand/10 rounded-xl transition-all disabled:opacity-50"
                                            >
                                                {analyzing ? (
                                                    <RefreshCw className="animate-spin" size={12} />
                                                ) : (
                                                    <RefreshCw size={12} />
                                                )}
                                                {(current.tweets.length - current.aiProfile.tweetCountAtAnalysis >= 25)
                                                    ? `发现 ${current.tweets.length - current.aiProfile.tweetCountAtAnalysis} 条新内容，点击更新`
                                                    : "重新生成画像"
                                                }
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center py-4">
                                            <p className="text-[10px] text-zinc-500 mb-4">暂无画像，点击生成基于 Top 15 代表作的深度分析</p>
                                            <button
                                                onClick={() => handleGenerateProfile(current)}
                                                disabled={analyzing}
                                                className="w-full py-2.5 flex items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white text-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {analyzing ? (
                                                    <>
                                                        <RefreshCw className="animate-spin" size={14} />
                                                        思考中...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={14} fill="currentColor" />
                                                        生成 AI 画像
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <div className="text-center opacity-20">
                            <BarChart3 size={48} className="mx-auto mb-4" />
                            <div className="text-sm font-bold uppercase tracking-widest">{t('analytics_select_creator')}</div>
                        </div>
                    </div>
                )}
            </main>

            {/* === Sidebar List (Right) === */}
            <aside className="w-[340px] flex flex-col shrink-0 bg-black/20 border-l border-white/5">
                <div className="p-5 border-b border-white/5">
                    <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-widest">{t('analytics_global_ranking')}</h2>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-400 font-medium">{filteredAuthors.length}</span>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={13} />
                        <input
                            type="text"
                            placeholder={t('analytics_filter_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-white/10 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-0.5">
                    {filteredAuthors.map((author, index) => (
                        <button
                            key={author.handle}
                            onClick={() => setSelectedHandle(author.handle)}
                            className={cn(
                                "w-full flex items-center gap-4 p-3 rounded-xl transition-all group relative",
                                selectedHandle === author.handle
                                    ? "bg-white/[0.06]"
                                    : "hover:bg-white/[0.02]"
                            )}
                        >
                            {/* Rank Number */}
                            <div className={cn(
                                "w-6 text-center text-xs font-black italic tabular-nums shrink-0",
                                index < 3 ? "text-white" : "text-zinc-600 group-hover:text-zinc-500",
                                index === 0 && "text-amber-400",
                                index === 1 && "text-zinc-300",
                                index === 2 && "text-amber-700"
                            )}>
                                {index + 1}
                            </div>

                            {/* Avatar */}
                            <div className="relative shrink-0">
                                <div className={cn(
                                    "w-10 h-10 rounded-lg overflow-hidden border transition-colors",
                                    selectedHandle === author.handle ? "border-white/30" : "border-white/5 group-hover:border-white/10"
                                )}>
                                    <img src={author.avatar} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                </div>
                                {author.lastActive > Date.now() - 86400000 && (
                                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-950" />
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center justify-between">
                                    <span className={cn(
                                        "text-sm font-bold truncate",
                                        selectedHandle === author.handle ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                                    )}>{author.name}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <div className="flex items-center gap-1 text-[10px] font-medium text-zinc-600">
                                        <TrendingUp size={10} /> {(author.totalLikes / 1000).toFixed(0)}K
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] font-medium text-brand/80">
                                        <Zap size={10} /> {author.totalHvi}
                                    </div>
                                </div>
                            </div>

                            {selectedHandle === author.handle && (
                                <ChevronRight size={14} className="text-zinc-500 animate-in fade-in slide-in-from-left-1" />
                            )}
                        </button>
                    ))}
                </div>
            </aside>
        </div>
    );
};
