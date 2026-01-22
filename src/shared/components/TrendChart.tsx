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
        // Filter out null values to keep the tooltip compact
        const validPayload = payload.filter((p: any) => p.value !== null && p.value !== undefined);

        if (validPayload.length === 0) return null;

        return (
            <div className="bg-zinc-950/40 border border-white/10 p-2 rounded-xl backdrop-blur-xl shadow-2xl ring-1 ring-white/5 min-w-[120px] pointer-events-none transition-all duration-200">
                <p className="text-zinc-500 text-[8px] mb-1.5 font-black uppercase tracking-[0.2em] border-b border-white/5 pb-1 opacity-50">{label}</p>
                <div className="space-y-1">
                    {validPayload.map((entry: any) => (
                        <div key={entry.name} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full shadow-[0_0_5px_currentColor]" style={{ backgroundColor: entry.color, color: entry.color }} />
                                <span className="text-[8px] font-black text-white/30 uppercase tracking-tighter">
                                    {entry.name.replace(' (Real)', '').replace(' (AI)', '')}
                                </span>
                            </div>
                            <span className="text-[10px] font-black text-white/90 font-mono tabular-nums">
                                {entry.value >= 10000 ? (entry.value / 1000).toFixed(1) + 'k' : entry.value.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
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
        const historyData = (history || []).map(h => ({
            ts: h.capturedAt,
            displayTime: new Date(h.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            likes: h.favoriteCount,
            views: h.viewCount,
            retweets: h.retweetCount,
            replies: h.replyCount,
            isFuture: false
        })).sort((a, b) => a.ts - b.ts);

        const startTs = createdAt ? new Date(createdAt).getTime() : (historyData[0]?.ts || Date.now() - 3600000);

        if (historyData.length === 0) {
            historyData.push({
                ts: startTs,
                displayTime: 'Start',
                likes: 0, views: 0, retweets: 0, replies: 0, isFuture: false
            });
        }

        const lastHistoryPoint = historyData[historyData.length - 1];
        const dayMs = 24 * 3600000;

        // 2. AI 30天逐日模拟 (AI 30-Day Daily Simulation)
        const predictionData = (prediction?.dailySimulation || []).map(sim => {
            return {
                ts: lastHistoryPoint.ts + sim.day * dayMs,
                displayTime: `Day ${sim.day}`,
                likes: sim.likes,
                views: sim.views,
                retweets: sim.retweets,
                replies: sim.replies,
                isFuture: true
            };
        });

        // 3. 合并并处理双线逻辑
        const combinedData = [...historyData];

        // 为预测线增加连接点（历史的最后一点）
        if (predictionData.length > 0) {
            // 我们需要把历史的最后一点也标记为预测线起点
            const connectionPoint = { ...lastHistoryPoint, isPredictionStart: true };

            predictionData.forEach(p => {
                combinedData.push(p);
            });
        }

        // 转换为双字段结构，以便 Recharts 绘制实线/虚线
        return combinedData.map(d => ({
            ...d,
            likesHistory: d.isFuture ? null : d.likes,
            likesPrediction: (d.isFuture || d.ts === lastHistoryPoint.ts) ? d.likes : null,
            retweetsHistory: d.isFuture ? null : d.retweets,
            retweetsPrediction: (d.isFuture || d.ts === lastHistoryPoint.ts) ? d.retweets : null,
            repliesHistory: d.isFuture ? null : d.replies,
            repliesPrediction: (d.isFuture || d.ts === lastHistoryPoint.ts) ? d.replies : null,
            viewsHistory: d.isFuture ? null : d.views,
            viewsPrediction: (d.isFuture || d.ts === lastHistoryPoint.ts) ? d.views : null,
        }));
    }, [history, prediction, createdAt]);

    if (!data || data.length < 2 || !isMounted) {
        return <div className="h-[430px] w-full flex items-center justify-center text-zinc-800 text-[10px] font-black uppercase tracking-[0.3em]">Syncing Matrix...</div>;
    }

    return (
        <div className={`flex flex-col gap-6 w-full min-w-0 ${className}`}>
            {/* Chart 1: Engagement Matrix (Likes, RTs, Replies) */}
            <div className="relative h-[220px] w-full min-w-0 bg-white/[0.01] rounded-2xl border border-white/5 p-4 group/chart transition-all hover:bg-white/[0.02] z-30">
                <div className="absolute top-3 left-4 z-20 flex items-center gap-4">
                    <h4 className="text-[9px] font-black text-white/10 group-hover/chart:text-white/30 uppercase tracking-[0.3em] transition-colors">Engagement Flow</h4>
                    <div className="flex gap-3 opacity-20 group-hover/chart:opacity-100 transition-all duration-300">
                        <LegendItem color="bg-amber-500" label="Likes" />
                        <LegendItem color="bg-emerald-500" label="RTs" />
                        <LegendItem color="bg-purple-500" label="Replies" />
                    </div>
                </div>
                <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <AreaChart data={data} margin={{ top: 50, right: 20, left: 0, bottom: 10 }}>
                        <defs>
                            <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.05} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                            <linearGradient id="colorRT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.05} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                            <linearGradient id="colorReplies" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.05} /><stop offset="95%" stopColor="#a855f7" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                        <XAxis dataKey="displayTime" hide />
                        <YAxis stroke="transparent" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.1)', fontWeight: 900 }} width={35} />
                        <Tooltip
                            content={<CustomTooltip />}
                            wrapperStyle={{ zIndex: 100 }}
                            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            offset={20}
                        />

                        <Area type="monotone" dataKey="likesHistory" stroke="#f59e0b" fill="url(#colorLikes)" strokeWidth={1} name="Likes (Real)" connectNulls={false} isAnimationActive={false} />
                        <Area type="monotone" dataKey="retweetsHistory" stroke="#10b981" fill="url(#colorRT)" strokeWidth={1} name="RTs (Real)" connectNulls={false} isAnimationActive={false} />
                        <Area type="monotone" dataKey="repliesHistory" stroke="#a855f7" fill="url(#colorReplies)" strokeWidth={1} name="Replies (Real)" connectNulls={false} isAnimationActive={false} />

                        <Area type="monotone" dataKey="likesPrediction" stroke="#f59e0b" fill="none" strokeWidth={1} strokeDasharray="3 3" name="Likes (AI)" connectNulls={false} isAnimationActive={false} />
                        <Area type="monotone" dataKey="retweetsPrediction" stroke="#10b981" fill="none" strokeWidth={1} strokeDasharray="3 3" name="RTs (AI)" connectNulls={false} isAnimationActive={false} />
                        <Area type="monotone" dataKey="repliesPrediction" stroke="#a855f7" fill="none" strokeWidth={1} strokeDasharray="3 3" name="Replies (AI)" connectNulls={false} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Chart 2: Macro Reach (Views) */}
            <div className="relative h-[220px] w-full min-w-0 bg-white/[0.01] rounded-2xl border border-white/5 p-4 group/chart transition-all hover:bg-white/[0.02] z-20">
                <div className="absolute top-3 left-4 z-20 flex items-center gap-4">
                    <h4 className="text-[9px] font-black text-white/10 group-hover/chart:text-white/30 uppercase tracking-[0.3em] transition-colors">Macro Trajectory</h4>
                    <div className="opacity-20 group-hover/chart:opacity-100 transition-all duration-300">
                        <LegendItem color="bg-blue-500" label="Total Views" />
                    </div>
                </div>
                <ResponsiveContainer width="100%" height="100%" debounce={100}>
                    <AreaChart data={data} margin={{ top: 50, right: 20, left: 0, bottom: 20 }}>
                        <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                        <XAxis dataKey="displayTime" stroke="transparent" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.1)', fontWeight: 900 }} minTickGap={60} />
                        <YAxis stroke="transparent" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.05)', fontWeight: 900 }} width={35} />
                        <Tooltip
                            content={<CustomTooltip />}
                            wrapperStyle={{ zIndex: 100 }}
                            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            offset={20}
                        />

                        <Area type="monotone" dataKey="viewsHistory" stroke="#3b82f6" fill="url(#colorViews)" strokeWidth={1.5} name="Views (Real)" connectNulls={false} isAnimationActive={false} />
                        <Area type="monotone" dataKey="viewsPrediction" stroke="#3b82f6" fill="none" strokeWidth={1.5} strokeDasharray="3 3" name="Views (AI)" connectNulls={false} isAnimationActive={false} />
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
