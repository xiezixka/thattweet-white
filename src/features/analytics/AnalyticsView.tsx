import React, { useMemo, useState } from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useTranslation } from '../../shared/hooks/useTranslation';
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
    RefreshCw,
    PanelRightOpen,
    Quote,
    GripVertical,
    Share2,
    BarChart,
    ChevronDown,
    Trash2
} from 'lucide-react';
import { useSettingsStore, SettingsState } from '@shared/store/useSettingsStore';
import { TweetAnalyzer } from '../../core/ai/analyzer';
import { TweetRepository } from '../../core/storage/TweetRepository';
import { UserCache } from '../../shared/types/tweet';
import { cn } from '../../shared/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from '../../shared/components/MarkdownRenderer';

// --- Types ---
type AnalyticsTab = 'persona' | 'rhythm' | 'semantic' | 'sentiment';

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

// --- HVI Algorithm ---
const calculateHVI = (tweet: TweetWithUser) => {
    const likes = tweet.favoriteCount || 0;
    const rts = tweet.retweetCount || 0;
    const views = tweet.viewCount || 100;
    const score = tweet.aiScore || 50;
    const efficiency = ((likes * 1 + rts * 2) / Math.max(views, 1)) * 1000;
    const impact = (likes + rts * 2);
    const qualityMultiplier = score / 50;
    const rawScore = (efficiency * 0.4 + Math.log10(impact + 1) * 20) * qualityMultiplier;
    return Math.min(Math.round(rawScore), 99);
};

// --- Components ---

const SmoothTrendChart: React.FC<{ data: number[], color?: string }> = ({ data, color = '#10b981' }) => {
    if (data.length < 2) return null;
    const height = 60;
    const width = 200;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min;
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
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" className="drop-shadow-lg" />
            <path d={`${path} L ${width},${height} L 0,${height} Z`} fill={color} fillOpacity="0.1" />
        </svg>
    );
};

const MetricBar: React.FC<{ label: string; value: number; icon: React.ElementType }> = ({ label, value, icon: Icon }) => (
    <div className="flex items-center gap-3 group">
        <div className="p-2.5 rounded-xl bg-white/5 text-zinc-400 group-hover:text-zinc-100 group-hover:bg-white/10 transition-colors">
            <Icon size={16} />
        </div>
        <div className="flex-1">
            <div className="flex justify-between items-end mb-1.5">
                <span className="text-[var(--font-fluid-sm)] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
                <span className="text-[var(--font-fluid-base)] font-black text-zinc-200 tabular-nums">{value}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full bg-brand rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(29,155,240,0.3)]"
                    style={{ width: `${value}%` }}
                />
            </div>
        </div>
    </div>
);

const TypewriterText: React.FC<{ text: string; isUpdating: boolean }> = ({ text, isUpdating }) => {
    const [display, setDisplay] = React.useState(text);
    const [phase, setPhase] = React.useState<'idle' | 'deleting' | 'typing'>('idle');

    React.useEffect(() => {
        if (isUpdating) {
            setPhase('deleting');
        } else if (phase === 'deleting' && !isUpdating) {
            setPhase('typing');
        }
    }, [isUpdating, phase]);

    React.useEffect(() => {
        // Switch author case: jump immediately
        if (!isUpdating && phase === 'idle' && display !== text) {
            setDisplay(text);
        }
    }, [text, isUpdating, phase, display]);

    React.useEffect(() => {
        if (phase === 'deleting') {
            if (display.length > 0) {
                const timer = setTimeout(() => {
                    setDisplay(prev => prev.slice(0, -1));
                }, 5);
                return () => clearTimeout(timer);
            } else if (!isUpdating) {
                setPhase('typing');
            }
        } else if (phase === 'typing') {
            if (display.length < text.length) {
                const timer = setTimeout(() => {
                    setDisplay(text.slice(0, display.length + 1));
                }, 15);
                return () => clearTimeout(timer);
            } else {
                setPhase('idle');
            }
        }
    }, [display, text, phase, isUpdating]);

    return <span>{display}{phase !== 'idle' && <span className="inline-block w-1 h-4 bg-brand ml-1 animate-pulse" />}</span>;
};

