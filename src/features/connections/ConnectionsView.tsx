import React, { useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useGraphData } from './hooks/useGraphData';
import { useUIStore } from '../../shared/store/useUIStore';

const ConnectionsView: React.FC = () => {
    const { data, loading } = useGraphData();
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const hasInitialZoomRef = useRef(false);
    const { sidebarCollapsed, sidebarWidth } = useUIStore();

    // 动态调整画布大小
    const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight });

    // 物理引擎配置
    useEffect(() => {
        if (fgRef.current) {
            // 重置自动缩放标记，允许新数据加载时重新聚焦
            hasInitialZoomRef.current = false;

            // 增强斥力，让节点散开
            fgRef.current.d3Force('charge').strength(-120);
            // 调整连线距离
            fgRef.current.d3Force('link').distance(70);

            // 重新加热引擎，确保新力生效
            fgRef.current.d3ReheatSimulation();
        }
    }, [data, loading]);

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
        <div ref={containerRef} className="w-full h-full bg-[#050505] relative overflow-hidden group">
            {/* 极简顶栏 - 悬浮在 Canvas 之上 */}
            <div className="absolute top-6 left-8 z-10 pointer-events-none select-none transition-opacity duration-500 opacity-40 group-hover:opacity-100">
                <h1 className="text-3xl font-thin text-white tracking-widest font-[Outfit,sans-serif]">
                    CONNECTIONS
                </h1>
                <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 font-mono">
                    <span>NODES: <b className="text-zinc-300">{data.nodes.length}</b></span>
                    <span className="w-px h-3 bg-white/10" />
                    <span>LINKS: <b className="text-zinc-300">{data.links.length}</b></span>
                </div>
            </div>

            {data.nodes.length > 0 ? (
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.w}
                    height={dimensions.h}
                    graphData={data}

                    // --- 视觉风格 ---
                    backgroundColor="#050505"

                    // 节点样式
                    nodeLabel="id"
                    nodeColor={(node: any) => {
                        if (String(node.id).startsWith('#')) return '#a855f7';
                        if (String(node.id).length > 20) return '#22d3ee';
                        return '#3b82f6';
                    }}
                    nodeRelSize={6}
                    nodeVal={(node: any) => node.val || 1}

                    // 连线样式
                    linkColor={() => "rgba(255,255,255,0.08)"} // 稍微调亮点
                    linkWidth={1}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleSpeed={0.005}
                    linkDirectionalParticleWidth={2}

                    // --- 物理引擎 ---
                    d3VelocityDecay={0.4} // 增加阻力防止乱飞
                    d3AlphaDecay={0.01}
                    cooldownTicks={100}

                    // --- 交互与自动聚焦 ---
                    onEngineStop={() => {
                        if (fgRef.current && !hasInitialZoomRef.current) {
                            fgRef.current.zoomToFit(400, 50); // 400ms 动画，留 50px 边距
                            hasInitialZoomRef.current = true; // 锁定，防止后续干扰用户缩放
                        }
                    }}
                    onNodeClick={(node) => {
                        console.log("Clicked Node:", node);
                        if (fgRef.current) {
                            // 点击聚焦
                            fgRef.current.centerAt(node.x, node.y, 400);
                            fgRef.current.zoom(2.5, 400);
                        }
                    }}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-700 pointer-events-none">
                    <p>No connections found yet.</p>
                </div>
            )}
        </div>
    );
};

export default ConnectionsView;
