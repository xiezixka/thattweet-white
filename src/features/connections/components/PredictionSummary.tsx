import React, { useEffect, useState, useMemo } from 'react';
import { predictionService } from '../../../core/prediction/predictionService';
import { PredictionResult } from '../../../core/prediction/types';
import { Tweet } from '../../../shared/types/tweet';
import { Sparkles, TrendingUp, Heart, MessageSquare, Info, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore } from '../../../shared/store/useUIStore';

interface Props {
    tweet: Tweet;
}

export const PredictionSummary: React.FC<Props> = ({ tweet }) => {
    const [result, setResult] = useState<PredictionResult | null>(null);
    const [loading, setLoading] = useState(true);
    const { setActiveView } = useUIStore();

    useEffect(() => {
        let isMounted = true;
        const runPrediction = async () => {
            setLoading(true);
            try {
                const summary = await predictionService.getUserSummary();
                const res = await predictionService.predict(tweet, summary);
                if (isMounted) {
                    setResult(res);
                }
            } catch (error) {
                console.error('[PredictionSummary] Failed to run prediction:', error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        runPrediction();
        return () => { isMounted = false; };
    }, [tweet.id]);

    if (loading) {
        return (
            <div className="bg-blue-500/5 rounded-2xl p-6 border border-blue-500/10 animate-pulse">
                <div className="h-4 bg-blue-500/10 rounded w-1/3 mb-4" />
                <div className="h-20 bg-blue-500/5 rounded mb-4" />
                <div className="grid grid-cols-3 gap-2">
                    <div className="h-12 bg-blue-500/10 rounded" />
                    <div className="h-12 bg-blue-500/10 rounded" />
                    <div className="h-12 bg-blue-500/10 rounded" />
                </div>
            </div>
        );
    }

    if (!result) return null;

    const getScoreColor = (score: number) => {
        if (score > 80) return 'text-yellow-400';
        if (score > 50) return 'text-blue-400';
        return 'text-zinc-500';
    };

    return (
        <div className="bg-blue-500/5 rounded-2xl p-6 border border-blue-500/20 space-y-5 relative overflow-hidden group">
            {/* Background Glow */}
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 blur-3xl rounded-full group-hover:bg-blue-500/20 transition-colors" />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div
                    className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
                    onClick={() => setActiveView('simulation')}
                >
                    <Sparkles size={16} className="text-blue-400" />
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                        X-Algorithm Forecasting
                        <ArrowUpRight size={10} />
                    </span>
                </div>
                <div className={`text-2xl font-black font-mono ${getScoreColor(result.totalScore)}`}>
                    {result.totalScore}
                    <span className="text-xs opacity-50 ml-1">pts</span>
                </div>
            </div>

            {/* Probability Bars */}
            <div className="space-y-3">
                <ProbBar
                    label="P(Favorite)"
                    value={result.components.favoriteProb}
                    icon={<Heart size={12} />}
                    color="bg-rose-500"
                />
                <ProbBar
                    label="P(Reply)"
                    value={result.components.replyProb}
                    icon={<MessageSquare size={12} />}
                    color="bg-blue-500"
                />
                <ProbBar
                    label="P(Viral)"
                    value={result.components.repostProb}
                    icon={<TrendingUp size={12} />}
                    color="bg-emerald-500"
                />
            </div>

            {/* Explanation */}
            <div className="pt-2">
                <div className="text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                    <Info size={10} />
                    AI INSIGHT
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed font-light italic">
                    "{result.explanation}"
                </p>
            </div>

            {/* Signals Badges */}
            <div className="flex flex-wrap gap-2 pt-1">
                {result.signals.contentSimilarity > 0.7 && (
                    <Badge label="Semantically Matched" color="text-yellow-500/80" />
                )}
                {result.signals.authorAffinity > 0.6 && (
                    <Badge label="Strong Relation" color="text-blue-500/80" />
                )}
                {result.signals.velocityScore > 0.5 && (
                    <Badge label="Fast Growing" color="text-emerald-500/80" />
                )}
            </div>
        </div>
    );
};

const ProbBar = ({ label, value, icon, color }: any) => (
    <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] uppercase font-bold tracking-tighter">
            <div className="flex items-center gap-1.5 text-zinc-400">
                {icon}
                {label}
            </div>
            <span className="text-zinc-500 font-mono">{(value * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value * 100}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full ${color}`}
            />
        </div>
    </div>
);

const Badge = ({ label, color }: any) => (
    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-white/5 border border-white/5 ${color}`}>
        {label}
    </span>
);