export const AnalyticsView: React.FC = () => {
    const { tweets, loading } = useTweets();
    const settings = useSettingsStore((s: SettingsState) => s.settings);
    const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState<AnalyticsTab>('persona');

    // --- Chat State ---
    const [chatQuery, setChatQuery] = useState('');
    const [sendingChat, setSendingChat] = useState(false);
    const [chatHistory, setChatHistory] = useState<Record<string, { role: 'user' | 'assistant', content: string }[]>>(() => {
        try {
            const saved = localStorage.getItem('thattweet_thought_salon');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });

    // --- Resizable Chat Sidebar ---
    const [chatWidth, setChatWidth] = useState(() => {
        const saved = localStorage.getItem('thattweet_analytics_chat_width');
        return saved ? parseInt(saved, 10) : 400;
    });
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = React.useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 320 && newWidth < 800) {
                setChatWidth(newWidth);
            }
        }
    }, [isResizing]);

    React.useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    React.useEffect(() => {
        localStorage.setItem('thattweet_analytics_chat_width', chatWidth.toString());
    }, [chatWidth]);

    React.useEffect(() => {
        if (Object.keys(chatHistory).length > 0) {
            localStorage.setItem('thattweet_thought_salon', JSON.stringify(chatHistory));
        }
    }, [chatHistory]);

    // --- Data processing ---
    const authors = useMemo(() => {
        const map = new Map<string, AuthorStats>();
        tweets.forEach((t: TweetWithUser) => {
            const handle = t.author?.handle || 'unknown';
            if (!map.has(handle)) {
                map.set(handle, {
                    handle,
                    name: t.author?.name || 'Unknown',
                    avatar: normalizeTwitterImage(t.author?.avatar, 'avatar'),
                    tweets: [], totalLikes: 0, totalViews: 0, avgScore: 0, maxHvi: 0, totalHvi: 0, lastActive: 0,
                    aiProfile: t.author?.aiProfile
                });
            }
            const stat = map.get(handle)!;
            const hvi = calculateHVI(t);
            stat.tweets.push({ ...t, hvi });
            stat.totalLikes += (t.favoriteCount || 0);
            stat.totalViews += (t.viewCount || 0);
            stat.avgScore += (t.aiScore || 0);
            stat.totalHvi += hvi;
            stat.maxHvi = Math.max(stat.maxHvi, hvi);
            stat.lastActive = Math.max(stat.lastActive, t.savedAt);
        });
        return Array.from(map.values())
            .map(a => ({ ...a, avgScore: Math.round(a.avgScore / a.tweets.length), tweets: a.tweets.sort((t1, t2) => t2.hvi - t1.hvi) }))
            .sort((a, b) => b.totalHvi - a.totalHvi);
    }, [tweets]);

    const filteredAuthors = useMemo(() => authors.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.handle.toLowerCase().includes(searchTerm.toLowerCase())), [authors, searchTerm]);
    const current = useMemo(() => selectedHandle ? authors.find(a => a.handle === selectedHandle) : authors[0], [selectedHandle, authors]);
    const currentChat = useMemo(() => current ? (chatHistory[current.handle] || []) : [], [chatHistory, current]);

    React.useEffect(() => {
        const container = document.getElementById('chat-container');
        if (container) container.scrollTop = container.scrollHeight;
    }, [currentChat]);

    const viralMetrics = useMemo(() => {
        if (!current) return null;
        const topTweets = current.tweets.slice(0, 10);
        if (topTweets.length === 0) return null;
        const hasMedia = topTweets.filter(t => t.media?.length > 0).length;
        const hasText = topTweets.length - hasMedia;
        const hasLink = topTweets.filter(t => t.text.includes('http')).length;
        const avgLen = topTweets.reduce((acc, t) => acc + t.text.length, 0) / topTweets.length;
        const cats: Record<string, number> = {};
        topTweets.forEach(t => { const c = t.aiCategory || 'Other'; cats[c] = (cats[c] || 0) + 1; });
        const entries = Object.entries(cats);
        const primeCat = entries.length > 0 ? entries.sort((a, b) => b[1] - a[1])[0][0] : 'General';
        return {
            mediaRate: Math.round((hasMedia / topTweets.length) * 100),
            textRate: Math.round((hasText / topTweets.length) * 100),
            linkRate: Math.round((hasLink / topTweets.length) * 100),
            avgLength: Math.round(avgLen),
            primeCategory: primeCat
        };
    }, [current]);

    const trendData = useMemo(() => current ? [...current.tweets].sort((a, b) => a.savedAt - b.savedAt).slice(-20).map(t => t.hvi) : [], [current]);

    // --- Actions ---
    const handleGenerateProfile = async (author: AuthorStats) => {
        if (analyzing || !author) return;
        setAnalyzing(true);
        try {
            const topTweets = author.tweets.slice(0, 20);
            const profile = await TweetAnalyzer.analyzeAuthorProfile(topTweets, settings);
            const userId = author.tweets[0]?.authorId;
            if (userId) {
                await TweetRepository.updateAuthorProfile(userId, {
                    aiProfile: {
                        summary: profile.summary,
                        keywords: profile.keywords,
                        sentiment: profile.sentiment,
                        semantic: profile.semantic,
                        lastAnalyzedAt: Date.now(),
                        tweetCountAtAnalysis: author.tweets.length
                    }
                });
            }
        } catch (e) {
            console.error(e);
        } finally { setAnalyzing(false); }
    };

    const handleSendChat = async () => {
        if (!chatQuery.trim() || !current || sendingChat) return;
        const q = chatQuery.trim();
        const handle = current.handle;
        setChatQuery('');
        setSendingChat(true);
        setChatHistory(prev => ({
            ...prev,
            [handle]: [...(prev[handle] || []), { role: 'user', content: q }, { role: 'assistant', content: '' }]
        }));

        try {
            let fullContent = '';
            await TweetAnalyzer.chatWithAuthorExpertStream(q, current.tweets, settings, (chunk) => {
                fullContent += chunk;
                setChatHistory(prev => {
                    const history = [...(prev[handle] || [])];
                    if (history.length > 0) {
                        history[history.length - 1] = { ...history[history.length - 1], content: fullContent };
                    }
                    return { ...prev, [handle]: history };
                });
            });
        } catch (e: any) {
            setChatHistory(prev => {
                const history = [...(prev[handle] || [])];
                if (history.length > 0) {
                    history[history.length - 1] = { ...history[history.length - 1], content: "Error occurred during dialogue." };
                }
                return { ...prev, [handle]: history };
            });
        } finally { setSendingChat(false); }
    };

    const handleClearChat = () => {
        if (!current) return;
        if (window.confirm('确定要清空与该作者的所有对话记录吗？')) {
            setChatHistory(prev => {
                const newHistory = { ...prev };
                delete newHistory[current.handle];
                return newHistory;
            });
        }
    };

    const handleDeleteMessage = (index: number) => {
        if (!current) return;
        setChatHistory(prev => {
            const history = [...(prev[current.handle] || [])];
            history.splice(index, 1);
            return {
                ...prev,
                [current.handle]: history
            };
        });
    };

    if (loading) return (
        <div className="flex h-full items-center justify-center bg-zinc-950">
            <RefreshCw className="animate-spin text-brand" size={32} />
        </div>
    );

    return (
        <div className="flex h-full w-full bg-[#050505] font-sans selection:bg-brand/20 overflow-hidden">
            {/* === 1. RANKING COLUMN (Left) === */}
            <aside className="w-[var(--sidebar-width,280px)] xl:w-[320px] flex flex-col shrink-0 bg-black/40 border-r border-white/5 z-20">
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-[var(--font-fluid-sm)] font-black text-white uppercase tracking-[0.2em]">作者排位</h2>
                        <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-bold border border-brand/20">{filteredAuthors.length}</span>
                    </div>
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-brand transition-colors" size={14} />
                        <input
                            type="text"
                            placeholder="寻找创作者..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-2.5 pl-10 pr-4 text-sm text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-brand/30 focus:bg-white/[0.08] transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1">
                    {filteredAuthors.map((author, index) => {
                        // 计算原始排名（在未过滤列表中的位置）
                        const originalRank = authors.findIndex(a => a.handle === author.handle);
                        const isTopThree = originalRank < 3;

                        // 前三名的奖牌颜色
                        const rankColors = [
                            { badge: 'bg-amber-500 text-amber-900', ring: 'ring-amber-500/50', text: 'text-amber-400' }, // 🥇 金
                            { badge: 'bg-zinc-300 text-zinc-700', ring: 'ring-zinc-300/50', text: 'text-zinc-200' },   // 🥈 银
                            { badge: 'bg-amber-700 text-amber-100', ring: 'ring-amber-700/50', text: 'text-amber-600' }  // 🥉 铜
                        ];

                        return (
                            <button
                                key={author.handle}
                                onClick={() => setSelectedHandle(author.handle)}
                                className={cn(
                                    "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group relative border border-transparent",
                                    selectedHandle === author.handle ? "bg-white/[0.08] border-white/5 shadow-2xl" : "hover:bg-white/[0.03]"
                                )}
                            >
                                {/* 排名徽章 */}
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black italic shrink-0 transition-colors",
                                    isTopThree ? rankColors[originalRank].badge : "bg-zinc-800 text-zinc-600 group-hover:text-zinc-400",
                                    selectedHandle === author.handle && !isTopThree && "bg-brand/20 text-brand"
                                )}>
                                    {originalRank + 1}
                                </div>

                                <div className="relative shrink-0">
                                    <div className={cn(
                                        "w-11 h-11 rounded-xl overflow-hidden border transition-all duration-500",
                                        selectedHandle === author.handle ? "border-brand scale-105" : "border-white/10 group-hover:border-white/30",
                                        isTopThree && `ring-2 ${rankColors[originalRank].ring}`
                                    )}>
                                        <img src={author.avatar} className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all" />
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0 text-left">
                                    <div className={cn(
                                        "text-[var(--font-fluid-base)] font-bold truncate transition-colors",
                                        isTopThree ? rankColors[originalRank].text : "text-zinc-300 group-hover:text-white"
                                    )}>{author.name}</div>
                                    <div className="flex items-center gap-3 mt-1.5 opacity-60">
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400"><TrendingUp size={10} /> {(author.totalLikes / 1000).toFixed(1)}K</div>
                                        <div className={cn(
                                            "flex items-center gap-1 text-[10px] font-bold",
                                            isTopThree ? rankColors[originalRank].text : "text-brand"
                                        )}><Zap size={10} /> {author.totalHvi}</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </aside>

            {/* === 2. MAIN CANVAS (Center) === */}
            <main className="flex-1 flex flex-col min-w-0 overflow-y-auto no-scrollbar relative z-10 bg-gradient-to-b from-[#0a0a0b] to-[#050505]">
                {current ? (
                    <div className="p-8 lg:p-12 xl:p-16 space-y-12 max-w-5xl mx-auto w-full">
                        {/* A. Dynamic Header */}
                        <header className="space-y-8">
                            <div className="flex items-start justify-between">
                                <div className="space-y-4">
                                    <motion.h1
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-[var(--font-fluid-xl)] font-black text-white tracking-tighter leading-none"
                                    >
                                        {current.name}
                                    </motion.h1>
                                    <div className="flex items-center gap-4 text-[var(--font-fluid-base)] font-bold text-zinc-500">
                                        <span className="text-brand">@{current.handle}</span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                                        <span>档案库内共 {current.tweets.length} 篇</span>
                                    </div>
                                </div>
                                <div className="w-48 h-20 group relative">
                                    <SmoothTrendChart data={trendData} color="#1d9bf0" />
                                    <div className="absolute top-full right-0 mt-2 text-[10px] font-black text-zinc-700 uppercase tracking-widest group-hover:text-brand transition-colors">生命轨迹 · Momentum</div>
                                </div>
                            </div>

                            {/* Hero Stats Row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">综合质量 · SQI</div>
                                    <div className="text-3xl font-black text-white italic">{current.avgScore}</div>
                                </div>
                                <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">传播指数 · Spread</div>
                                    <div className="text-3xl font-black text-white italic">{(current.totalViews / current.tweets.length / 100).toFixed(1)}</div>
                                </div>
                                <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">爆发力 · Burst</div>
                                    <div className="text-3xl font-black text-white italic">{current.maxHvi}</div>
                                </div>
                                <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-2">
                                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">影响力 · Impact</div>
                                    <div className="text-3xl font-black text-white italic">{(current.totalLikes / 1000).toFixed(1)}K</div>
                                </div>
                            </div>
                        </header>

                        {/* Navigation Tabs */}
                        <div className="flex items-center gap-6 border-b border-white/5 pb-4">
                            {(['persona', 'rhythm', 'semantic', 'sentiment'] as AnalyticsTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={cn("text-[var(--font-fluid-sm)] font-bold uppercase tracking-widest transition-all relative",
                                        activeTab === tab ? "text-white" : "text-zinc-600 hover:text-zinc-400")}
                                >
                                    {tab === 'persona' && '画像概览'}
                                    {tab === 'rhythm' && '发布节律'}
                                    {tab === 'semantic' && '语义图谱'}
                                    {tab === 'sentiment' && '表现数据'}
                                    {activeTab === tab && <motion.div layoutId="tab-underline" className="absolute -bottom-4 left-0 right-0 h-0.5 bg-white rounded-full" />}
                                </button>
                            ))}
                        </div>

                        <div className="min-h-[600px]">
                            <AnimatePresence mode="wait">
                                {activeTab === 'persona' && (
                                    <motion.div key="persona" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                                        {/* AI Persona Banner */}
                                        <div className="relative p-10 rounded-[2.5rem] bg-zinc-900 shadow-2xl border border-white/5 overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-80 h-80 bg-brand/10 rounded-full blur-[100px] -z-10 group-hover:bg-brand/20 transition-all duration-1000" />
                                            <div className="flex gap-10 items-start">
                                                <div className="w-20 h-20 rounded-3xl overflow-hidden border-2 border-brand/20 shadow-2xl shrink-0">
                                                    <img src={current.avatar} className="w-full h-full object-cover" alt={current.name} />
                                                </div>
                                                <div className="space-y-8 flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-[var(--font-fluid-sm)] font-black text-zinc-500 uppercase tracking-[0.3em]">智慧画像 · AI Profile</h3>
                                                        <button
                                                            onClick={() => handleGenerateProfile(current)}
                                                            disabled={analyzing}
                                                            className="text-xs font-bold text-brand hover:brightness-125 transition-all flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand/5 border border-brand/10"
                                                        >
                                                            <RefreshCw size={14} className={analyzing ? "animate-spin" : ""} />
                                                            更新同步
                                                        </button>
                                                    </div>
                                                    {current.aiProfile ? (
                                                        <div className="relative">
                                                            <p className="text-lg text-zinc-200 leading-relaxed font-medium italic indent-4">
                                                                “<TypewriterText text={current.aiProfile.summary} isUpdating={analyzing} />”
                                                            </p>
                                                            <div className="flex flex-wrap gap-4 mt-8">
                                                                {current.aiProfile.keywords.map(kw => (
                                                                    <span key={kw} className="px-5 py-2 rounded-2xl bg-white/5 text-base font-bold text-zinc-400 border border-white/5 hover:border-brand/30 hover:text-white transition-all">
                                                                        #{kw}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center py-10 space-y-6">
                                                            <p className="text-zinc-500 text-sm italic">点击同步按钮，由 AI 挖掘博主的思维基因...</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* DNA Panel */}
                                            <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 space-y-10">
                                                <h4 className="text-[var(--font-fluid-sm)] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-3">
                                                    <Activity size={20} /> 内容基因
                                                </h4>
                                                {viralMetrics && (
                                                    <div className="space-y-8">
                                                        <MetricBar label="视觉资产" value={viralMetrics.mediaRate} icon={Zap} />
                                                        <MetricBar label="文字穿透" value={viralMetrics.textRate} icon={Zap} />
                                                        <MetricBar label="外链分发" value={viralMetrics.linkRate} icon={Zap} />
                                                        <div className="pt-8 border-t border-white/5">
                                                            <div className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-4">主导语义领域</div>
                                                            <div className="inline-block px-6 py-3 rounded-2xl bg-brand/10 border border-brand/20 text-brand font-black text-sm">
                                                                #{viralMetrics.primeCategory}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Hook Library Panel */}
                                            <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 space-y-10">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-[var(--font-fluid-sm)] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-3">
                                                        <Quote size={20} /> 钩子图书馆
                                                    </h4>
                                                </div>
                                                <div className="grid gap-5">
                                                    {current.tweets.slice(0, 5).map((t, i) => (
                                                        <div key={i} className="group p-6 rounded-3xl bg-white/[0.02] hover:bg-brand/5 border border-white/5 hover:border-brand/20 transition-all cursor-default">
                                                            <div className="flex justify-between items-center mb-4">
                                                                <span className="text-[10px] font-black text-zinc-600 group-hover:text-brand transition-colors uppercase tracking-widest">HOOK #{i + 1}</span>
                                                                <span className="px-3 py-1 rounded-full bg-brand/10 text-[10px] font-black text-brand italic">HVI {t.hvi}</span>
                                                            </div>
                                                            <p className="text-[var(--font-fluid-base)] text-zinc-300 leading-relaxed font-medium line-clamp-2">
                                                                {t.text.split('\n')[0]}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'rhythm' && (
                                    <motion.div key="rhythm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-10 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 grid md:grid-cols-2 gap-16">
                                        <div className="space-y-8">
                                            <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">24H 活跃强度分布</div>
                                            <div className="flex items-end justify-between h-40 gap-2 px-4">
                                                {(() => {
                                                    const hours = new Array(24).fill(0);
                                                    current.tweets.forEach(t => hours[new Date(t.savedAt).getHours()]++);
                                                    const max = Math.max(...hours, 1);
                                                    return hours.map((count, h) => (
                                                        <div key={h} className="group relative flex-1 flex flex-col items-center gap-3">
                                                            <div className={cn("w-full rounded-full transition-all bg-white/20 group-hover:bg-white shadow-lg shadow-white/5", count === 0 && "opacity-5")} style={{ height: `${(count / max) * 100}%` }} />
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                            <div className="flex justify-between text-[11px] font-black text-zinc-700 px-4 uppercase tracking-[0.2em]"><span>00h</span><span>12h</span><span>24h</span></div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-6">
                                            <div className="p-8 rounded-[2rem] bg-white/5 border border-white/5 flex flex-col justify-center">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase mb-4 tracking-widest">巅峰活跃时刻</div>
                                                <div className="text-4xl font-black text-white italic tracking-tighter">
                                                    {(() => {
                                                        const hours = new Array(24).fill(0);
                                                        current.tweets.forEach(t => hours[new Date(t.savedAt).getHours()]++);
                                                        return `${hours.indexOf(Math.max(...hours))}:00`;
                                                    })()}
                                                </div>
                                            </div>
                                            <div className="p-8 rounded-[2rem] bg-white/5 border border-white/5 flex flex-col justify-center">
                                                <div className="text-[10px] font-black text-zinc-500 uppercase mb-4 tracking-widest">创作爆发日</div>
                                                <div className="text-2xl font-black text-white italic tracking-tight">
                                                    {(() => {
                                                        const days = new Array(7).fill(0);
                                                        current.tweets.forEach(t => days[new Date(t.savedAt).getDay()]++);
                                                        return ['星期日 · SUNDAY', '星期一 · MONDAY', '星期二 · TUESDAY', '星期三 · WEDNESDAY', '星期四 · THURSDAY', '星期五 · FRIDAY', '星期六 · SATURDAY'][days.indexOf(Math.max(...days))];
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'semantic' && (
                                    <motion.div key="semantic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                                        <div className="flex flex-wrap items-center justify-center gap-8 p-16 rounded-[3rem] bg-zinc-900/30 border border-white/5 min-h-[400px]">
                                            {(() => {
                                                const tags: Record<string, number> = {};
                                                current.tweets.forEach(t => {
                                                    (t.aiTags || []).forEach(tag => tags[tag] = (tags[tag] || 0) + 1);
                                                    if (t.aiCategory) tags[t.aiCategory] = (tags[t.aiCategory] || 0) + 2;
                                                });
                                                const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 30);
                                                const max = Math.max(...Object.values(tags), 1);
                                                return sorted.map(([tag, count], i) => {
                                                    const ratio = count / max;
                                                    return (
                                                        <motion.span
                                                            key={tag}
                                                            initial={{ scale: 0.5, opacity: 0 }}
                                                            animate={{ scale: 1, opacity: 0.4 + ratio * 0.6 }}
                                                            className="font-black tracking-tight cursor-default hover:text-white transition-colors"
                                                            style={{ fontSize: `calc(var(--font-fluid-base) * ${1.2 + ratio * 2})`, color: ratio > 0.6 ? '#fff' : 'rgba(255,255,255,0.4)' }}
                                                        >
                                                            {tag}
                                                        </motion.span>
                                                    );
                                                });
                                            })()}
                                        </div>
                                        <div className="relative p-10 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6 overflow-hidden">
                                            <div className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">深度语义研判</div>
                                            <p className="text-lg text-zinc-100 leading-relaxed font-medium indent-8">
                                                <TypewriterText
                                                    text={current.aiProfile?.semantic || (analyzing ? "" : "该博主的内容结构具有极高的系统性与一致性。语义图谱显示其思维不仅广度惊人，且在核心议题上具有极深的穿透力。关键词之间的关联度反映出一种螺旋上升的逻辑构架，这使得其内容在碎片化的社交媒体环境中依然保持了极强的知识厚度。")}
                                                    isUpdating={analyzing}
                                                />
                                            </p>
                                            {!current.aiProfile?.semantic && !analyzing && (
                                                <div className="flex justify-center mt-4">
                                                    <span className="text-[10px] text-zinc-600 uppercase font-black tracking-widest bg-white/5 px-3 py-1 rounded-full">当前显示为预测模板，点击“更新同步”获取真实研判</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'sentiment' && (
                                    <motion.div key="sentiment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                            <div className="p-10 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 flex flex-col items-center justify-center space-y-4">
                                                <div className="text-7xl font-black text-white tracking-tighter">{current.avgScore}</div>
                                                <div className="text-xs font-black text-zinc-600 uppercase tracking-[0.2em]">质量指数 · SQI</div>
                                            </div>
                                            <div className="md:col-span-2 p-10 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 space-y-8">
                                                <div className="flex justify-between items-end">
                                                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">核心维度看板</h4>
                                                    <div className="text-[10px] font-bold text-zinc-700">基于近 100 篇推文分析</div>
                                                </div>
                                                <div className="grid gap-6">
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                                                            <span>传播指数 (Spread)</span>
                                                            <span className="text-white">{(current.totalViews / current.tweets.length / 100).toFixed(1)}</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full bg-white rounded-full opacity-60" style={{ width: `${Math.min(current.totalViews / current.tweets.length / 500 * 100, 100)}%` }} />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                                                            <span>爆发力 (Burst)</span>
                                                            <span className="text-white">{current.maxHvi}</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full bg-white rounded-full opacity-60" style={{ width: `${current.maxHvi}%` }} />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                                                            <span>稳定度 (Stability)</span>
                                                            <span className="text-white">{(100 - (current.maxHvi - current.avgScore)).toFixed(1)}%</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full bg-white rounded-full opacity-60" style={{ width: `${100 - (current.maxHvi - current.avgScore)}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-10 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 grid md:grid-cols-2 gap-12">
                                            <div className="space-y-6">
                                                <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">情绪调性评价</div>
                                                <div className="relative p-8 rounded-[2rem] bg-white/5 border border-white/5 text-lg font-medium text-zinc-100 italic leading-relaxed overflow-hidden">
                                                    “<TypewriterText
                                                        text={current.aiProfile?.sentiment || (analyzing ? "" : "该创作者在内容输出上表现出极高的克制与客观，其文字基调多为中性偏理智，这种‘冷峻’的输出方式为其建立了个性化的信任护城河。品牌传播层面上，具有极强的颗粒度与话题延续性。")}
                                                        isUpdating={analyzing}
                                                    />”
                                                </div>
                                            </div>
                                            <div className="space-y-8">
                                                <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">内容分布：专业性 vs 日常</div>
                                                <div className="space-y-4">
                                                    <div className="h-5 w-full bg-zinc-800 rounded-full overflow-hidden flex shadow-inner border border-white/5">
                                                        <div className="h-full bg-white opacity-80" style={{ width: '78%' }} />
                                                        <div className="h-full bg-zinc-700 opacity-40" style={{ width: '22%' }} />
                                                    </div>
                                                    <div className="flex justify-between text-[11px] font-black text-zinc-500 uppercase italic tracking-widest">
                                                        <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white" /> Professional 78%</span>
                                                        <span className="flex items-center gap-2">Personal 22% <div className="w-2 h-2 rounded-full bg-zinc-700" /></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center opacity-20"><Zap size={64} /></div>
                )}
            </main>

            {/* === 3. THOUGHT SALON COLUMN (Right) === */}
            <aside
                style={{ width: chatWidth }}
                className="relative flex flex-col shrink-0 bg-zinc-950 border-l border-white/5 z-20 group"
            >
                {/* Resize Handle */}
                <div
                    onMouseDown={startResizing}
                    className="absolute left-0 top-0 bottom-0 w-1 flex items-center justify-center cursor-col-resize hover:bg-white/10 transition-colors z-30"
                >
                    <div className="hidden group-hover:block w-0.5 h-16 bg-zinc-700 rounded-full" />
                </div>

                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] flex items-center gap-3">
                        <Sparkles size={16} /> 思想沙龙
                    </h3>
                    {currentChat.length > 0 && (
                        <button
                            onClick={handleClearChat}
                            className="text-zinc-600 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-500/10"
                            title="清空对话"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>

                <div
                    id="chat-container"
                    className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-12"
                >
                    {currentChat.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-10 space-y-10">
                            <div className="w-20 h-20 rounded-[2.5rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl">
                                <ScanFace size={32} className="text-zinc-300" />
                            </div>
                            <div className="space-y-4">
                                <p className="text-sm font-black text-white uppercase tracking-[0.2em]">研讨模式就绪</p>
                                <p className="text-xs text-zinc-500 leading-relaxed max-w-[240px]">
                                    请在此与博主的 AI 映射进行深度对话。<br />基于其 100+ 篇推文构建的思维模型。
                                </p>
                            </div>
                        </div>
                    ) : (
                        currentChat.map((msg, i) => (
                            <div key={i} className={cn("relative group", msg.role === 'user' ? "flex flex-row-reverse" : "flex flex-row")}>
                                {/* Delete Action Layer */}
                                <div className="absolute inset-y-0 right-0 flex items-center pr-2 z-0">
                                    <button
                                        onClick={() => handleDeleteMessage(i)}
                                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {/* Message Content Layer */}
                                <motion.div
                                    className={cn(
                                        "relative z-10 flex gap-6 w-full bg-zinc-950", // Use solid bg to cover the button
                                        msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                                    )}
                                    drag="x"
                                    dragConstraints={{ left: -60, right: 0 }}
                                    dragElastic={0.1}
                                    dragMomentum={false}
                                    onDragEnd={(_, info) => {
                                        // Optional: Auto-reset if not dragged enough, logic can be handled by constraints mostly
                                    }}
                                >
                                    <div className={cn("w-8 h-8 rounded-lg shrink-0 flex items-center justify-center overflow-hidden border border-white/5",
                                        msg.role === 'user' ? "bg-white text-black text-[10px] font-black uppercase" : "bg-zinc-900")}>
                                        {msg.role === 'user' ? 'YOU' : (
                                            <img src={current?.avatar || ''} className="w-full h-full object-cover opacity-80" alt="AI" />
                                        )}
                                    </div>
                                    <div className={cn("flex-1 text-sm leading-[1.8] font-medium space-y-2 pointer-events-auto", // Ensure text selection still works if needed
                                        msg.role === 'user' ? "text-right text-white" : "text-left text-zinc-300")}>
                                        {msg.role === 'assistant' ? (
                                            msg.content ? (
                                                <MarkdownRenderer content={msg.content} />
                                            ) : (
                                                <div className="flex items-center gap-1 h-6">
                                                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
                                                </div>
                                            )
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                </motion.div>
                            </div>
                        ))
                    )}
                </div>

                {/* Chat Input */}
                <div className="p-8 pb-12">
                    <div className="relative max-w-2xl mx-auto">
                        <textarea
                            rows={1}
                            value={chatQuery}
                            onChange={(e) => setChatQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendChat();
                                }
                            }}
                            placeholder="深度对话..."
                            className="w-full bg-zinc-900 border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-sm text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-white/20 transition-all resize-none overflow-hidden min-h-[56px]"
                            style={{ height: 'auto' }}
                        />
                        <button
                            onClick={handleSendChat}
                            disabled={!chatQuery.trim() || sendingChat}
                            className="absolute right-3 bottom-3 w-10 h-10 flex items-center justify-center rounded-xl bg-white text-black hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-white transition-all shadow-xl"
                        >
                            {sendingChat ? <RefreshCw size={16} className="animate-spin" /> : <ChevronDown size={18} className="-rotate-90" />}
                        </button>
                    </div>
                    <p className="mt-4 text-[10px] text-zinc-700 text-center uppercase tracking-widest font-black">Thought Salon · Powered by Expert DNA</p>
                </div>
            </aside>
        </div>
    );
};

export default AnalyticsView;
