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
    Clock,
    Database,
    Heart,
    MessageCircle,
    ScanFace,
    RefreshCw
} from 'lucide-react';
import { useSettingsStore, SettingsState } from '@shared/store/useSettingsStore';
import { TweetAnalyzer } from '../../core/ai/analyzer';
import { TweetRepository } from '../../core/storage/TweetRepository';
import { UserCache } from '../../shared/types/tweet';
import { cn } from '../../shared/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from '../../shared/components/MarkdownRenderer';

// --- Types ---
type AnalyticsTab = 'persona' | 'rhythm' | 'semantic' | 'sentiment' | 'chat';

export type AnalyzedTweet = TweetWithUser & { hvi: number };

interface AuthorStats {
    handle: string;
    name: string;
    avatar: string | undefined;
    tweets: AnalyzedTweet[];
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
    const settings = useSettingsStore((s: SettingsState) => s.settings);
    const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<AnalyticsTab>('persona');

    // --- Chat State with Persistence ---
    const [chatQuery, setChatQuery] = useState('');
    const [sendingChat, setSendingChat] = useState(false);
    const [chatHistory, setChatHistory] = useState<Record<string, { role: 'user' | 'assistant', content: string }[]>>(() => {
        // Load from localStorage on init
        try {
            const saved = localStorage.getItem('thattweet_thought_salon');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    // Persist chat history to localStorage
    React.useEffect(() => {
        if (Object.keys(chatHistory).length > 0) {
            try {
                localStorage.setItem('thattweet_thought_salon', JSON.stringify(chatHistory));
            } catch (e) {
                console.warn('[Thought Salon] Failed to save chat history', e);
            }
        }
    }, [chatHistory]);


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

    const handleSendChat = async () => {
        if (!chatQuery.trim() || !current || sendingChat) return;

        const q = chatQuery.trim();
        const handle = current.handle;
        setChatQuery('');
        setSendingChat(true);

        // 1. Add user message
        setChatHistory(prev => ({
            ...prev,
            [handle]: [...(prev[handle] || []), { role: 'user', content: q }]
        }));

        // 2. Add empty assistant message placeholder
        setChatHistory(prev => ({
            ...prev,
            [handle]: [...(prev[handle] || []), { role: 'assistant', content: '' }]
        }));

        try {
            let fullContent = '';
            await TweetAnalyzer.chatWithAuthorExpertStream(q, current.tweets, settings, (chunk) => {
                fullContent += chunk;
                setChatHistory(prev => {
                    const history = [...(prev[handle] || [])];
                    if (history.length > 0) {
                        history[history.length - 1] = {
                            ...history[history.length - 1],
                            content: fullContent
                        };
                    }
                    return { ...prev, [handle]: history };
                });
            });
        } catch (e: any) {
            console.error("Chat Error", e);
            let errMsg = "抱歉，分析过程中出现了点问题。请检查网络或 AI 配置。";

            if (e.message?.includes('404') && e.message?.includes('data policy')) {
                errMsg = "OpenRouter 404: 因为你使用了免费模型，请前往 OpenRouter官网 -> Settings -> Privacy -> 开启 'Free model publication' 才能正常使用。";
            } else if (e.message?.includes('401')) {
                errMsg = "API Key 无效或未设置，请在设置中检查。";
            }

            setChatHistory(prev => {
                const history = [...(prev[handle] || [])];
                if (history.length > 0) {
                    history[history.length - 1] = {
                        ...history[history.length - 1],
                        content: errMsg
                    };
                }
                return { ...prev, [handle]: history };
            });
        } finally {
            setSendingChat(false);
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

            stat.tweets.push({ ...t, hvi }); // 把 HVI 注入 tweet 对象
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
                tweets: a.tweets.sort((t1, t2) => t2.hvi - t1.hvi)
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

    const currentChat = useMemo(() => {
        const handle = current?.handle;
        if (!handle) return [];
        return chatHistory[handle] || [];
    }, [chatHistory, current]);

    // Auto-scroll chat
    React.useEffect(() => {
        const container = document.getElementById('chat-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [currentChat]);

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
            .map((t) => t.hvi);
    }, [current]);

    if (loading) return null;

    return (
        <div className="flex h-full w-full bg-zinc-950 font-sans selection:bg-brand/20">
            {/* === Sidebar List (Left) === */}
            <aside className="w-[300px] flex flex-col shrink-0 bg-black/20 border-r border-white/5">
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
            {/* === Main Content === */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
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
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-8 lg:px-12 pb-12">
                            {/* Left: Masterpieces (Content) */}
                            <div className="lg:col-span-2 space-y-8">
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
                                                        {current.tweets[0].hvi} HVI
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
                                                <span className="ml-auto text-emerald-500">{current.tweets[0].hvi > 90 ? t('analytics_supernova') : t('analytics_viral_hit')}</span>
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
                                                <span className="text-sm font-black text-zinc-400">{t.hvi}</span>
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
                                            <div className="text-xs font-bold text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">{t.hvi}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Intelligence Command Center (Sticky) */}
                            <div className="lg:sticky lg:top-8 h-fit space-y-6">
                                {/* Tab Navigation */}
                                <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
                                    {[
                                        { id: 'persona', icon: ScanFace, label: '画像' },
                                        { id: 'rhythm', icon: Clock, label: '发布节律' },
                                        { id: 'semantic', icon: Database, label: '知识图谱' },
                                        { id: 'sentiment', icon: Heart, label: '情绪趋势' },
                                        { id: 'chat', icon: Sparkles, label: '思想沙龙' },
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as AnalyticsTab)}
                                            className={cn(
                                                "flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all relative",
                                                activeTab === tab.id ? "bg-white/10 text-brand shadow-lg" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                                            )}
                                        >
                                            <tab.icon size={16} />
                                            <span className="text-[9px] font-bold uppercase tracking-tight scale-90">{tab.label}</span>

                                            {/* Notification Dot for Persona Update */}
                                            {tab.id === 'persona' && current.aiProfile && (current.tweets.length - current.aiProfile.tweetCountAtAnalysis >= 25) && (
                                                <div className="absolute top-1 right-2 w-1.5 h-1.5 bg-brand rounded-full animate-pulse shadow-sm shadow-brand/50" />
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <AnimatePresence mode="wait">
                                    {activeTab === 'persona' && (
                                        <motion.div
                                            key="persona"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="space-y-6"
                                        >
                                            {/* Content DNA */}
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
                                                    </div>
                                                )}
                                            </div>

                                            {/* AI Profile Card */}
                                            <div className="relative p-6 rounded-3xl bg-gradient-to-br from-brand/5 to-transparent border border-brand/10 overflow-hidden">
                                                <div className="absolute top-4 right-6 opacity-10 text-brand">
                                                    <Sparkles size={48} />
                                                </div>

                                                <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2 mb-4 relative z-10">
                                                    <ScanFace size={14} className="text-brand" /> {t('analytics_ai_profile')}
                                                </h4>

                                                {current.aiProfile ? (
                                                    <div className="space-y-4 relative z-10">
                                                        <div className="flex gap-3">
                                                            <div className="shrink-0 text-brand py-1">
                                                                <Activity size={20} className="opacity-40" />
                                                            </div>
                                                            <p className="text-xs text-zinc-300 leading-relaxed font-medium italic">
                                                                {current.aiProfile.summary}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                                            {current.aiProfile.keywords.map(kw => (
                                                                <span key={kw} className="px-2 py-0.5 rounded-lg bg-white/5 text-[10px] font-bold text-zinc-400 border border-white/5 hover:border-brand/30 hover:text-brand transition-colors cursor-default">
                                                                    #{kw}
                                                                </span>
                                                            ))}
                                                        </div>

                                                        {/* Update Trigger */}
                                                        <div className="pt-6 border-t border-white/5 mt-4">
                                                            <button
                                                                onClick={() => handleGenerateProfile(current)}
                                                                disabled={analyzing}
                                                                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-all group"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className={cn("p-2 rounded-xl bg-brand/10 text-brand transition-transform", analyzing && "animate-spin")}>
                                                                        <RefreshCw size={14} />
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <div className="text-[10px] font-black text-white uppercase tracking-wider">{analyzing ? t('analytics_analyzing') : "更新智慧画像"}</div>
                                                                        <div className="text-[9px] text-zinc-500 font-medium">
                                                                            {current.tweets.length - current.aiProfile.tweetCountAtAnalysis > 0
                                                                                ? t('analytics_sync_suggest', { count: current.tweets.length - current.aiProfile.tweetCountAtAnalysis })
                                                                                : t('analytics_up_to_date')}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <ChevronRight size={14} className="text-zinc-600 group-hover:text-brand group-hover:translate-x-1 transition-all" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="py-8 text-center space-y-4">
                                                        <div className="w-12 h-12 rounded-full bg-brand/10 text-brand flex items-center justify-center mx-auto opacity-50">
                                                            <Sparkles size={24} />
                                                        </div>
                                                        <p className="text-[11px] text-zinc-500 font-medium px-4">该博主尚未生成 AI 画像。点击下方按钮，由 AI 深度挖掘其内容基因。</p>
                                                        <button
                                                            onClick={() => handleGenerateProfile(current)}
                                                            disabled={analyzing}
                                                            className="px-6 py-2.5 rounded-xl bg-brand text-white text-[11px] font-bold hover:bg-brand-hover active:scale-95 transition-all shadow-lg shadow-brand/20 flex items-center gap-2 mx-auto"
                                                        >
                                                            {analyzing ? (
                                                                <>
                                                                    <RefreshCw size={14} className="animate-spin" />
                                                                    {t('analytics_analyzing')}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Zap size={14} />
                                                                    生成深度画像
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Decorative background glass */}
                                                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-brand/5 rounded-full blur-3xl" />
                                            </div>

                                            {/* Hook Library (NEW) */}
                                            <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4">
                                                <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2"><Zap size={14} className="text-amber-400" /> 钩子图书馆 (Hook Library)</h4>
                                                <div className="space-y-3">
                                                    {current.tweets.slice(0, 5).map((t, i) => (
                                                        <div key={i} className="group p-3 rounded-xl bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 transition-all text-[10px] leading-relaxed relative">
                                                            <div className="text-zinc-500 mb-1 flex justify-between">
                                                                <span>HOOK #{i + 1}</span>
                                                                <span className="text-brand font-black italic">HVI {t.hvi}</span>
                                                            </div>
                                                            <p className="text-zinc-300 line-clamp-2">
                                                                {t.text.split('\n')[0].length < 10 ? t.text.split('\n').slice(0, 2).join(' ') : t.text.split('\n')[0]}
                                                            </p>
                                                        </div>
                                                    ))}
                                                    <p className="text-[9px] text-zinc-600 text-center italic">提取自作者热度最高的前 5 篇代表作的第一句话</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'rhythm' && (
                                        <motion.div key="rhythm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
                                            <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2"><Clock size={14} className="text-brand" /> 发布节律 (24h)</h4>

                                            <div className="space-y-6">
                                                {/* 24h Activity Chart */}
                                                <div>
                                                    <div className="text-[9px] font-bold text-zinc-600 uppercase mb-3 tracking-widest">24 小时活跃区间</div>
                                                    <div className="flex items-end justify-between h-16 gap-1 px-1">
                                                        {(() => {
                                                            const hours = new Array(24).fill(0);
                                                            current.tweets.forEach(t => hours[new Date(t.savedAt).getHours()]++);
                                                            const max = Math.max(...hours, 1);
                                                            return hours.map((count, h) => (
                                                                <div key={h} className="group relative flex-1 flex flex-col items-center gap-1">
                                                                    <div className={cn("w-full rounded-t-[1px] transition-all bg-brand/30 group-hover:bg-brand", count === 0 && "opacity-20")} style={{ height: `${(count / max) * 100}%` }} />
                                                                </div>
                                                            ));
                                                        })()}
                                                    </div>
                                                    <div className="flex justify-between mt-1 px-1">
                                                        <span className="text-[7px] text-zinc-700">00h</span>
                                                        <span className="text-[7px] text-zinc-700">12h</span>
                                                        <span className="text-[7px] text-zinc-700">23h</span>
                                                    </div>
                                                </div>

                                                {/* Weekly Patterns (NEW) */}
                                                <div>
                                                    <div className="text-[9px] font-bold text-zinc-600 uppercase mb-3 tracking-widest">周频发布波动</div>
                                                    <div className="grid grid-cols-7 gap-1">
                                                        {(() => {
                                                            const days = new Array(7).fill(0);
                                                            current.tweets.forEach(t => days[new Date(t.savedAt).getDay()]++);
                                                            const max = Math.max(...days, 1);
                                                            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                                                            return days.map((count, d) => (
                                                                <div key={d} className="flex flex-col items-center gap-2">
                                                                    <div className="w-full bg-white/5 rounded-lg p-1 aspect-square flex flex-col items-center justify-center border border-white/5 relative overflow-hidden">
                                                                        <div className="absolute inset-x-0 bottom-0 bg-brand/20 transition-all" style={{ height: `${(count / max) * 100}%` }} />
                                                                        <span className="text-[8px] font-black text-white relative z-10">{count}</span>
                                                                    </div>
                                                                    <span className="text-[7px] font-bold text-zinc-600">{dayNames[d]}</span>
                                                                </div>
                                                            ));
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* Analysis Insights */}
                                                <div className="grid grid-cols-2 gap-3 pt-2">
                                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                                        <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">活跃预测</div>
                                                        <div className="text-xs font-bold text-brand">
                                                            {(() => {
                                                                const hours = new Array(24).fill(0);
                                                                current.tweets.forEach(t => hours[new Date(t.savedAt).getHours()]++);
                                                                const peakHour = hours.indexOf(Math.max(...hours));
                                                                return `巅峰: ${peakHour}:00`;
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                                        <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">休息偏好</div>
                                                        <div className="text-xs font-bold text-white">
                                                            {(() => {
                                                                const days = new Array(7).fill(0);
                                                                current.tweets.forEach(t => days[new Date(t.savedAt).getDay()]++);
                                                                const minDay = days.indexOf(Math.min(...days));
                                                                return `${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][minDay]}发布最少`;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'semantic' && (
                                        <motion.div key="semantic" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
                                            <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2"><Database size={14} className="text-brand" /> 语义版图</h4>

                                            <div className="space-y-6">
                                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">高频议题版图 (Word Cloud)</div>
                                                <div className="relative p-6 rounded-3xl bg-black/20 border border-white/5 min-h-[180px] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 overflow-hidden">
                                                    {(() => {
                                                        const tags: Record<string, number> = {};
                                                        current.tweets.forEach(t => {
                                                            (t.aiTags || []).forEach(tag => tags[tag] = (tags[tag] || 0) + 1);
                                                            if (t.aiCategory) tags[t.aiCategory] = (tags[t.aiCategory] || 0) + 2;
                                                        });
                                                        const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 20);
                                                        const max = Math.max(...Object.values(tags), 1);

                                                        return sorted.map(([tag, count], i) => {
                                                            const ratio = count / max;
                                                            const fontSize = 10 + ratio * 14;
                                                            const opacity = 0.4 + ratio * 0.6;
                                                            return (
                                                                <motion.span
                                                                    key={tag}
                                                                    initial={{ scale: 0.8, opacity: 0 }}
                                                                    animate={{ scale: 1, opacity }}
                                                                    transition={{ delay: i * 0.05 }}
                                                                    className="font-black tracking-tight transition-colors hover:text-brand cursor-default"
                                                                    style={{ fontSize: `${fontSize}px`, color: ratio > 0.6 ? '#fff' : 'rgba(255,255,255,0.6)' }}
                                                                >
                                                                    {tag}
                                                                </motion.span>
                                                            );
                                                        });
                                                    })()}

                                                    {/* Background decorative elements */}
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full blur-3xl -z-10" />
                                                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-rose-500/5 rounded-full blur-3xl -z-10" />
                                                </div>

                                                <div className="mt-6 p-4 rounded-2xl bg-brand/5 border border-brand/10">
                                                    <div className="text-[9px] font-bold text-brand uppercase mb-2">核心议题深度分析</div>
                                                    <div className="flex items-end gap-1 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-brand rounded-full" style={{ width: '78%' }} />
                                                    </div>
                                                    <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">该博主的内容结构具有高度的系统性，主要围绕着这些核心节点进行深度延展。</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'sentiment' && (
                                        <motion.div key="sentiment" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
                                            <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2"><Heart size={14} className="text-rose-400" /> 情绪/质量指数</h4>

                                            <div className="space-y-6">
                                                <div className="flex flex-col items-center justify-center p-8 rounded-full border-4 border-brand/20 border-t-brand w-32 h-32 mx-auto relative group">
                                                    <div className="text-3xl font-black text-white">{current.avgScore}</div>
                                                    <div className="text-[9px] font-bold text-zinc-500 uppercase italic">SQI Index</div>
                                                    {/* Decorative ring animation */}
                                                    <div className="absolute inset-0 rounded-full border border-brand/10 animate-ping opacity-20" />
                                                </div>

                                                {/* Professional vs Personal (NEW) */}
                                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                                                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                                                        <span>内容调性分布</span>
                                                        <span className="text-brand">Professional vs Personal</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                                                        {(() => {
                                                            const professionalCats = ['Tech', 'Crypto', 'AI', 'Business', 'Knowledge', 'Development', 'Productivity'];
                                                            const profCount = current.tweets.filter(t => professionalCats.includes(t.aiCategory || '')).length;
                                                            const rate = Math.round((profCount / current.tweets.length) * 100);
                                                            return (
                                                                <>
                                                                    <div className="h-full bg-brand" style={{ width: `${rate}%` }} />
                                                                    <div className="h-full bg-rose-500/40" style={{ width: `${100 - rate}%` }} />
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex justify-between items-center px-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                                                            <span className="text-[9px] text-zinc-400">专业干货</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] text-zinc-400">生活体验</span>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500/40" />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Sentiment / Quality Trend (NEW) */}
                                                <div>
                                                    <div className="text-[9px] font-bold text-zinc-600 uppercase mb-3 tracking-widest">表现质量走势 (AI Momentum)</div>
                                                    <div className="h-20 w-full bg-white/[0.01] rounded-xl border border-white/5 p-2 overflow-hidden">
                                                        <SmoothTrendChart
                                                            data={current.tweets.slice(0, 20).reverse().map(t => t.aiScore || 50)}
                                                            color={current.avgScore > 75 ? "#10b981" : "#3b82f6"}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                                    <div className="text-[10px] font-medium text-zinc-400 leading-relaxed italic">
                                                        “风格稳定性得分较高，推文质量波动极小，是一位输出极其稳定的内容创作者。”
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'chat' && (
                                        <motion.div key="chat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col h-[600px] rounded-3xl bg-[#09090b] border border-white/5">
                                            {/* Thought Salon Header */}
                                            <div className="px-6 py-4 border-b border-white/5">
                                                <h4 className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                                    <Sparkles size={12} className="text-zinc-600" />
                                                    思想沙龙 · @{current.handle}
                                                </h4>
                                            </div>

                                            {/* Chat History - Vertical Flow */}
                                            <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4 space-y-6" id="chat-container">
                                                {currentChat.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-4">
                                                            <Sparkles size={20} className="text-zinc-700" />
                                                        </div>
                                                        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-3">思想沙龙已就绪</p>
                                                        <p className="text-[11px] text-zinc-600 leading-relaxed max-w-[240px]">
                                                            在这里，我将化身 @{current.handle} 的思想映射。基于他的历史推文，与你进行深度对话。
                                                        </p>
                                                    </div>
                                                ) : (
                                                    currentChat.map((msg, i) => (
                                                        <div key={i} className="space-y-1">
                                                            {msg.role === 'user' ? (
                                                                <div className="flex justify-end">
                                                                    <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-white/[0.03] border border-zinc-800 text-[13px] text-zinc-300 leading-relaxed">
                                                                        {msg.content}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-2">
                                                                    {msg.content ? (
                                                                        <div className="text-[13px] leading-relaxed">
                                                                            <MarkdownRenderer content={msg.content} />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-2 py-2">
                                                                            <div className="flex gap-1">
                                                                                <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse" />
                                                                                <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse [animation-delay:0.15s]" />
                                                                                <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse [animation-delay:0.3s]" />
                                                                            </div>
                                                                            <span className="text-[10px] text-zinc-700 italic">正在检索记忆...</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                                <div id="chat-bottom" />
                                            </div>

                                            {/* Input Area - Minimalist */}
                                            <div className="px-6 py-4 border-t border-white/5">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={chatQuery}
                                                        onChange={(e) => setChatQuery(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                                        placeholder="与思想对话..."
                                                        className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3 pl-4 pr-12 text-[13px] text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-zinc-700 transition-all"
                                                    />
                                                    <button
                                                        onClick={handleSendChat}
                                                        disabled={!chatQuery.trim() || sendingChat}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                                                    >
                                                        {sendingChat ? <RefreshCw size={14} className="animate-spin" /> : <TrendingUp size={14} className="rotate-90" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
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

        </div>
    );
};

export default AnalyticsView;
