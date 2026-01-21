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
import { useSettingsStore } from '../../shared/store/useSettingsStore';

interface PredictedTweet extends Tweet {
    prediction?: PredictionResult;
}

export const SimulationView: React.FC = () => {
    const { settings } = useSettingsStore();
    const [tweets, setTweets] = useState<PredictedTweet[]>([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState(0);
    const [filter, setFilter] = useState<'all' | 'high' | 'rising'>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);

    const filteredTweets = useMemo(() => {
        if (filter === 'high') return tweets.filter(t => (t.prediction?.totalScore || 0) > 60);
        if (filter === 'rising') return tweets.filter(t => (t.prediction?.signals.velocityScore || 0) > 0.2);
        return tweets;
    }, [tweets, filter]);

    const selectedTweet = useMemo(() => tweets.find(t => t.id === selectedId), [tweets, selectedId]);

    const handleAiAnalyze = async (tweet: PredictedTweet) => {
        if (analyzingId) return;
        setAnalyzingId(tweet.id);
        setAnalyzeError(null);

        try {
            const summary = await predictionService.getUserSummary();
            const aiResult = await predictionService.aiAnalyze(tweet, summary);

            if (aiResult) {
                setTweets(prev => prev.map(t =>
                    t.id === tweet.id ? { ...t, prediction: aiResult } : t
                ));
            } else {
                setAnalyzeError("Analysis returned empty. Check Forecast node settings.");
            }
        } catch (e: any) {
            console.error('[Forecasting] AI Analyze Failed:', e);
            let msg = "AI Service Error";
            if (e.message?.includes('Provider')) msg = "Missing AI Provider Configuration";
            else if (e.message?.includes('Model')) msg = "No Model Selected for Forecast";
            else if (e.message) msg = e.message;
            setAnalyzeError(msg);
        } finally {
            setAnalyzingId(null);
        }
    };

    // Auto-Analyze Effect
    useEffect(() => {
        if (
            selectedTweet &&
            settings.workflowNodes?.forecast?.enabled &&
            selectedTweet.prediction?.source !== 'ai' &&
            !analyzingId &&
            !analyzeError
        ) {
            handleAiAnalyze(selectedTweet);
        }
    }, [selectedId, settings.workflowNodes?.forecast?.enabled]);

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



    return (
        <div className="flex h-screen w-full bg-[#050507] text-zinc-300 overflow-hidden font-sans">
            {/* Main Content: Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* List View */}
                <div className="w-[450px] flex flex-col border-r border-white/5 bg-zinc-900/10 relative">
                    {/* List Header */}
                    <div className="p-4 space-y-4 border-b border-white/5 bg-zinc-900/20 backdrop-blur-sm z-20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                                    <Zap size={16} />
                                </div>
                                <h2 className="text-lg font-black italic tracking-tighter text-white uppercase">{chrome.i18n.getMessage('sim_title')} <span className="text-[10px] not-italic text-zinc-600 ml-1 font-mono">v4.2</span></h2>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={runSimulation}
                                    className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-amber-500 transition-colors"
                                    title={chrome.i18n.getMessage('sim_refresh_tooltip')}
                                >
                                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                                </button>
                                <button
                                    onClick={clearResults}
                                    className="p-2 rounded-lg hover:bg-rose-500/10 text-zinc-500 hover:text-rose-500 transition-colors"
                                    title={chrome.i18n.getMessage('sim_clear_tooltip')}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex p-1 rounded-lg bg-black/40 border border-white/5 gap-1">
                            <SmallTab active={filter === 'all'} onClick={() => setFilter('all')}>
                                <Activity size={12} className="mr-1.5 inline-block" /> {chrome.i18n.getMessage('sim_filter_all')}
                            </SmallTab>
                            <SmallTab active={filter === 'high'} onClick={() => setFilter('high')}>
                                <Radar size={12} className="mr-1.5 inline-block" /> {chrome.i18n.getMessage('sim_filter_high')}
                            </SmallTab>
                            <SmallTab active={filter === 'rising'} onClick={() => setFilter('rising')}>
                                <Globe size={12} className="mr-1.5 inline-block" /> {chrome.i18n.getMessage('sim_filter_rising')}
                            </SmallTab>
                        </div>
                    </div>

                    {/* Infinite List */}
                    <div className="flex-1 overflow-y-auto no-scrollbar px-3 space-y-2 pb-12 pt-2">
                        {loading && (
                            <div className="py-20 flex flex-col items-center gap-4">
                                <Activity size={32} className="text-amber-500 animate-pulse" />
                                <div className="text-[10px] font-black tracking-widest text-zinc-600">{chrome.i18n.getMessage('sim_loading')} {progress}%</div>
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
                <div className="flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_right,#111,transparent)]">
                    <AnimatePresence mode="wait">
                        {selectedTweet ? (
                            <motion.div
                                key={selectedTweet.id}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="h-full flex flex-col p-6 gap-6 overflow-hidden max-h-screen"
                            >
                                {/* 1. Top Section: Header & Core Metrics (Fixed Height) */}
                                <div className="flex-none flex gap-6 h-[100px]">
                                    {/* Big Score Card */}
                                    <div className="w-[180px] bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden group shrink-0">
                                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-50" />
                                        <div className="relative z-10 text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">{chrome.i18n.getMessage('sim_score_label')}</div>
                                        <div className="relative z-10 text-5xl font-black italic text-white tracking-tighter">{selectedTweet.prediction?.totalScore}</div>
                                    </div>

                                    {/* Metrics Grid */}
                                    <div className="flex-1 grid grid-cols-5 gap-3">
                                        <MetricBox label={chrome.i18n.getMessage('sim_metric_semantic')} value={`${((selectedTweet.prediction?.signals.contentSimilarity || 0) * 100).toFixed(0)}%`} icon={<Search size={12} />} />
                                        <MetricBox label={chrome.i18n.getMessage('sim_metric_social')} value={`${((selectedTweet.prediction?.signals.authorAffinity || 0) * 100).toFixed(0)}%`} icon={<Activity size={12} />} />
                                        <MetricBox label={chrome.i18n.getMessage('sim_metric_quality')} value={`${((selectedTweet.prediction?.signals.qualityScore || 0) * 100).toFixed(0)}%`} icon={<Sparkles size={12} />} />
                                        <MetricBox label={chrome.i18n.getMessage('sim_metric_velocity')} value={`${((selectedTweet.prediction?.signals.velocityScore || 0) * 100).toFixed(0)}%`} icon={<TrendingUp size={12} />} />
                                        <MetricBox label={chrome.i18n.getMessage('sim_metric_decay')} value={`-${((1 - (selectedTweet.prediction?.signals.timeDecay || 0)) * 100).toFixed(0)}%`} icon={<ShieldCheck size={12} />} />
                                    </div>
                                </div>

                                {/* 2. Middle Section: Split Content (Flexible Height) */}
                                <div className="flex-1 min-h-0 flex gap-6">
                                    {/* Left: Tweet Card Container */}
                                    <div className="flex-1 min-w-0 bg-white/[0.02] rounded-3xl border border-white/5 flex flex-col overflow-hidden relative">
                                        <div className="flex-none p-3 border-b border-white/5 bg-white/[0.01] text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between items-center">
                                            <span>Source Content</span>
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 rounded-full bg-rose-500/50" />
                                                <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                                                <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                                            <TweetCard tweet={selectedTweet} author={selectedTweet.author as any} mode="masonry" />
                                        </div>
                                    </div>

                                    {/* Right: AI Analysis */}
                                    <div className="flex-1 min-w-0 bg-amber-500/[0.02] border border-amber-500/10 rounded-3xl p-5 relative overflow-hidden flex flex-col">
                                        <div className="flex items-center justify-between text-amber-500 text-[10px] font-black uppercase tracking-widest mb-4 flex-none">
                                            <div className="flex items-center gap-2">
                                                <Info size={14} />
                                                {chrome.i18n.getMessage('sim_narrative_title')}
                                            </div>
                                            <button
                                                onClick={() => handleAiAnalyze(selectedTweet)}
                                                disabled={!!analyzingId}
                                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition-colors disabled:opacity-50 cursor-pointer"
                                                title="Run Deep AI Forecast using configured model"
                                            >
                                                <Sparkles size={10} className={analyzingId === selectedTweet.id ? "animate-spin" : ""} />
                                                <span className="text-[9px]">AI DEEP DIVE</span>
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                            {analyzeError && (
                                                <div className="mb-3 p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                                    <Info size={14} className="shrink-0" />
                                                    {analyzeError}
                                                </div>
                                            )}
                                            <p className="text-lg text-amber-100/90 leading-relaxed font-medium italic">
                                                "{selectedTweet.prediction?.explanation}"
                                            </p>
                                        </div>
                                        <div className="flex-none pt-4 border-t border-amber-500/10 mt-4 flex justify-between items-end">
                                            <div className="text-[9px] text-amber-500/50 font-mono">
                                                {chrome.i18n.getMessage('sim_analyzed_at')} {new Date(selectedTweet.prediction?.analyzedAt || Date.now()).toLocaleTimeString()}
                                            </div>
                                            <Sparkles className="text-amber-500/10 w-12 h-12" />
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Bottom Section: Action Probabilities (Fixed Height) */}
                                <div className="flex-none h-[110px] grid grid-cols-2 gap-6">
                                    {/* Engagement DNA */}
                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col justify-center gap-2">
                                        <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mb-1">{chrome.i18n.getMessage('sim_action_engagement')}</div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <ProgressLine label={chrome.i18n.getMessage('sim_btn_like')} value={selectedTweet.prediction?.components.favoriteProb || 0} color="bg-rose-500" compact />
                                            <ProgressLine label={chrome.i18n.getMessage('sim_btn_reply')} value={selectedTweet.prediction?.components.replyProb || 0} color="bg-blue-500" compact />
                                            <ProgressLine label={chrome.i18n.getMessage('sim_btn_repost')} value={selectedTweet.prediction?.components.repostProb || 0} color="bg-green-500" compact />
                                        </div>
                                    </div>

                                    {/* Depth DNA */}
                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col justify-center gap-2">
                                        <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mb-1">{chrome.i18n.getMessage('sim_action_depth')}</div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <ProgressLine label={chrome.i18n.getMessage('sim_btn_expand')} value={selectedTweet.prediction?.components.clickProb || 0} color="bg-zinc-400" compact />
                                            <ProgressLine label={chrome.i18n.getMessage('sim_btn_profile')} value={selectedTweet.prediction?.components.profileClickProb || 0} color="bg-purple-500" compact />
                                            <ProgressLine label={chrome.i18n.getMessage('sim_btn_share')} value={selectedTweet.prediction?.components.shareProb || 0} color="bg-indigo-500" compact />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-700 opacity-50">
                                <Radar size={64} className="mb-4 animate-spin-slow" />
                                <div className="text-xs font-black uppercase tracking-[0.3em]">{chrome.i18n.getMessage('sim_empty_select')}</div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

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
    const score = tweet.prediction?.totalScore || 0;

    // 分数颜色
    const scoreColor = score >= 80 ? "text-amber-400" : score >= 50 ? "text-blue-400" : "text-zinc-600";
    const bgActive = active ? "bg-white/[0.03]" : "hover:bg-white/[0.01]";
    const isAiAnalyzed = tweet.prediction?.source === 'ai';

    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative flex items-stretch border-b border-white/5 cursor-pointer transition-colors overflow-hidden",
                bgActive
            )}
        >
            {/* Left Score Column */}
            <div className="w-16 flex flex-col items-center justify-center border-r border-white/5 bg-black/20 gap-1">
                <span className={cn("text-2xl font-black italic tracking-tighter font-mono", scoreColor)}>
                    {score}
                </span>
                {isAiAnalyzed && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <Sparkles size={8} className="text-amber-500" />
                        <span className="text-[8px] font-black text-amber-500 uppercase">AI</span>
                    </div>
                )}
            </div>

            {/* Right Info Column */}
            <div className="flex-1 p-3 min-w-0 flex flex-col justify-center gap-1.5 relative">
                {/* Active Scan Line */}
                {active && (
                    <motion.div
                        layoutId="scan-line"
                        className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent pointer-events-none"
                    />
                )}

                {/* Header */}
                <div className="flex items-center gap-2">
                    <img
                        src={avatarUrl}
                        className="w-5 h-5 rounded-full object-cover opacity-70 grayscale group-hover:grayscale-0 transition-all"
                        onError={(e: any) => e.target.src = `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png`}
                    />
                    <span className="text-[13px] font-bold text-zinc-300 truncate max-w-[140px] group-hover:text-amber-100 transition-colors">{author.name}</span>
                    <span className="text-[11px] font-mono text-zinc-600 ml-auto">
                        {tweet.createdAt ? new Date(tweet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                </div>

                {/* Content Snippet */}
                <p className="text-[13px] text-zinc-400 truncate font-medium leading-normal tracking-wide opacity-80 group-hover:opacity-100 transition-opacity">
                    {tweet.aiSummary || tweet.text}
                </p>

                {/* Micro Indicators (RGB Dots) */}
                <div className="flex items-center gap-4 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <MicroDot label="SEM" value={tweet.prediction?.signals.contentSimilarity} color="bg-rose-500" />
                    <MicroDot label="SOC" value={tweet.prediction?.signals.authorAffinity} color="bg-emerald-500" />
                    <MicroDot label="QUAL" value={tweet.prediction?.signals.qualityScore} color="bg-blue-500" />
                </div>
            </div>
        </div>
    );
};

const MicroDot = ({ label, value, color }: any) => (
    <div className="flex items-center gap-1.5" title={`${label}: ${(value * 100).toFixed(0)}%`}>
        <div className={cn("w-2 h-2 rounded-full transition-opacity", value > 0.3 ? color : "bg-zinc-800", value > 0.8 && "shadow-[0_0_8px_currentColor]")} />
        <span className="text-[10px] font-bold text-zinc-500 font-sans tracking-wide">{label}</span>
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

const ProgressLine = ({ label, value, color, compact }: any) => (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
        <div className="flex justify-between text-[9px] font-black text-zinc-500 uppercase tracking-widest">
            <span>{label}</span>
            <span className="font-mono text-white">{(value * 100).toFixed(0)}%</span>
        </div>
        <div className={cn("bg-white/5 rounded-full overflow-hidden", compact ? "h-1" : "h-1.5")}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value * 100}%` }}
                transition={{ duration: 1 }}
                className={cn("h-full shadow-[0_0_10px_rgba(0,0,0,0.5)]", color)}
            />
        </div>
    </div>
);
