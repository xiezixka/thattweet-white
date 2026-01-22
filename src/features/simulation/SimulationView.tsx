import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../core/storage/db';
import { predictionService } from '../../core/prediction/predictionService';
import { PredictionResult } from '../../core/prediction/types';
import { Tweet, TweetWithUser } from '../../shared/types/tweet';
import { TweetCard } from '../../shared/components/TweetCard';
import { TweetRepository } from '../../core/storage/TweetRepository';
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
    Trash2,
    ExternalLink,
    Activity as Pulse
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../shared/utils/cn';
import { useSettingsStore } from '../../shared/store/useSettingsStore';
import { TrendChart } from '../../shared/components/TrendChart';

interface PredictedTweet extends TweetWithUser {
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
    const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);

    const filteredTweets = useMemo(() => {
        if (filter === 'high') return tweets.filter(t => (t.prediction?.totalScore || 0) > 60);
        if (filter === 'rising') return tweets.filter(t => (t.prediction?.signals.velocityScore || 0) > 0.2);
        return tweets;
    }, [tweets, filter]);

    const selectedTweet = useMemo(() => tweets.find(t => t.id === selectedId), [tweets, selectedId]);

    // handleBatchAnalyze removed as per user request

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

    // Auto-Analyze Disabled: Only manual trigger from UI
    useEffect(() => {
        // We no longer trigger handleAiAnalyze automatically.
    }, [selectedId]);

    const runSimulation = async () => {
        setLoading(true);
        setProgress(0);
        try {
            const resultsWithUser = await TweetRepository.getPagedTweets(0, 100);
            if (resultsWithUser.length === 0) {
                setTweets([]);
                setLoading(false);
                return;
            }
            const summary = await predictionService.getUserSummary();
            const results: PredictedTweet[] = [];
            for (let i = 0; i < resultsWithUser.length; i++) {
                try {
                    const tweet = resultsWithUser[i] as PredictedTweet;
                    let prediction;
                    // 如果已经有 AI 深度分析的结果，则保留 AI 结果，不再被本地预测覆盖
                    if (tweet.prediction?.source === 'ai') {
                        prediction = tweet.prediction;
                        // 补充：可以在这里调用一个轻量级的方法更新时间衰减，但保持 AI 的核心评价不变
                    } else {
                        prediction = await predictionService.predict(tweet, summary);
                    }
                    results.push({ ...tweet, prediction });
                } catch (err) {
                    console.error(`[Forecasting] Failed predicting tweet:`, err);
                }
                setProgress(Math.round(((i + 1) / resultsWithUser.length) * 100));
            }
            results.sort((a, b) => {
                // 排序优先级：
                // 1. 已进行 AI Deep Dive 的结果 (Source: ai)
                // 2. 采集时由 AI textAnalysis 生成的 aiScore (卡片生成时的数值)
                // 3. 本地启发式引擎生成的预测分 (Source: local)
                const getScore = (t: PredictedTweet) => {
                    if (t.prediction?.source === 'ai') return t.prediction.totalScore;
                    return t.aiScore || t.prediction?.totalScore || 0;
                };
                return getScore(b) - getScore(a);
            });
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
                <div className="w-[320px] flex flex-col border-r border-white/5 bg-zinc-900/10 relative shrink-0">
                    {/* List Header */}
                    <div className="p-4 space-y-4 border-b border-white/5 bg-zinc-900/20 backdrop-blur-sm z-20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
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
                        {!loading && filteredTweets.map((tweet, index) => (
                            <ForecastItem
                                key={tweet.id}
                                tweet={tweet}
                                index={index}
                                active={selectedId === tweet.id}
                                onClick={() => setSelectedId(tweet.id)}
                            />
                        ))}
                        {!loading && filteredTweets.length === 0 && (
                            <div className="py-20 text-center">
                                <div className="text-[10px] font-black text-zinc-700 uppercase tracking-widest italic opacity-50">No Data Captured</div>
                            </div>
                        )}
                    </div>

                    {/* Scan Line effect */}
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-scan z-20 pointer-events-none" />
                </div>

                {/* Detail Insight View */}
                <div className="flex-1 overflow-hidden bg-[#050507] relative">
                    {/* Background Grid Decoration */}
                    <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
                        style={{
                            backgroundImage: `
                                radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0),
                                linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
                                linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)
                            `,
                            backgroundSize: '24px 24px, 120px 120px, 120px 120px'
                        }} />

                    <AnimatePresence mode="wait">
                        {selectedTweet ? (
                            <motion.div
                                key={selectedTweet.id}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="h-full flex flex-col p-6 gap-6 overflow-hidden max-h-screen"
                            >
                                {/* 1. New Compact Top Metrics Bar (Glassmorphic) */}
                                <div className="flex-none flex items-stretch gap-px bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden backdrop-blur-md h-16">
                                    {/* Score Card */}
                                    <div className="w-[100px] flex flex-col items-center justify-center relative bg-white/[0.02] group shrink-0 border-r border-white/5">
                                        <div className="text-[8px] font-black text-amber-500/50 uppercase tracking-widest mb-0.5">{chrome.i18n.getMessage('sim_score_label')}</div>
                                        <div className="text-3xl font-black italic text-white tracking-tighter leading-none">{selectedTweet.prediction?.totalScore || selectedTweet.aiScore || 0}</div>

                                        {/* Rank decoration */}
                                        <div className="absolute top-1 right-1 text-[6px] font-mono text-white/10 uppercase">Index.v4</div>
                                    </div>

                                    {/* Metrics Flow */}
                                    <div className="flex-1 flex px-6 items-center justify-between gap-8 overflow-hidden bg-black/20">
                                        <SlimMetric label={chrome.i18n.getMessage('sim_metric_semantic_short')} value={`${((selectedTweet.prediction?.signals.contentSimilarity || 0) * 100).toFixed(0)}%`} color="text-rose-400" />
                                        <SlimMetric label={chrome.i18n.getMessage('sim_metric_social_short')} value={`${((selectedTweet.prediction?.signals.authorAffinity || 0) * 100).toFixed(0)}%`} color="text-emerald-400" />
                                        <SlimMetric label={chrome.i18n.getMessage('sim_metric_quality_short')} value={`${((selectedTweet.prediction?.signals.qualityScore || 0) * 100).toFixed(0)}%`} color="text-blue-400" />
                                        <SlimMetric label={chrome.i18n.getMessage('sim_metric_velocity_short')} value={`${((selectedTweet.prediction?.signals.velocityScore || 0) * 100).toFixed(0)}%`} icon={<TrendingUp size={10} />} color="text-amber-400" />
                                        <SlimMetric label={chrome.i18n.getMessage('sim_metric_decay_short')} value={`-${((1 - (selectedTweet.prediction?.signals.timeDecay || 0)) * 100).toFixed(0)}%`} color="text-zinc-500" />
                                    </div>

                                    {/* Deep Dive Action */}
                                    <div className="w-[120px] flex items-center justify-center p-3">
                                        <button
                                            onClick={() => handleAiAnalyze(selectedTweet)}
                                            disabled={!!analyzingId}
                                            className="w-full h-full flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black font-black transition-all disabled:opacity-30 border border-amber-500/20 active:scale-95 group"
                                        >
                                            <Sparkles size={12} className={analyzingId === selectedTweet.id ? "animate-spin" : "group-hover:animate-pulse"} />
                                            <span className="text-[10px] tracking-tight">{chrome.i18n.getMessage('sim_btn_analyze')}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 2. Main Work Area: Side-by-Side Split */}
                                <div className="flex-1 min-h-0 flex gap-6">
                                    {/* Left Partition (30%): Content Blueprint & DNA */}
                                    <div className="w-[300px] flex flex-col gap-6 shrink-0 overflow-y-auto no-scrollbar">
                                        {/* Source Snapshot */}
                                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                                            <div className="px-4 py-2 bg-white/[0.03] border-b border-white/5 text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                                                <span>{chrome.i18n.getMessage('sim_section_snapshot')}</span>
                                                <div className="flex gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                                                </div>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={
                                                            selectedTweet.author?.avatar ||
                                                            selectedTweet.authorAvatarUrl ||
                                                            `https://unavatar.io/x/${selectedTweet.author?.handle || selectedTweet.authorId}`
                                                        }
                                                        className="w-8 h-8 rounded-full border border-white/10 object-cover shadow-lg shadow-black/50"
                                                        onError={(e: any) => e.target.src = `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png`}
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="text-[11px] font-black text-white truncate tracking-tight uppercase">{selectedTweet.author?.name || selectedTweet.authorName || 'UNKNOWN'}</div>
                                                        <div className="text-[9px] font-mono text-zinc-500 leading-none">@{selectedTweet.author?.handle || selectedTweet.authorId}</div>
                                                    </div>
                                                </div>
                                                <p className="text-[12px] text-zinc-400 leading-relaxed line-clamp-[6] font-medium tracking-tight">
                                                    {selectedTweet.text}
                                                </p>

                                                {/* Micro Metrics Tray */}
                                                <div className="flex items-center gap-4 py-2 border-y border-white/5 opacity-60">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-zinc-600 uppercase">{chrome.i18n.getMessage('sim_metric_views')}</span>
                                                        <span className="text-[11px] font-black font-mono text-zinc-300">{(selectedTweet.viewCount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-zinc-600 uppercase">{chrome.i18n.getMessage('sim_metric_likes')}</span>
                                                        <span className="text-[11px] font-black font-mono text-amber-500/80">{(selectedTweet.favoriteCount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-zinc-600 uppercase">{chrome.i18n.getMessage('sim_metric_rts')}</span>
                                                        <span className="text-[11px] font-black font-mono text-zinc-300">{(selectedTweet.retweetCount || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-zinc-600 uppercase">{chrome.i18n.getMessage('sim_metric_reps')}</span>
                                                        <span className="text-[11px] font-black font-mono text-zinc-300">{(selectedTweet.replyCount || 0).toLocaleString()}</span>
                                                    </div>
                                                </div>

                                                {selectedTweet.media && selectedTweet.media.length > 0 && (
                                                    <div className={cn(
                                                        "grid gap-1 mt-2",
                                                        selectedTweet.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
                                                    )}>
                                                        {selectedTweet.media.slice(0, 4).map((m, i) => (
                                                            <div key={i} className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/5 shadow-inner">
                                                                <img src={m.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-pointer" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Content DNA Section (The "Symmetric" Essence) */}
                                        <div className="bg-zinc-900/10 border border-white/5 rounded-2xl p-5 space-y-4 shadow-xl">
                                            <div className="flex items-center gap-2 text-[9px] font-black text-rose-500/80 uppercase tracking-[0.2em]">
                                                <Search size={10} />
                                                {chrome.i18n.getMessage('sim_section_semantic')}
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <div className="text-[8px] font-black text-zinc-600 uppercase mb-1 tracking-widest">{chrome.i18n.getMessage('sim_label_core_narrative')}</div>
                                                    <p className="text-[12px] text-zinc-400 leading-relaxed font-medium">
                                                        {selectedTweet.aiReason || chrome.i18n.getMessage('sim_label_awaiting_insight')}
                                                    </p>
                                                </div>

                                                {selectedTweet.aiSummary && (
                                                    <div>
                                                        <div className="text-[8px] font-black text-zinc-600 uppercase mb-1 tracking-widest">{chrome.i18n.getMessage('sim_label_condensed_logic')}</div>
                                                        <p className="text-[11px] text-zinc-500 leading-normal italic">
                                                            "{selectedTweet.aiSummary}"
                                                        </p>
                                                    </div>
                                                )}

                                                {selectedTweet.visionDescription && (
                                                    <div className="pt-2 border-t border-white/5">
                                                        <div className="text-[8px] font-black text-zinc-600 uppercase mb-1 tracking-widest">{chrome.i18n.getMessage('sim_label_visual_context')}</div>
                                                        <p className="text-[11px] text-zinc-500 line-clamp-3 leading-relaxed">
                                                            {selectedTweet.visionDescription}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {selectedTweet.aiCategory && (
                                                <div className="mt-2 flex">
                                                    <div className="px-2 py-0.5 rounded-sm bg-rose-500/5 text-[8px] font-black text-rose-500/60 uppercase tracking-wider border border-rose-500/10">
                                                        {selectedTweet.aiCategory}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Partition (Flexible): Narrative & Matrix */}
                                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto no-scrollbar">
                                        {/* Strategic Trajectory Verdict (The Hero) */}
                                        <div className="bg-amber-500/[0.02] border border-white/5 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-center min-h-[140px] shrink-0 group transition-all hover:bg-amber-500/[0.04] shadow-2xl">
                                            {/* Decorative Elements */}
                                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/20" />
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[60px] pointer-events-none" />
                                            <div className="absolute -top-10 -right-10 blur-3xl opacity-[0.05] group-hover:opacity-[0.1] transition-opacity">
                                                <Zap size={240} className="text-amber-500" />
                                            </div>

                                            {/* Corner Accents */}
                                            <div className="absolute top-2 right-2 flex gap-1 group-hover:gap-1.5 transition-all">
                                                <div className="w-1 h-1 bg-amber-500/20 rounded-full" />
                                                <div className="w-1 h-1 bg-amber-500/40 rounded-full" />
                                                <div className="w-1 h-1 bg-amber-500/60 rounded-full" />
                                            </div>

                                            <div className="text-[8px] font-black text-amber-500/40 uppercase tracking-[0.4em] mb-3 flex items-center gap-2">
                                                <Zap size={8} /> {chrome.i18n.getMessage('sim_verdict_title')}
                                                <div className="h-px flex-1 bg-amber-500/10 ml-2" />
                                            </div>

                                            <p className="text-xl font-black italic text-zinc-100 leading-relaxed tracking-tight relative z-10 drop-shadow-2xl">
                                                "{selectedTweet.prediction?.explanation || chrome.i18n.getMessage('sim_verdict_awaiting')}"
                                            </p>

                                            <div className="mt-4 flex items-center gap-4 relative z-10 opacity-40 group-hover:opacity-100 transition-opacity">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[7px] font-black text-amber-500/50 uppercase tracking-widest leading-none">Confidence Matrix</span>
                                                    <div className="w-32 h-0.5 bg-white/5 rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${(selectedTweet.prediction?.totalScore || 0)}%` }}
                                                            className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="text-[9px] font-mono text-white/20 uppercase tracking-tighter">
                                                    P-Value: {((selectedTweet.prediction?.totalScore || 0) / 100).toFixed(4)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chart Matrix */}
                                        <div className="flex-1 bg-white/[0.01] border border-white/5 rounded-3xl p-6 flex flex-col min-h-[500px]">
                                            <div className="flex justify-between items-center mb-6 px-2 shrink-0">
                                                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                                    <Pulse size={12} className="text-amber-500" />
                                                    {chrome.i18n.getMessage('sim_matrix_title')}
                                                </h3>
                                                <div className="flex items-center gap-4 text-[9px] font-black uppercase text-zinc-600 tracking-tighter">
                                                    <div className="flex items-center gap-1.5"><div className="w-3 h-[1px] bg-amber-500" /> <span>{chrome.i18n.getMessage('sim_matrix_actual')}</span></div>
                                                    <div className="flex items-center gap-1.5"><div className="w-3 h-[1px] border-t border-dashed border-zinc-600" /> <span>{chrome.i18n.getMessage('sim_matrix_ai')}</span></div>
                                                </div>
                                            </div>

                                            <div className="w-full h-[500px] relative">
                                                <TrendChart
                                                    key={`${selectedTweet.id}-${selectedTweet.prediction?.source || 'local'}`}
                                                    history={selectedTweet.metricsHistory}
                                                    prediction={selectedTweet.prediction}
                                                    createdAt={selectedTweet.createdAt}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-none pt-4 border-t border-amber-500/10 mt-4 flex justify-between items-end">
                                    <div className="text-[9px] text-amber-500/50 font-mono">
                                        {chrome.i18n.getMessage('sim_analyzed_at')} {new Date(selectedTweet.prediction?.analyzedAt || Date.now()).toLocaleTimeString()}
                                    </div>
                                    <Sparkles className="text-amber-500/10 w-12 h-12" />
                                </div>

                                {/* 3. Bottom Section: Action Probabilities (Fixed Height) */}
                                <div className="flex-none h-[110px] grid grid-cols-2 gap-6 mt-6">
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
                                            <ProgressLine label={chrome.i18n.getMessage('sim_btn_profile')} value={(selectedTweet.prediction?.components as any)?.profileClickProb || 0} color="bg-purple-500" compact />
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

const ForecastItem = ({ tweet, index, active, onClick }: any) => {
    const author = (typeof tweet.author === 'object' && tweet.author !== null)
        ? tweet.author
        : { name: tweet.authorName || 'Unknown', handle: tweet.authorId, avatar: '' };

    const avatarUrl = author.avatar || tweet.authorAvatarUrl || `https://unavatar.io/x/${author.handle || tweet.authorId}`;

    // 优先显示初始 AI 评分，如果 Deep Dive 跑完则使用最终总分
    const score = (tweet.prediction?.source === 'ai')
        ? tweet.prediction.totalScore
        : (tweet.aiScore || tweet.prediction?.totalScore || 0);

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
            {/* Left Rank & Score Column */}
            <div className="w-14 flex flex-col items-center justify-center border-r border-white/5 bg-black/40 py-2 gap-0.5 shrink-0">
                <span className="text-[9px] font-mono text-zinc-700 font-bold leading-none mb-1">#{index + 1}</span>
                <span className={cn("text-xl font-black italic tracking-tighter font-mono leading-none", scoreColor)}>
                    {score}
                </span>
                {isAiAnalyzed && (
                    <div className="mt-1 flex items-center justify-center w-full">
                        <div className="px-1 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 scale-[0.8]">
                            <Sparkles size={6} className="text-amber-500" />
                        </div>
                    </div>
                )}
            </div>

            {/* Right Info Column */}
            <div className="flex-1 p-2.5 min-w-0 flex flex-col justify-center gap-1 relative overflow-hidden">
                {/* Active Scan Line */}
                {active && (
                    <motion.div
                        layoutId="scan-line"
                        className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent pointer-events-none"
                    />
                )}

                {/* Header */}
                <div className="flex items-center gap-1.5">
                    <img
                        src={avatarUrl}
                        className="w-4 h-4 rounded-full object-cover opacity-60 grayscale group-hover:grayscale-0 transition-all shrink-0"
                        onError={(e: any) => e.target.src = `https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png`}
                    />
                    <span className="text-[11px] font-bold text-zinc-400 truncate max-w-[100px] group-hover:text-amber-100/80 transition-colors uppercase tracking-tight">{author.name}</span>
                    <span className="text-[10px] font-mono text-zinc-800 ml-auto group-hover:text-zinc-600 transition-colors shrink-0">
                        {tweet.createdAt ? new Date(tweet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                </div>

                {/* Content Snippet */}
                <p className="text-[11px] text-zinc-500 truncate font-semibold leading-tight tracking-tight opacity-70 group-hover:opacity-100 transition-opacity">
                    {tweet.aiSummary || tweet.text}
                </p>

                {/* Micro Indicators (RGB Dots) */}
                <div className="flex items-center gap-2.5 mt-0.5 opacity-40 group-hover:opacity-80 transition-opacity">
                    <MicroDot label="SEM" value={tweet.prediction?.signals.contentSimilarity} color="bg-rose-500/80" />
                    <MicroDot label="SOC" value={tweet.prediction?.signals.authorAffinity} color="bg-emerald-500/80" />
                    <MicroDot label="QUAL" value={tweet.prediction?.signals.qualityScore} color="bg-blue-500/80" />
                </div>
            </div>
        </div>
    );
};

const MicroDot = ({ label, value, color }: any) => (
    <div className="flex items-center gap-1" title={`${label}: ${(value * 100).toFixed(0)}%`}>
        <div className={cn("w-1.5 h-1.5 rounded-full transition-opacity", value > 0.3 ? color : "bg-zinc-800", value > 0.8 && "shadow-[0_0_5px_currentColor]")} />
        <span className="text-[8px] font-black text-zinc-600 font-sans tracking-tight leading-none">{label}</span>
    </div>
);

const SlimMetric = ({ label, value, color }: any) => (
    <div className="flex flex-col gap-0.5 group cursor-default">
        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest group-hover:text-zinc-500 transition-colors">{label}</span>
        <div className={cn("text-2xl font-black font-mono leading-none tracking-tighter", color)}>{value}</div>
    </div>
);

const MetricBox = ({ label, value, icon, color }: any) => (
    <div className="bg-zinc-950/40 border border-white/5 rounded-2xl p-3 flex flex-col gap-0.5 hover:border-white/10 transition-all hover:bg-zinc-950/60 group">
        <div className="flex items-center gap-1.5 text-[8px] font-black text-zinc-600 uppercase tracking-widest group-hover:text-zinc-500 transition-colors">
            <span className="opacity-50">{icon}</span>
            {label}
        </div>
        <div className={cn("text-lg font-black font-mono leading-none mt-0.5", color || "text-white")}>{value}</div>
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
