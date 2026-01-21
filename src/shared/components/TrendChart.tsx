import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MetricSnapshot } from '../types/tweet';
import { PredictionResult } from '../../core/prediction/types';

interface TrendChartProps {
    history?: MetricSnapshot[];
    prediction?: PredictionResult;
    className?: string;
    createdAt?: string | number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-950/95 border border-white/10 p-3 rounded-lg backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
                <p className="text-zinc-400 text-[10px] mb-2 font-black uppercase tracking-widest">{label}</p>
                <div className="space-y-1.5">
                    {payload.map((entry: any) => (
                        <div key={entry.name} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]" style={{ backgroundColor: entry.color, color: entry.color }} />
                                <span className="text-[10px] font-bold text-white/60 uppercase">{entry.name}</span>
                            </div>
                            <span className="text-[11px] font-black text-white font-mono tabular-nums">{entry.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                {payload[0].payload.isFuture && (
                    <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-center gap-2">
                        <div className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
                        <span className="text-[9px] text-amber-500 font-black uppercase tracking-tighter">AI Organic Simulation</span>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

export const TrendChart: React.FC<TrendChartProps> = ({
    history = [],
    prediction,
    className,
    createdAt
}) => {
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        const timer = setTimeout(() => setIsMounted(true), 150);
        return () => clearTimeout(timer);
    }, []);

    const data = useMemo(() => {
        const now = Date.now();
        const startTs = createdAt ? new Date(createdAt).getTime() : (history[0]?.capturedAt || now - 3600000);

        // 1. 历史实绩 (Real Stats)
        const chartData = (history || []).map(h => ({
            ts: h.capturedAt,
            displayTime: new Date(h.capturedAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + ' ' + new Date(h.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            likes: h.favoriteCount,
            views: h.viewCount,
            retweets: h.retweetCount,
            replies: h.replyCount,
            isFuture: false
        })).sort((a, b) => a.ts - b.ts);

        if (chartData.length === 0) {
            chartData.push({
                ts: startTs,
                displayTime: 'Start',
                likes: 0, views: 0, retweets: 0, replies: 0, isFuture: false
            });
        }

        // 2. AI 30天逐日模拟 (AI 30-Day Daily Simulation - Cumulative)
        if (prediction?.dailySimulation && prediction.dailySimulation.length > 0) {
            const dayMs = 24 * 3600000;
            prediction.dailySimulation.forEach(sim => {
                chartData.push({
                    ts: now + sim.day * dayMs,
                    displayTime: `Day ${sim.day}`,
                    likes: sim.likes,
                    views: sim.views,
                    retweets: sim.retweets,
                    replies: sim.replies,
                    isFuture: true
                });
            });
        }

        return chartData;
    }, [history, prediction, createdAt]);

    if (!data || data.length < 2 || !isMounted) {
        return <div className="h-[430px] w-full flex items-center justify-center text-zinc-800 text-[10px] font-black uppercase tracking-[0.3em]">Syncing Matrix...</div>;
    }

    return (
        <div className={`flex flex-col gap-8 w-full min-w-0 overflow-hidden ${className}`}>
            {/* Chart 1: Engagement Matrix (Likes, RTs, Replies) */}
            <div className="relative h-[185px] w-full min-w-0 bg-zinc-950/40 rounded-2xl border border-white/5 p-4 shadow-2xl backdrop-blur-sm overflow-hidden">
                <div className="absolute top-2 left-4 z-20 flex items-center gap-3 bg-zinc-950/80 px-2 py-1 rounded-md border border-white/10 backdrop-blur-md">
                    <h4 className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Engagement DNA</h4>
                    <div className="flex gap-2">
                        <LegendItem color="bg-amber-500" label="Likes" />
                        <LegendItem color="bg-emerald-500" label="RTs" />
                        <LegendItem color="bg-purple-500" label="Replies" />
                    </div>
                </div>
                <ResponsiveContainer width="99%" height="100%" debounce={100}>
                    <AreaChart data={data} margin={{ top: 35, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                            <linearGradient id="colorRT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                            <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.1} /><stop offset="95%" stopColor="#a855f7" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.02)" vertical={false} />
                        <XAxis dataKey="displayTime" hide />
                        <YAxis stroke="transparent" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.1)' }} />
                        <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100 }} />
                        <Area type="monotone" dataKey="likes" stroke="#f59e0b" fill="url(#colorLikes)" strokeWidth={2} name="Likes" connectNulls isAnimationActive={false} />
                        <Area type="monotone" dataKey="retweets" stroke="#10b981" fill="url(#colorRT)" strokeWidth={2} name="RTs" connectNulls isAnimationActive={false} />
                        <Area type="monotone" dataKey="replies" stroke="#a855f7" fill="url(#colorReplies)" strokeWidth={2} name="Replies" connectNulls isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Chart 2: Macro Reach (Views) */}
            <div className="relative h-[185px] w-full min-w-0 bg-zinc-950/40 rounded-2xl border border-white/5 p-4 shadow-2xl backdrop-blur-sm overflow-hidden">
                <div className="absolute top-2 left-4 z-20 flex items-center gap-3 bg-zinc-950/80 px-2 py-1 rounded-md border border-white/10 backdrop-blur-md">
                    <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Macro Reach</h4>
                    <LegendItem color="bg-blue-500" label="Total Views" />
                </div>
                <ResponsiveContainer width="99%" height="100%" debounce={100}>
                    <AreaChart data={data} margin={{ top: 35, right: 10, left: -25, bottom: 10 }}>
                        <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.02)" vertical={false} />
                        <XAxis dataKey="displayTime" stroke="transparent" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)' }} minTickGap={40} />
                        <YAxis stroke="transparent" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.1)' }} />
                        <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100 }} />
                        <Area type="monotone" dataKey="views" stroke="#3b82f6" fill="url(#colorViews)" strokeWidth={2.5} name="Views" connectNulls isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
    <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity cursor-default">
        <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
        <span className="text-[9px] font-black text-white/40 uppercase tracking-tighter">{label}</span>
    </div>
);
