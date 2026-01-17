import { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useGraphData } from './hooks/useGraphData';
import { useUIStore } from '../../shared/store/useUIStore';
import { Heart, RefreshCw } from 'lucide-react';

import { GraphSettingsPanel, GraphSettings } from './components/GraphSettingsPanel';

const ConnectionsView: React.FC = () => {
    const { data, loading } = useGraphData();
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const hasInitialZoomRef = useRef(false);

    // 动态调整画布大小
    const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight });

    const [hoverNode, setHoverNode] = useState<any>(null);
    const [lockedNode, setLockedNode] = useState<any>(null); // 🌟 锁定节点
    const [refreshCount, setRefreshCount] = useState(0);
    const [showFullText, setShowFullText] = useState(false); // 🌟 全文开关

    // 图谱控制状态
    const [settings, setSettings] = useState<GraphSettings>({
        repelForce: 100,
        linkDistance: 40,
        centerForce: 0.1,
        nodeScale: 1.0,
        linkWidth: 1.0,
        particleWidth: 2.0,
        showUsers: true,
        showTweets: true,
        showTags: true,
    });

    const handleSettingUpdate = (key: keyof GraphSettings, value: number | boolean) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // 🌟 数据过滤 (核心): 根据开关动态隐藏节点
    const filteredData = useMemo(() => {
        if (!data.nodes.length) return data;

        // 1. 过滤节点
        const visibleNodeIds = new Set<string>();
        const visibleNodes = data.nodes.filter((n: any) => {
            let isVisible = true;
            if (n.type === 'user' && !settings.showUsers) isVisible = false;
            if (n.type === 'tweet' && !settings.showTweets) isVisible = false;
            if (n.type === 'tag' && !settings.showTags) isVisible = false;

            if (isVisible) visibleNodeIds.add(n.id);
            return isVisible;
        });

        // 2. 过滤连线 (两端都必须可见)
        const visibleLinks = data.links.filter((l: any) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
        });

        return { nodes: visibleNodes, links: visibleLinks };
    }, [data, settings.showUsers, settings.showTweets, settings.showTags]);

    // 物理引擎配置 (实时)
    useEffect(() => {
        if (fgRef.current) {
            // 重置自动缩放标记
            hasInitialZoomRef.current = false;

            // 应用物理参数
            fgRef.current.d3Force('charge').strength(-settings.repelForce);
            fgRef.current.d3Force('link').distance(settings.linkDistance);

            if (fgRef.current.d3Force('center')) {
                fgRef.current.d3Force('center').strength(settings.centerForce);
            }

            fgRef.current.d3ReheatSimulation();
        }
    }, [filteredData, settings.repelForce, settings.linkDistance, settings.centerForce]);

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setDimensions({
                    w: containerRef.current.clientWidth,
                    h: containerRef.current.clientHeight
                });
            }
        };

        // ResizeObserver is better for container resizes
        const ro = new ResizeObserver(updateSize);
        if (containerRef.current) ro.observe(containerRef.current);

        return () => ro.disconnect();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500 bg-[#050505]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <div className="text-sm font-light tracking-widest uppercase opacity-70">
                        Synthesizing Graph...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full bg-[#09090b] relative overflow-hidden group">
            {/* 极简顶栏 - 悬浮在 Canvas 之上 */}
            <div className="absolute top-6 left-8 z-10 pointer-events-none select-none transition-opacity duration-500 opacity-60">
                <h1 className="text-3xl font-thin text-white tracking-widest font-[Outfit,sans-serif]">
                    CONNECTIONS
                </h1>
                <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 font-mono">
                    <span>NODES: <b className="text-zinc-300">{filteredData.nodes.length}</b></span>
                    <span className="w-px h-3 bg-white/10" />
                    <span>LINKS: <b className="text-zinc-300">{filteredData.links.length}</b></span>
                </div>
            </div>

            {/* 控制面板 */}
            <GraphSettingsPanel settings={settings} onUpdate={handleSettingUpdate} />

            {filteredData.nodes.length > 0 ? (
                <>
                    <ForceGraph2D
                        ref={fgRef}
                        width={dimensions.w}
                        height={dimensions.h}
                        graphData={filteredData}

                        // --- 视觉风格: 纯粹 ---
                        backgroundColor="#09090b"

                        // --- 自定义渲染 ---
                        nodeCanvasObject={(node: any, ctx, globalScale) => {
                            const x = node.x!;
                            const y = node.y!;
                            const isHover = hoverNode === node;
                            const s = settings.nodeScale;

                            // 1. User 节点: 绘制头像
                            if (node.type === 'user') {
                                const rawSize = (Math.sqrt(node.val || 1) * 6) + 12;
                                const size = Math.min(64, Math.max(24, rawSize)) * s;
                                const r = size / 2;

                                ctx.save();
                                ctx.beginPath();
                                ctx.arc(x, y, r, 0, 2 * Math.PI);

                                if (isHover) {
                                    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                                    ctx.shadowBlur = 20 / globalScale;
                                }

                                // 🌟 强效头像加载逻辑
                                if (node.__imgObj !== 'error') {
                                    if (!node.__imgObj) {
                                        const img = new Image();
                                        img.crossOrigin = "anonymous";

                                        // 使用 handle 查 unavatar
                                        const handle = node.data?.handle || node.id;
                                        img.src = `https://unavatar.io/x/${handle}?fallback=https://wsrv.nl/?url=${encodeURIComponent(node.img || '')}`;

                                        img.onload = () => {
                                            node.__imgObj = img;
                                            setRefreshCount(c => c + 1); // 触发重绘
                                        };
                                        img.onerror = () => {
                                            node.__imgObj = 'error';
                                            setRefreshCount(c => c + 1);
                                        };
                                        node.__imgObj = 'loading';
                                    }

                                    if (node.__imgObj instanceof HTMLImageElement) {
                                        ctx.clip();
                                        ctx.drawImage(node.__imgObj, x - r, y - r, size, size);
                                    } else {
                                        ctx.fillStyle = '#18181b';
                                        ctx.fill();
                                    }
                                } else {
                                    ctx.fillStyle = '#18181b';
                                    ctx.fill();
                                    ctx.fillStyle = '#a1a1aa';
                                    ctx.font = `bold ${Math.max(10, size * 0.4)}px sans-serif`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    const initial = (node.label || '?').charAt(0).toUpperCase();
                                    ctx.fillText(initial, x, y);
                                }
                                ctx.restore();

                                ctx.beginPath();
                                ctx.arc(x, y, r, 0, 2 * Math.PI);
                                ctx.strokeStyle = isHover ? '#fff' : 'rgba(255,255,255,0.2)';
                                ctx.lineWidth = (isHover ? 3 : 1) / globalScale;
                                ctx.stroke();
                                return;
                            }

                            // 2. Tag / Topic 节点
                            if (node.type === 'tag') {
                                const fontSize = (14 * s) / globalScale;
                                if (globalScale > 2 || isHover) {
                                    ctx.font = `${isHover ? '900' : '400'} ${fontSize}px 'Outfit', sans-serif`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillStyle = isHover ? '#fff' : 'rgba(161, 161, 170, 0.7)';
                                    ctx.fillText(node.label, x, y);
                                } else {
                                    ctx.beginPath();
                                    ctx.fillStyle = 'rgba(255,255,255,0.1)';
                                    ctx.arc(x, y, (3 * s) / globalScale, 0, 2 * Math.PI);
                                    ctx.fill();
                                }
                                return;
                            }

                            // 3. Tweet 节点
                            const r = (Math.min(5, Math.max(1.5, Math.sqrt(node.val || 1) + 1))) * s;
                            ctx.beginPath();
                            ctx.arc(x, y, r, 0, 2 * Math.PI);
                            ctx.fillStyle = isHover ? '#fff' : (node.color || '#404040');
                            if (isHover) {
                                ctx.shadowColor = '#fff';
                                ctx.shadowBlur = 15 / globalScale;
                            }
                            ctx.fill();
                        }}

                        // 点击区域
                        nodePointerAreaPaint={(node: any, color, ctx) => {
                            const s = settings.nodeScale;
                            let size = 5;
                            if (node.type === 'user') {
                                const rawSize = (Math.sqrt(node.val || 1) * 6) + 12;
                                size = Math.min(64, Math.max(24, rawSize)) * s / 2;
                            } else if (node.type === 'tweet') {
                                const rawR = Math.sqrt(node.val || 1) + 1;
                                size = Math.min(5, Math.max(1.5, rawR)) * s;
                            }
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI); // 加大一点点击范围
                            ctx.fill();
                        }}

                        linkColor={() => "rgba(255,255,255,0.05)"}
                        linkWidth={settings.linkWidth}
                        linkDirectionalParticles={hoverNode ? 2 : 0}
                        linkDirectionalParticleSpeed={0.005}
                        linkDirectionalParticleWidth={settings.particleWidth}

                        d3VelocityDecay={0.4}
                        d3AlphaDecay={0.01}
                        cooldownTicks={500}

                        onNodeHover={(node) => {
                            if (!lockedNode) {
                                setHoverNode(node);
                                setShowFullText(false);
                            }
                        }}
                        onNodeClick={(node) => {
                            if (fgRef.current) {
                                fgRef.current.centerAt(node.x, node.y, 400);
                                fgRef.current.zoom(4, 400);
                            }
                            if (lockedNode === node) {
                                setLockedNode(null);
                                setHoverNode(null);
                            } else {
                                setLockedNode(node);
                                setHoverNode(node);
                            }
                        }}
                    />

                    {/* 🌟 节点展开卡片 (Pinned Popover) */}
                    {(hoverNode || lockedNode) && fgRef.current && (() => {
                        const activeNode = lockedNode || hoverNode;
                        const coords = fgRef.current.graph2ScreenCoords(activeNode.x, activeNode.y);
                        if (!coords) return null;

                        const isLocked = !!lockedNode;
                        const cardWidth = 320;
                        const cardHeight = isLocked ? 250 : 200;

                        let top = coords.y - 40;
                        let left = coords.x;
                        let transform = 'translate(-50%, -100%)';

                        if (coords.y < cardHeight + 100) {
                            top = coords.y + 40;
                            transform = 'translate(-50%, 0%)';
                        }

                        if (left < cardWidth / 2 + 20) left = cardWidth / 2 + 20;
                        if (left > dimensions.w - cardWidth / 2 - 20) left = dimensions.w - cardWidth / 2 - 20;

                        return (
                            <div
                                className={`absolute z-50 transition-all duration-200 ${isLocked ? 'pointer-events-auto' : 'pointer-events-none'}`}
                                style={{ top, left, transform }}
                            >
                                <div className={`w-80 bg-zinc-950/95 backdrop-blur-2xl border ${isLocked ? 'border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]' : 'border-white/20 shadow-2xl'} rounded-2xl p-5 animate-in zoom-in-90 fade-in duration-200`}>
                                    {isLocked && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setLockedNode(null); setHoverNode(null); }}
                                            className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-800 border border-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors pointer-events-auto"
                                        >
                                            ✕
                                        </button>
                                    )}

                                    {activeNode.type === 'user' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-full border-2 border-white/20 overflow-hidden bg-zinc-900 shrink-0">
                                                    <img
                                                        src={`https://unavatar.io/x/${activeNode.data?.handle || activeNode.id}?fallback=https://wsrv.nl/?url=${encodeURIComponent(activeNode.img || '')}`}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-black text-white text-xl truncate tracking-tight">{activeNode.label}</div>
                                                    <div className="text-xs text-blue-400 font-mono flex items-center gap-1">
                                                        @{activeNode.data?.handle || activeNode.id}
                                                        {isLocked && (
                                                            <a
                                                                href={activeNode.data?.handle ? `https://x.com/${activeNode.data.handle}` : '#'}
                                                                target="_blank"
                                                                className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                                                            >
                                                                ↗
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {activeNode.data?.description && (
                                                <p className="text-xs text-zinc-400 leading-relaxed italic font-serif opacity-80 line-clamp-3">
                                                    "{activeNode.data.description}"
                                                </p>
                                            )}
                                            <div className="flex items-center justify-between pt-3 border-t border-white/10">
                                                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">核心画像</div>
                                                <div className="text-xs font-mono text-zinc-400">粉丝: {activeNode.data?.followersCount || 0}</div>
                                            </div>
                                        </div>
                                    )}

                                    {activeNode.type === 'tweet' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${isLocked ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]' : 'bg-zinc-600'} animate-pulse`} />
                                                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">{isLocked ? '锁定视图' : '推文节点'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isLocked && activeNode.data?.tweetUrl && (
                                                        <a
                                                            href={activeNode.data.tweetUrl}
                                                            target="_blank"
                                                            className="text-xs text-zinc-500 hover:text-white transition-colors"
                                                        >
                                                            原文 ↗
                                                        </a>
                                                    )}
                                                    <span className="text-[10px] font-mono text-zinc-600">
                                                        {new Date(activeNode.data?.createdAt || 0).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="group relative">
                                                <div className={`text-sm text-zinc-200 leading-relaxed font-light ${showFullText ? '' : 'line-clamp-4'} selection:bg-blue-500/30 whitespace-pre-wrap`}>
                                                    {activeNode.data?.text || activeNode.label}
                                                </div>
                                                {(activeNode.data?.text?.length > 100 || (activeNode.data?.text?.split('\n').length > 4)) && isLocked && (
                                                    <button
                                                        onClick={() => setShowFullText(!showFullText)}
                                                        className="mt-2 text-[10px] font-black text-zinc-500 hover:text-blue-400 uppercase tracking-widest transition-colors pointer-events-auto"
                                                    >
                                                        {showFullText ? '收起全文 ↑' : '点击展开全文 ↓'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 pt-3 border-t border-white/10 text-xs text-zinc-500">
                                                <span className="flex items-center gap-1.5"><Heart size={12} className="text-zinc-600" /> {activeNode.data?.favoriteCount || 0}</span>
                                                <span className="flex items-center gap-1.5"><RefreshCw size={12} className="text-zinc-600" /> {activeNode.data?.retweetCount || 0}</span>
                                                <span className="ml-auto text-[10px] text-zinc-700 font-mono">热度: {Math.round(activeNode.val)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {activeNode.type === 'tag' && (
                                        <div className="flex items-center gap-4 py-2">
                                            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-2xl font-black text-zinc-600">#</div>
                                            <div>
                                                <div className="font-black text-2xl text-white tracking-tighter uppercase">{activeNode.label.replace('#', '')}</div>
                                                <div className="text-[10px] text-zinc-500 uppercase tracking-[0.3em] font-medium mt-1">关联标签</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-700 pointer-events-none">
                    <p className="font-light tracking-widest text-sm opacity-50">WAITING FOR SIGNAL...</p>
                </div>
            )}

        </div>
    );
};

export default ConnectionsView;
