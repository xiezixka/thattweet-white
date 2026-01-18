import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceX, forceY } from 'd3-force';
import { useGraphData } from './hooks/useGraphData';
import { useUIStore } from '../../shared/store/useUIStore';
import { Heart, RefreshCw } from 'lucide-react';

import { GraphSettingsPanel, GraphSettings } from './components/GraphSettingsPanel';

const ConnectionsView: React.FC = () => {
    const { data, loading } = useGraphData();
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const hasInitialZoomRef = useRef(false);

    // 🌟 节点动画状态追踪
    const nodeAnimStateRef = useRef<Map<string, { opacity: number; glow: number }>>(new Map());
    const animFrameRef = useRef<number>(0);

    // 动态调整画布大小
    const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight });

    const [hoverNode, setHoverNode] = useState<any>(null);
    const [lockedNode, setLockedNode] = useState<any>(null); // 🌟 锁定节点
    const [refreshCount, setRefreshCount] = useState(0);
    const [showFullText, setShowFullText] = useState(false); // 🌟 全文开关

    // lerp 函数：平滑插值
    const lerp = (current: number, target: number, speed: number) => {
        const diff = target - current;
        if (Math.abs(diff) < 0.01) return target;
        return current + diff * speed;
    };

    // 图谱控制状态 - 用户测试的最佳参数
    const [settings, setSettings] = useState<GraphSettings>({
        repelForce: 70,        // 排斥力
        linkDistance: 40,      // 连接距离
        centerForce: 0.05,     // 中心引力
        nodeScale: 1.1,        // 节点缩放
        linkWidth: 0.6,        // 连线粗细
        particleWidth: 2.5,    // 粒子大小
        showUsers: true,
        showTweets: true,
        showTags: true,
        highlightDepth: 2,     // 高亮层级
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

    // 🌟 BFS 算法：计算高亮的节点和连线 (悬浮或锁定时都生效)
    const { highlightNodes, highlightLinks } = useMemo(() => {
        const highlightNodes = new Set<string>();
        const highlightLinks = new Set<string>();

        // 悬浮或锁定的节点都触发高亮
        const activeNode = lockedNode || hoverNode;
        if (!activeNode || settings.highlightDepth === 0) {
            return { highlightNodes, highlightLinks };
        }

        // 构建邻接表
        const adjacencyMap = new Map<string, { neighbors: Set<string>, links: Set<string> }>();

        filteredData.nodes.forEach((n: any) => {
            adjacencyMap.set(n.id, { neighbors: new Set(), links: new Set() });
        });

        filteredData.links.forEach((l: any) => {
            const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
            const targetId = typeof l.target === 'object' ? l.target.id : l.target;
            const linkKey = `${sourceId}-${targetId}`;

            adjacencyMap.get(sourceId)?.neighbors.add(targetId);
            adjacencyMap.get(sourceId)?.links.add(linkKey);
            adjacencyMap.get(targetId)?.neighbors.add(sourceId);
            adjacencyMap.get(targetId)?.links.add(linkKey);
        });

        // BFS 遍历
        const visited = new Set<string>();
        const queue: { id: string; depth: number }[] = [{ id: activeNode.id, depth: 0 }];

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;

            if (visited.has(id)) continue;
            visited.add(id);
            highlightNodes.add(id);

            if (depth < settings.highlightDepth) {
                const nodeData = adjacencyMap.get(id);
                if (nodeData) {
                    nodeData.neighbors.forEach(neighborId => {
                        if (!visited.has(neighborId)) {
                            queue.push({ id: neighborId, depth: depth + 1 });
                        }
                    });
                    nodeData.links.forEach(linkKey => highlightLinks.add(linkKey));
                }
            }
        }

        return { highlightNodes, highlightLinks };
    }, [lockedNode, hoverNode, filteredData, settings.highlightDepth]);

    // 物理引擎配置 (实时)
    useEffect(() => {
        if (fgRef.current) {
            // 重置自动缩放标记
            hasInitialZoomRef.current = false;

            // 应用物理参数
            fgRef.current.d3Force('charge').strength(-settings.repelForce);
            fgRef.current.d3Force('link').distance(settings.linkDistance);

            // 🌟 正确的中心引力实现：使用 forceX 和 forceY
            // d3.forceCenter 没有 strength 方法，它只是移动质心
            // forceX/forceY 才能真正把节点拉向中心
            const centerX = dimensions.w / 2;
            const centerY = dimensions.h / 2;

            // 如果还没有 forceX/forceY，创建它们
            if (!fgRef.current.d3Force('centerX')) {
                fgRef.current.d3Force('centerX', forceX(centerX));
                fgRef.current.d3Force('centerY', forceY(centerY));
            }

            // 更新中心引力强度
            fgRef.current.d3Force('centerX')?.strength(settings.centerForce);
            fgRef.current.d3Force('centerY')?.strength(settings.centerForce);

            // 更新中心点位置（响应窗口大小变化）
            fgRef.current.d3Force('centerX')?.x(centerX);
            fgRef.current.d3Force('centerY')?.y(centerY);

            fgRef.current.d3ReheatSimulation();
        }
    }, [filteredData, settings.repelForce, settings.linkDistance, settings.centerForce, dimensions]);

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

    // 🌟 动画循环：平滑更新节点状态
    useEffect(() => {
        let isRunning = true;

        const animate = () => {
            if (!isRunning) return;

            let needsUpdate = false;
            const animState = nodeAnimStateRef.current;

            // 遍历所有节点，更新动画状态
            filteredData.nodes.forEach((node: any) => {
                const nodeId = node.id;
                const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(nodeId);

                // 目标值
                const targetOpacity = (highlightNodes.size > 0 && !isHighlighted) ? 0.15 : 1;
                const targetGlow = isHighlighted && highlightNodes.size > 0 ? 1 : 0;

                // 获取或初始化当前状态
                let state = animState.get(nodeId);
                if (!state) {
                    state = { opacity: targetOpacity, glow: targetGlow };
                    animState.set(nodeId, state);
                }

                // 平滑插值 (speed = 0.15, 较柔和的过渡)
                const newOpacity = lerp(state.opacity, targetOpacity, 0.12);
                const newGlow = lerp(state.glow, targetGlow, 0.12);

                if (newOpacity !== state.opacity || newGlow !== state.glow) {
                    state.opacity = newOpacity;
                    state.glow = newGlow;
                    needsUpdate = true;
                }
            });

            // 如果有变化，触发重绘
            if (needsUpdate && fgRef.current) {
                setRefreshCount(c => c + 1);
            }

            animFrameRef.current = requestAnimationFrame(animate);
        };

        animFrameRef.current = requestAnimationFrame(animate);

        return () => {
            isRunning = false;
            cancelAnimationFrame(animFrameRef.current);
        };
    }, [filteredData.nodes, highlightNodes, lerp]);

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
                            const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
                            const s = settings.nodeScale;

                            // 🌟 使用动画状态值实现平滑过渡
                            const animState = nodeAnimStateRef.current.get(node.id);
                            const dimFactor = animState?.opacity ?? 1;
                            const glowIntensity = animState?.glow ?? 0;

                            // 1. User 节点: 绘制头像
                            if (node.type === 'user') {
                                const rawSize = (Math.sqrt(node.val || 1) * 6) + 12;
                                const size = Math.min(64, Math.max(24, rawSize)) * s;
                                const r = size / 2;

                                ctx.save();
                                ctx.beginPath();
                                ctx.arc(x, y, r, 0, 2 * Math.PI);

                                // 发光效果使用动画插值
                                if (isHover || glowIntensity > 0.01) {
                                    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
                                    ctx.shadowBlur = ((isHover ? 25 : 18 * glowIntensity)) / globalScale;
                                }

                                ctx.globalAlpha = dimFactor;

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

                                ctx.globalAlpha = dimFactor;

                                ctx.beginPath();
                                ctx.arc(x, y, r, 0, 2 * Math.PI);
                                // 使用动画插值的边框透明度
                                const ringAlpha = 0.2 + glowIntensity * 0.6;
                                const ringColor = isHover ? '#fff' : `rgba(255, 255, 255, ${ringAlpha})`;
                                ctx.strokeStyle = ringColor;
                                ctx.lineWidth = ((isHover || glowIntensity > 0.1) ? (1 + glowIntensity * 2) : 1) / globalScale;
                                ctx.stroke();
                                ctx.globalAlpha = 1;
                                return;
                            }

                            // 2. Tag / Topic 节点
                            if (node.type === 'tag') {
                                ctx.globalAlpha = dimFactor;
                                const fontSize = (14 * s) / globalScale;
                                if (globalScale > 2 || isHover) {
                                    ctx.font = `${isHover ? '900' : '400'} ${fontSize}px 'Outfit', sans-serif`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    // 使用动画插值的文字透明度
                                    const textAlpha = 0.7 + glowIntensity * 0.25;
                                    const textColor = isHover ? '#fff' : `rgba(255, 255, 255, ${textAlpha})`;
                                    ctx.fillStyle = textColor;
                                    ctx.fillText(node.label, x, y);
                                } else {
                                    ctx.beginPath();
                                    const dotAlpha = 0.1 + glowIntensity * 0.2;
                                    ctx.fillStyle = `rgba(255,255,255,${dotAlpha})`;
                                    ctx.arc(x, y, (3 * s) / globalScale, 0, 2 * Math.PI);
                                    ctx.fill();
                                }
                                ctx.globalAlpha = 1;
                                return;
                            }

                            // 3. Tweet 节点
                            ctx.globalAlpha = dimFactor;
                            const r = (Math.min(5, Math.max(1.5, Math.sqrt(node.val || 1) + 1))) * s;
                            ctx.beginPath();
                            ctx.arc(x, y, r, 0, 2 * Math.PI);

                            // 使用动画插值的填充色
                            let fillColor = node.color || '#404040';
                            if (isHover) {
                                fillColor = '#fff';
                            } else if (glowIntensity > 0.01) {
                                // 渐变到白色
                                const r = Math.round(64 + glowIntensity * (255 - 64));
                                const g = Math.round(64 + glowIntensity * (255 - 64));
                                const b = Math.round(64 + glowIntensity * (255 - 64));
                                fillColor = `rgb(${r}, ${g}, ${b})`;
                            }
                            ctx.fillStyle = fillColor;

                            if (isHover || glowIntensity > 0.01) {
                                ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                                ctx.shadowBlur = ((isHover ? 15 : 12 * glowIntensity)) / globalScale;
                            }
                            ctx.fill();
                            ctx.shadowBlur = 0;
                            ctx.globalAlpha = 1;
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

                        linkColor={(link: any) => {
                            if (highlightNodes.size === 0) return "rgba(255,255,255,0.05)";
                            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
                            const linkKey = `${sourceId}-${targetId}`;
                            const reverseLinkKey = `${targetId}-${sourceId}`;
                            const isLinkHighlighted = highlightLinks.has(linkKey) || highlightLinks.has(reverseLinkKey);
                            return isLinkHighlighted ? "rgba(255, 255, 255, 0.4)" : "rgba(255,255,255,0.02)";
                        }}
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
                        onBackgroundClick={() => {
                            // 点击空白处关闭锁定的卡片
                            if (lockedNode) {
                                setLockedNode(null);
                                setHoverNode(null);
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

                                            {/* 🌟 媒体展示区域 */}
                                            {activeNode.data?.media && activeNode.data.media.length > 0 && (
                                                <div className={`grid gap-1.5 rounded-lg overflow-hidden ${activeNode.data.media.length === 1 ? 'grid-cols-1' :
                                                    activeNode.data.media.length === 2 ? 'grid-cols-2' :
                                                        activeNode.data.media.length === 3 ? 'grid-cols-2' :
                                                            'grid-cols-2'
                                                    }`}>
                                                    {activeNode.data.media.slice(0, 4).map((item: any, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            className={`relative bg-zinc-900 overflow-hidden ${activeNode.data.media.length === 1 ? 'aspect-video' :
                                                                activeNode.data.media.length === 3 && idx === 0 ? 'row-span-2 aspect-[3/4]' :
                                                                    'aspect-square'
                                                                }`}
                                                        >
                                                            {item.type === 'video' || item.type === 'gif' ? (
                                                                <>
                                                                    <img
                                                                        src={item.previewUrl || item.url}
                                                                        alt=""
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                                                            <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[7px] border-y-transparent ml-1" />
                                                                        </div>
                                                                    </div>
                                                                    <span className="absolute bottom-1 right-1 text-[9px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded uppercase">
                                                                        {item.type}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <img
                                                                    src={item.url}
                                                                    alt=""
                                                                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                                                />
                                                            )}
                                                        </div>
                                                    ))}
                                                    {activeNode.data.media.length > 4 && (
                                                        <div className="absolute bottom-2 right-2 text-xs text-white bg-black/60 px-2 py-1 rounded-full">
                                                            +{activeNode.data.media.length - 4}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

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
