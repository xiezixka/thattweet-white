import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../core/storage/db';
import { predictionService } from '../../core/prediction/predictionService';
import { PredictionResult } from '../../core/prediction/types';
import { Tweet } from '../../shared/types/tweet';
import { TweetCard } from '../../shared/components/TweetCard';
import {
    Zap,
    TrendingUp,
    RefreshCw,
    BarChart3,
    Rocket,
    Info,
    Search,
    ChevronRight,
    Activity,
    Radar,
    ShieldCheck,
    Globe,
    Sparkles,
    Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../shared/utils/cn';

interface PredictedTweet extends Tweet {
    prediction?: PredictionResult;
}

export const SimulationView: React.FC = () => {
    const [tweets, setTweets] = useState<PredictedTweet[]>([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState(0);
    const [filter, setFilter] = useState<'all' | 'high' | 'rising'>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const runSimulation = async () => {
        setLoading(true);
        setProgress(0);
        try {
            const allTweets = await db.tweets.orderBy('savedAt').reverse().limit(100).toArray();
            if (allTweets.length === 0) {
                setTweets([]);
                setLoading(false);
                return;
            }
            const summary = await predictionService.getUserSummary();
            const results: PredictedTweet[] = [];
            for (let i = 0; i < allTweets.length; i++) {
                try {
                    const tweet = { ...allTweets[i] } as PredictedTweet;
                    if (typeof tweet.author !== 'object') {
                        const author = await db.users.get(tweet.authorId);
                        tweet.author = author || { id: tweet.authorId, name: tweet.authorName || 'Unknown', handle: tweet.authorId, avatar: tweet.authorAvatarUrl || '', updatedAt: 0 } as any;
                    }
                    const prediction = await predictionService.predict(tweet, summary);
                    results.push({ ...tweet, prediction });
                } catch (err) {
                    console.error(`[Forecasting] Failed predicting ${allTweets[i].id}:`, err);
                }
                setProgress(Math.round(((i + 1) / allTweets.length) * 100));
            }
            results.sort((a, b) => (b.prediction?.totalScore || 0) - (a.prediction?.totalScore || 0));
            setTweets(results);
            if (results.length > 0) setSelectedId(results[0].id);
        } catch (error) {
            console.error('[Forecasting] Critical error:', error);
        } finally {
            setLoading(false);
        }
    };

    const clearResults = () => {
        setTweets([]);
        setSelectedId(null);
    };

    useEffect(() => { runSimulation(); }, []);

    const filteredTweets = useMemo(() => {
        if (filter === 'high') return tweets.filter(t => (t.prediction?.totalScore || 0) > 60);
        if (filter === 'rising') return tweets.filter(t => (t.prediction?.signals.velocityScore || 0) > 0.2);
        return tweets;
    }, [tweets, filter]);

    const selectedTweet = useMemo(() => tweets.find(t => t.id === selectedId), [tweets, selectedId]);

    return (
        <div className="flex h-screen w-full bg-[#050507] text-zinc-300 overflow-hidden font-sans">
            {/* Left Control Bar (Slim) */}
            <div className="w-16 flex flex-col items-center py-6 border-r border-white/5 bg-black/40 gap-8">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                    <Zap size={20} />
                </div>
                <div className="flex flex-col gap-4">
                    <SideIcon
                        icon={<Activity size={20} />}
                        active={filter === 'all'}
                        onClick={() => setFilter('all')}
                        label="全量信号"
                    />
                    <SideIcon
                        icon={<Radar size={20} />}
                        active={filter === 'high'}
                        onClick={() => setFilter('high')}
                        label="高潜挖掘"
                    />
                    <SideIcon
                        icon={<Globe size={20} />}
                        active={filter === 'rising'}
                        onClick={() => setFilter('rising')}
                        label="全网激增"
                    />
                </div>
                <div className="mt-auto flex flex-col gap-4">
                    <button
                        onClick={clearResults}
                        title="清空前瞻"
                        className="w-10 h-10 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 flex items-center justify-center transition-colors text-zinc-600 border border-transparent hover:border-rose-500/20"
                    >
                        <Trash2 size={18} />
                    </button>
                    <button onClick={runSimulation} title="重新分析" className="w-10 h-10 rounded-xl hover:bg-white/5 flex items-center justify-center transition-colors">
                        <RefreshCw size={18} className={loading ? "animate-spin text-amber-500" : "text-zinc-600"} />
                    </button>
                </div>
            </div>

            {/* Main Content: Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* List View */}
                <div className="w-[450px] flex flex-col border-r border-white/5 bg-zinc-900/10 relative">
                    {/* List Header */}
                    <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black italic tracking-tighter text-white uppercase">前瞻 <span className="text-[10px] not-italic text-zinc-600 ml-2 font-mono">v4.2</span></h2>
                            <div className="px-2 py-0.5 rounded-md bg-zinc-800 text-[10px] font-mono text-zinc-500">
                                {filteredTweets.length} SIGNALS
                            </div>
                        </div>

                    </div>

                    {/* Infinite List */}
                    <div className="flex-1 overflow-y-auto no-scrollbar px-3 space-y-2 pb-12">
                        {loading && (
                            <div className="py-20 flex flex-col items-center gap-4">
                                <Activity size={32} className="text-amber-500 animate-pulse" />
                                <div className="text-[10px] font-black tracking-widest text-zinc-600">SCANNING NETWORK... {progress}%</div>
                            </div>
                        )}
                        {!loading && filteredTweets.map((tweet) => (
                            <ForecastItem
                                key={tweet.id}
                                tweet={tweet}
                                active={selectedId === tweet.id}
                                onClick={() => setSelectedId(tweet.id)}
                            />
                        ))}
                    </div>

                    {/* Scan Line effect */}
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-scan z-20 pointer-events-none" />
                </div>

                {/* Detail Insight View */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_top_right,#111,transparent)]">
                    <AnimatePresence mode="wait">
                        {selectedTweet ? (
                            <motion.div
                                key={selectedTweet.id}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="p-10 max-w-4xl mx-auto space-y-10"
                            >
                                {/* Insight Header */}
                                <div className="flex items-start justify-between">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="px-3 py-1 bg-amber-500 text-black text-[10px] font-black rounded-sm skew-x-[-12deg]">
                                                FORECAST SCORE
                                            </div>
                                            <span className="text-5xl font-black italic text-white tracking-widest">{selectedTweet.prediction?.totalScore}</span>
                                        </div>
                                        <h1 className="text-3xl font-black text-white leading-tight">
                                            分析报告：{typeof selectedTweet.author === 'object' ? selectedTweet.author?.name : (selectedTweet.authorName || 'Unknown')} 的趋势信号
                                        </h1>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 text-right">
                                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">趋势评合</div>
                                        <div className={cn(
                                            "text-xs font-black px-3 py-1 rounded-full",
                                            (selectedTweet.prediction?.totalScore || 0) > 80 ? "text-amber-500 bg-amber-500/10 border border-amber-500/20" : "text-zinc-500 bg-zinc-800"
                                        )}>
                                            {(selectedTweet.prediction?.totalScore || 0) > 80 ? 'CRITICAL BURST' : 'NORMAL GROWTH'}
                                        </div>
                                    </div>
                                </div>

                                {/* Deep Stats Grid */}
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                    <MetricBox label="语义匹配" value={`${((selectedTweet.prediction?.signals.contentSimilarity || 0) * 100).toFixed(0)}%`} icon={<Search size={14} />} />
                                    <MetricBox label="社交引力" value={`${((selectedTweet.prediction?.signals.authorAffinity || 0) * 100).toFixed(0)}%`} icon={<Activity size={14} />} />
                                    <MetricBox label="内容质量" value={`${((selectedTweet.prediction?.signals.qualityScore || 0) * 100).toFixed(0)}%`} icon={<Sparkles size={14} />} />
                                    <MetricBox label="爆发速率" value={`${((selectedTweet.prediction?.signals.velocityScore || 0) * 100).toFixed(0)}%`} icon={<TrendingUp size={14} />} />
                                    <MetricBox label="时效衰减" value={`-${((1 - (selectedTweet.prediction?.signals.timeDecay || 0)) * 100).toFixed(0)}%`} icon={<ShieldCheck size={14} />} />
                                </div>

                                {/* The Card Content */}
                                <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-2 hover:border-white/10 transition-colors shadow-2xl">
                                    <TweetCard tweet={selectedTweet} author={selectedTweet.author as any} mode="masonry" />
                                </div>

                                {/* AI Narrative */}
                                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-8 relative overflow-hidden">
                                    <Sparkles className="absolute -right-4 -bottom-4 text-amber-500/10 w-32 h-32" />
                                    <div className="relative z-10 space-y-4">
                                        <div className="flex items-center gap-2 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                                            <Info size={16} />
                                            智能判读 / AI NARRATIVE
                                        </div>
                                        <p className="text-lg text-amber-100/80 leading-relaxed font-medium italic">
                                            "{selectedTweet.prediction?.explanation}"
                                        </p>
                                    </div>
                                </div>

                                {/* Probabilities Breakdown */}
                                <div className="space-y-6">
                                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest">关键动作预测 / ACTION PREDICTION</h3>

                                    {/* 核心互动组 */}
                                    <div className="space-y-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                        <div className="text-[10px] text-zinc-600 font-bold mb-2">交互 (ENGAGEMENT)</div>
                                        <ProgressLine label="可能点赞 / LIKE" value={selectedTweet.prediction?.components.favoriteProb || 0} color="bg-rose-500" />
                                        <ProgressLine label="可能回复 / REPLY" value={selectedTweet.prediction?.components.replyProb || 0} color="bg-blue-500" />
                                        <ProgressLine label="可能转发 / REPOST" value={selectedTweet.prediction?.components.repostProb || 0} color="bg-green-500" />
                                    </div>

                                    {/* 消费与转化组 */}
                                    <div className="space-y-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                        <div className="text-[10px] text-zinc-600 font-bold mb-2">深度 (DEPTH)</div>
                                        <ProgressLine label="查看详情 / EXPAND" value={selectedTweet.prediction?.components.clickProb || 0} color="bg-zinc-400" />
                                        <ProgressLine label="看主页 / PROFILE" value={selectedTweet.prediction?.components.profileClickProb || 0} color="bg-purple-500" />
                                        <ProgressLine label="想分享 / SHARE" value={selectedTweet.prediction?.components.shareProb || 0} color="bg-indigo-500" />
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-700 opacity-50">
                                <Radar size={64} className="mb-4 animate-spin-slow" />
                                <div className="text-xs font-black uppercase tracking-[0.3em]">Select a signal to analyze</div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

const SideIcon = ({ icon, active, onClick, label }: any) => (
    <div
        onClick={onClick}
        title={label}
        className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:bg-white/10 relative group",
            active ? "text-amber-500 bg-amber-500/10 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]" : "text-zinc-600"
        )}
    >
        {icon}
        {active && <motion.div layoutId="activeSide" className="absolute -left-1 w-1 h-4 bg-amber-500 rounded-full" />}
    </div>
);

const SmallTab = ({ active, onClick, children }: any) => (
    <button
        onClick={onClick}
        className={cn(
            "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
            active ? "bg-zinc-800 text-amber-400 shadow-xl" : "text-zinc-600 hover:text-zinc-400"
        )}
    >
        {children}
    </button>
);

const ForecastItem = ({ tweet, active, onClick }: any) => {
    const author = (typeof tweet.author === 'object' && tweet.author !== null)
        ? tweet.author
        : { name: tweet.authorName || 'Unknown', handle: tweet.authorId, avatar: '' };

    const authorHandle = author.handle;
    const avatarUrl = author.avatar || `https://unavatar.io/x/${authorHandle}`;

    return (
        <div
            onClick={onClick}
            className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden",
                active
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-white/[0.01] border-white/5 hover:bg-white/[0.03] hover:border-white/10"
            )}
        >
            <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden bg-zinc-900 flex-shrink-0">
                        <img
                            src={avatarUrl}
                            className="w-full h-full object-cover"
                            alt=""
                            onError={(e: any) => {
                                e.target.src = `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png`;
                            }}
                        />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[11px] font-black text-white truncate max-w-[150px]">{author.name}</div>
                        <div className="text-[9px] font-mono text-zinc-500 truncate lowercase">@{authorHandle}</div>
                    </div>
                </div>
                <div className={cn(
                    "font-mono font-black italic text-lg leading-none",
                    active ? "text-amber-400" : (tweet.prediction?.totalScore > 80 ? "text-amber-500" : "text-zinc-600")
                )}>
                    {tweet.prediction?.totalScore}
                </div>
            </div>
            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed mb-3 relative z-10 group-hover:text-zinc-300 transition-colors">
                {tweet.text}
            </p>
            <div className="flex gap-4 relative z-10">
                <MiniIndicator label="SEM" value={tweet.prediction?.signals.contentSimilarity} />
                <MiniIndicator label="AFF" value={tweet.prediction?.signals.authorAffinity} />
                <MiniIndicator label="VEL" value={tweet.prediction?.signals.velocityScore} />
            </div>
            {active && (
                <div className="absolute top-0 right-0 p-2 text-amber-500/20">
                    <ChevronRight size={16} />
                </div>
            )}
        </div>
    );
};

const MiniIndicator = ({ label, value }: any) => (
    <div className="flex items-center gap-1.5">
        <span className="text-[7px] font-black text-zinc-700 tracking-tighter">{label}</span>
        <div className="w-10 h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-600" style={{ width: `${value * 100}%` }} />
        </div>
    </div>
);

const MetricBox = ({ label, value, icon }: any) => (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-1 hover:border-white/10 transition-colors">
        <div className="flex items-center gap-2 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
            {icon}
            {label}
        </div>
        <div className="text-xl font-black text-white font-mono">{value}</div>
    </div>
);

const ProgressLine = ({ label, value, color }: any) => (
    <div className="space-y-1.5">
        <div className="flex justify-between text-[9px] font-black text-zinc-500 uppercase tracking-widest">
            <span>{label}</span>
            <span className="font-mono text-white">{(value * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value * 100}%` }}
                transition={{ duration: 1 }}
                className={cn("h-full shadow-[0_0_10px_rgba(0,0,0,0.5)]", color)}
            />
        </div>
    </div>
);
