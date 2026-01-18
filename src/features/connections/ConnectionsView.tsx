import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import { forceX, forceY, forceManyBody, forceRadial } from 'd3-force';
import * as THREE from 'three';
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

    // 🌟 3D 纹理缓存 (防止闪烁和内存爆炸)
    const userTextureCache = useRef<Map<string, THREE.Texture>>(new Map());
    const glowTextureCache = useRef<Map<string, THREE.Texture>>(new Map());

    // 组件卸载时清理纹理
    useEffect(() => {
        return () => {
            userTextureCache.current.forEach(t => t.dispose());
            userTextureCache.current.clear();
            glowTextureCache.current.forEach(t => t.dispose());
            glowTextureCache.current.clear();
        };
    }, []);

    // 动态调整画布大小
    const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight });

    const [hoverNode, setHoverNode] = useState<any>(null);
    const [lockedNode, setLockedNode] = useState<any>(null); // 🌟 锁定节点
    const [refreshCount, setRefreshCount] = useState(0);
    const [showFullText, setShowFullText] = useState(false); // 🌟 全文开关

    // 🌟 交互手势状态
    const [isGravityActive, setIsGravityActive] = useState(false);
    const [gravityCenter, setGravityCenter] = useState<{ x: number, y: number } | null>(null);

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
        is3D: false,
        clusterByTopic: false,
        temporalEvolution: false,
    });

    // 🌟 预渲染离屏星空贴图，极大提升性能
    const starPattern = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // 绘制 400 颗星星到贴图上
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const size = Math.random() * 1.5 + 0.2;
            const opacity = Math.random() * 0.4 + 0.1;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, 2 * Math.PI);
            ctx.fill();
        }
        return canvas;
    }, []);

    // 绘制无限平铺星空
    const drawStarfield = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (!fgRef.current || !starPattern) return;

        const center = fgRef.current.centerAt();
        const { w, h } = dimensions;

        // 🌟 增加视差系数，让背景位移更明显 (0.15)
        const parallaxFactor = 0.15;
        const offsetX = -(center.x * parallaxFactor * globalScale) % 1024;
        const offsetY = -(center.y * parallaxFactor * globalScale) % 1024;

        const time = Date.now() / 2000;
        const twinkle = Math.sin(time) * 0.15 + 0.85; // 全局微弱呼吸

        ctx.save();
        // 🌟 重置变换矩阵，直接在屏幕坐标系绘背景，确保铺满
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = twinkle;

        // 绘制 2x2 的贴图单元，足以覆盖平移时的空隙
        for (let i = -1; i <= Math.ceil(w / 1024) + 1; i++) {
            for (let j = -1; j <= Math.ceil(h / 1024) + 1; j++) {
                ctx.drawImage(starPattern,
                    offsetX + i * 1024,
                    offsetY + j * 1024
                );
            }
        }

        ctx.restore();
    }, [starPattern, dimensions]);



    const handleSettingUpdate = (key: keyof GraphSettings, value: number | boolean) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const [selectedLink, setSelectedLink] = useState<any>(null); // 被选中的连线

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

    // 🌟 找出最新推文时间，用于时间流光效果
    const latestTweetTime = useMemo(() => {
        const times = filteredData.nodes
            .filter(n => n.type === 'tweet' && n.data?.createdAt)
            .map(n => new Date(n.data.createdAt).getTime());
        return times.length > 0 ? Math.max(...times) : Date.now();
    }, [filteredData]);

    // 🌟 聚类标签计算 (Heuristic Clustering)
    const clusters = useMemo(() => {
        if (!filteredData.nodes.length) return [];
        const groups = new Map<string, { nodes: any[], name: string, color?: string }>();

        filteredData.nodes.forEach((node: any) => {
            if (node.type === 'tweet') {
                let groupId = node.data?.authorId;
                let groupName = node.data?.author?.name || node.data?.author || 'Unknown';

                // 如果开启了主题聚类，尝试使用标签
                if (settings.clusterByTopic && node.data?.tags && node.data.tags.length > 0) {
                    groupId = `tag-${node.data.tags[0]}`;
                    groupName = `#${node.data.tags[0]}`;
                }

                if (groupId) {
                    if (!groups.has(groupId)) {
                        groups.set(groupId, { nodes: [], name: groupName });
                    }
                    groups.get(groupId)!.nodes.push(node);
                }
            }
        });

        const colorPalette = [
            'rgba(59, 130, 246, 0.4)', // blue
            'rgba(16, 185, 129, 0.4)', // emerald
            'rgba(245, 158, 11, 0.4)', // amber
            'rgba(139, 92, 246, 0.4)', // violet
            'rgba(236, 72, 153, 0.4)', // pink
            'rgba(6, 182, 212, 0.4)',  // cyan
        ];

        return Array.from(groups.values())
            .filter(g => g.nodes.length >= 3)
            .map((g, i) => {
                const avgX = g.nodes.reduce((sum, n) => sum + (n.x || 0), 0) / g.nodes.length;
                const avgY = g.nodes.reduce((sum, n) => sum + (n.y || 0), 0) / g.nodes.length;
                const avgZ = g.nodes.reduce((sum, n) => sum + (n.z || 0), 0) / g.nodes.length;
                return {
                    name: g.name,
                    x: avgX,
                    y: avgY,
                    z: avgZ || 0,
                    count: g.nodes.length,
                    color: colorPalette[i % colorPalette.length]
                };
            });
    }, [filteredData, refreshCount, settings.clusterByTopic]); // refreshCount 触发力导向稳定后的位置更新

    const drawClusterLabels = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (globalScale < 0.5) return; // 只有放大到一定程度才显示
        ctx.save();
        clusters.forEach(c => {
            const fontSize = 16 / globalScale;
            ctx.font = `bold ${fontSize}px 'Outfit', sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

            // 绘制带有微光背景的文字
            const text = `${c.name} (${c.count} posts)`;
            ctx.fillText(text.toUpperCase(), c.x, c.y - 40 / globalScale);
        });
        ctx.restore();
    }, [clusters]);

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

    // 物理引擎配置 (实时) - 仅对 2D 模式生效
    // 3D 模式使用 react-force-graph-3d 的默认物理引擎，避免访问未初始化的 simulation
    useEffect(() => {
        // 🌟 3D 模式下添加星空背景 (增强版)
        if (settings.is3D && fgRef.current) {
            const scene = fgRef.current.scene();
            if (scene && !scene.getObjectByName('starfield')) {
                const geometry = new THREE.BufferGeometry();
                // 🌟 超巨型宇宙生成：解决“缩放露馅”问题
                // 策略：创建一个半径极大（100,000）的球体，把玩家包裹在中间
                const count = 30000;
                const positions = new Float32Array(count * 3);
                const sizes = new Float32Array(count);

                for (let i = 0; i < count; i++) {
                    // 1. 距离分布：使用三次方根分布，让星星在远处更密集，构成“背景墙”
                    // 同时保留一部分在近处（4000以内）作为“飞掠尘埃”
                    const isBackground = Math.random() > 0.2; // 80% 是背景星
                    let r;
                    if (isBackground) {
                        r = 10000 + Math.random() * 90000; // 1w - 10w
                    } else {
                        r = 4000 + Math.random() * 6000;   // 4k - 10k
                    }

                    // 2. 球坐标随机
                    const theta = 2 * Math.PI * Math.random();
                    const phi = Math.acos(2 * Math.random() - 1);

                    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
                    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
                    positions[i * 3 + 2] = r * Math.cos(phi);

                    // 3. 大小修正：远处的星星要稍微大一点点才能在 sizeAttenuation 下可见
                    // 近处的星星作为尘埃要小
                    sizes[i] = isBackground ? 4.0 : 2.0;
                }


                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); // 传递给 shader 或 sizeAttenuation

                // 使用 shader material 或者简单的 points material
                const material = new THREE.PointsMaterial({
                    size: 1.5,
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.6,
                    sizeAttenuation: true // 关键：允许近大远小
                });

                const stars = new THREE.Points(geometry, material);
                stars.name = 'starfield';
                scene.add(stars);
            }
            return;
        }

        // 延迟执行，确保组件完全挂载
        const timeoutId = setTimeout(() => {
            const fg = fgRef.current;
            if (!fg || typeof fg.d3Force !== 'function') return;

            try {
                // 重置自动缩放标记
                hasInitialZoomRef.current = false;

                // 2D 模式力场配置
                fg.d3Force('charge')?.strength(-settings.repelForce);
                fg.d3Force('link')?.distance(settings.linkDistance);

                const centerX = dimensions.w / 2;
                const centerY = dimensions.h / 2;

                if (!fg.d3Force('centerX')) {
                    fg.d3Force('centerX', forceX(centerX));
                    fg.d3Force('centerY', forceY(centerY));
                }

                fg.d3Force('centerX')?.strength(settings.centerForce);
                fg.d3Force('centerY')?.strength(settings.centerForce);
                fg.d3Force('centerX')?.x(centerX);
                fg.d3Force('centerY')?.y(centerY);

                if (settings.clusterByTopic) {
                    fg.d3Force('charge')?.strength(-settings.repelForce * 0.5);
                }

                if (isGravityActive && gravityCenter) {
                    fg.d3Force('gravity', forceRadial(10, gravityCenter.x, gravityCenter.y).strength(2));
                } else {
                    fg.d3Force('gravity', null);
                }

                fg.d3ReheatSimulation?.();
            } catch (e) {
                console.warn('[Graph] Force configuration skipped:', e);
            }
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [filteredData, settings.repelForce, settings.linkDistance, settings.centerForce, dimensions, isGravityActive, gravityCenter, settings.clusterByTopic, settings.is3D]);

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
        <div ref={containerRef} className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#18181b] via-[#09090b] to-[#000000] relative overflow-hidden group">

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
                    {/* 🌟 核心图谱组件容器 */}
                    <div
                        className="w-full h-full"
                        onMouseDown={(e) => {
                            if (e.button === 0 && !hoverNode) { // 左键长按背景
                                setIsGravityActive(true);
                                const { x, y } = fgRef.current.screen2GraphCoords(e.clientX, e.clientY);
                                setGravityCenter({ x, y });
                            }
                        }}
                        onMouseMove={(e) => {
                            if (isGravityActive) {
                                const { x, y } = fgRef.current.screen2GraphCoords(e.clientX, e.clientY);
                                setGravityCenter({ x, y });
                            }
                        }}
                        onMouseUp={() => setIsGravityActive(false)}
                        onMouseLeave={() => setIsGravityActive(false)}
                    >
                        {settings.is3D ? (
                            <ForceGraph3D
                                key="graph-3d" // 🌟 强制重新挂载，避免状态冲突
                                ref={fgRef}
                                width={dimensions.w}
                                height={dimensions.h}
                                graphData={filteredData}
                                backgroundColor="#09090b"
                                showNavInfo={false}

                                nodeRelSize={4}
                                nodeVal={d => d.val}
                                nodeThreeObject={(node: any) => {
                                    // 3D 节点定制 - 纯 Sprite 方案 (高性能 + 2D 视觉一致性)

                                    // 1. User 节点: 圆形头像 + 光圈 (带缓存)
                                    if (node.type === 'user') {
                                        const imgUrl = `https://unavatar.io/x/${node.data?.handle || node.id}?fallback=https://wsrv.nl/?url=${encodeURIComponent(node.img || '')}`;
                                        const cacheKey = node.data?.handle || node.id;

                                        // 尝试从缓存获取
                                        let texture = userTextureCache.current.get(cacheKey);

                                        if (!texture) {
                                            // 预创建一个 Canvas 纹理作为占位符
                                            const canvas = document.createElement('canvas');
                                            canvas.width = 128;
                                            canvas.height = 128;
                                            const ctx = canvas.getContext('2d');
                                            if (ctx) {
                                                // 绘制底色圆形
                                                ctx.fillStyle = '#18181b';
                                                ctx.beginPath();
                                                ctx.arc(64, 64, 60, 0, Math.PI * 2);
                                                ctx.fill();

                                                // 绘制文字初始
                                                ctx.fillStyle = '#a1a1aa';
                                                ctx.font = 'bold 40px Arial';
                                                ctx.textAlign = 'center';
                                                ctx.textBaseline = 'middle';
                                                ctx.fillText((node.data?.name || '?').charAt(0).toUpperCase(), 64, 64);
                                            }

                                            texture = new THREE.CanvasTexture(canvas);
                                            texture.colorSpace = THREE.SRGBColorSpace;
                                            userTextureCache.current.set(cacheKey, texture); // 存入缓存

                                            // 异步加载真实头像覆盖 Canvas
                                            const img = new Image();
                                            img.crossOrigin = "Anonymous";
                                            img.src = imgUrl;
                                            img.onload = () => {
                                                if (ctx) {
                                                    ctx.clearRect(0, 0, 128, 128);

                                                    // 绘制发光光圈
                                                    ctx.save();
                                                    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
                                                    ctx.shadowBlur = 10;
                                                    ctx.beginPath();
                                                    ctx.arc(64, 64, 60, 0, Math.PI * 2);
                                                    ctx.fillStyle = '#000';
                                                    ctx.fill();
                                                    ctx.restore();

                                                    // 绘制圆形剪裁的头像
                                                    ctx.save();
                                                    ctx.beginPath();
                                                    ctx.arc(64, 64, 60, 0, Math.PI * 2);
                                                    ctx.clip();
                                                    ctx.drawImage(img, 0, 0, 128, 128);

                                                    // 绘制边框
                                                    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                                                    ctx.lineWidth = 4;
                                                    ctx.stroke();
                                                    ctx.restore();

                                                    if (texture) texture.needsUpdate = true;
                                                }
                                            };
                                        }

                                        const material = new THREE.SpriteMaterial({ map: texture });
                                        const sprite = new THREE.Sprite(material);
                                        const size = (Math.sqrt(node.val || 1) * 3) + 10;
                                        sprite.scale.set(size, size, 1);
                                        return sprite;
                                    }

                                    // 2. Tweet/Tag 节点: 发光光点 Canvas Sprite (带缓存)
                                    const color = node.color || '#60a5fa';
                                    let texture = glowTextureCache.current.get(color);

                                    if (!texture) {
                                        const canvas = document.createElement('canvas');
                                        canvas.width = 64;
                                        canvas.height = 64;
                                        const ctx = canvas.getContext('2d');
                                        if (ctx) {
                                            const r = 30;
                                            const x = 32;
                                            const y = 32;

                                            // 径向渐变模拟 Bloom
                                            const gradient = ctx.createRadialGradient(x, y, 4, x, y, r);
                                            gradient.addColorStop(0, '#ffffff'); // 核心亮白
                                            gradient.addColorStop(0.3, color);
                                            gradient.addColorStop(1, 'rgba(0,0,0,0)'); // 边缘透明

                                            ctx.fillStyle = gradient;
                                            ctx.beginPath();
                                            ctx.arc(x, y, r, 0, Math.PI * 2);
                                            ctx.fill();
                                        }

                                        texture = new THREE.CanvasTexture(canvas);
                                        texture.colorSpace = THREE.SRGBColorSpace;
                                        glowTextureCache.current.set(color, texture);
                                    }

                                    const material = new THREE.SpriteMaterial({
                                        map: texture,
                                        transparent: true,
                                        blending: THREE.AdditiveBlending, // 🌟 叠加混合模式，通过缓存重用极大提升性能
                                        depthWrite: false // 防止遮挡
                                    });
                                    const sprite = new THREE.Sprite(material);

                                    // 尺寸调整
                                    const val = node.val || 1;
                                    const size = node.type === 'tweet' ? (Math.sqrt(val) * 3) + 6 : 8;
                                    sprite.scale.set(size, size, 1);

                                    return sprite;
                                }}
                                nodeThreeObjectExtend={false}

                                linkColor={link => {
                                    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
                                    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
                                    const isLinkHighlighted = highlightLinks.has(`${sourceId}-${targetId}`) || highlightLinks.has(`${targetId}-${sourceId}`);
                                    return isLinkHighlighted ? "#60a5fa" : "rgba(255, 255, 255, 0.08)";
                                }}
                                linkWidth={link => {
                                    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
                                    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
                                    return (highlightLinks.has(`${sourceId}-${targetId}`) || highlightLinks.has(`${targetId}-${sourceId}`)) ? 1.5 : 0.5;
                                }}
                                linkDirectionalParticles={l => {
                                    const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                                    const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                                    return (highlightLinks.has(`${sourceId}-${targetId}`) || highlightLinks.has(`${targetId}-${sourceId}`)) ? 4 : 0;
                                }}

                                onNodeHover={node => {
                                    if (!lockedNode) {
                                        setHoverNode(node);
                                        setShowFullText(false);
                                    }
                                }}
                                onNodeClick={node => {
                                    if (fgRef.current) {
                                        const distance = 200;
                                        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
                                        fgRef.current.cameraPosition(
                                            { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new pos
                                            node, // lookAt property
                                            1500  // ms transition duration
                                        );
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
                                    setLockedNode(null);
                                    setHoverNode(null);
                                    setSelectedLink(null);
                                }}
                            />
                        ) : (
                            <ForceGraph2D
                                key="graph-2d" // 🌟 强制重新挂载
                                ref={fgRef}
                                width={dimensions.w}
                                height={dimensions.h}
                                graphData={filteredData}
                                onRenderFramePre={(ctx, globalScale) => {
                                    drawStarfield(ctx, globalScale);
                                    drawClusterLabels(ctx, globalScale);
                                }}

                                // --- 视觉风格: 纯粹 ---
                                backgroundColor="#09090b"

                                // --- 自定义渲染 ---
                                nodeCanvasObject={(node: any, ctx, globalScale) => {
                                    const x = node.x!;
                                    const y = node.y!;
                                    const isHover = hoverNode === node;
                                    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
                                    const s = settings.nodeScale;

                                    // 🌟 呼吸光晕计算 (Bloom Effect)
                                    const time = Date.now() / 1000;
                                    const pulse = Math.sin(time * 2) * 0.5 + 0.5; // 0 到 1 呼吸
                                    const heavyNode = (node.val || 0) > 20; // 权重较大的节点

                                    // 🌟 使用动画状态值实现平滑过渡
                                    const animState = nodeAnimStateRef.current.get(node.id);
                                    let dimFactor = animState?.opacity ?? 1;
                                    const glowIntensity = animState?.glow ?? 0;

                                    // 🌟 时间流光 (Temporal Flow)
                                    let temporalPulse = 0;
                                    if (settings.temporalEvolution && node.type === 'tweet' && node.data?.createdAt) {
                                        const timestamp = new Date(node.data.createdAt).getTime();
                                        const diffHours = (latestTweetTime - timestamp) / (1000 * 60 * 60);
                                        const ageAlpha = Math.max(0.15, 1 - (diffHours / (24 * 7))); // 1周衰减
                                        dimFactor *= ageAlpha;

                                        // 最近 6 小时的有额外呼吸
                                        if (diffHours < 6) {
                                            temporalPulse = Math.sin(Date.now() / 400) * 0.3 + 0.3;
                                        }
                                    }

                                    // 氛围色计算
                                    let auraColor = 'rgba(255,255,255,0.08)';
                                    if (node.type === 'user') auraColor = 'rgba(255, 255, 240, 0.12)'; // 暖白色/微金
                                    if (node.type === 'tag') auraColor = 'rgba(255, 255, 255, 0.05)';
                                    if (node.data?.aiScore > 80) auraColor = 'rgba(234, 179, 8, 0.15)'; // 优质内容金光

                                    // 1. User 节点: 绘制头像
                                    if (node.type === 'user') {
                                        const rawSize = (Math.sqrt(node.val || 1) * 6) + 12;
                                        const size = Math.min(64, Math.max(24, rawSize)) * s;
                                        const r = size / 2;

                                        ctx.save();

                                        // 🌟 节点外围聚光/星云效果 (仅对高权重或高亮节点)
                                        if ((heavyNode || glowIntensity > 0.1) && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r)) {
                                            const auraR = r * (1.05 + pulse * 0.1);
                                            if (Number.isFinite(auraR) && auraR > 0) {
                                                const gradient = ctx.createRadialGradient(x, y, r, x, y, auraR * 1.4);
                                                gradient.addColorStop(0, auraColor);
                                                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                                                ctx.fillStyle = gradient;
                                                ctx.beginPath();
                                                ctx.arc(x, y, auraR * 1.4, 0, 2 * Math.PI);
                                                ctx.fill();
                                            }
                                        }

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

                                    if (isHover || glowIntensity > 0.01 || temporalPulse > 0.1) {
                                        ctx.shadowColor = temporalPulse > 0.1 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                                        ctx.shadowBlur = ((isHover ? 15 : 12 * (glowIntensity + temporalPulse))) / globalScale;
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

                                // 连线配置
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
                                // 🌟 动态粒子流：全局常驻，高亮时加速
                                linkDirectionalParticles={(link: any) => {
                                    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                                    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
                                    const linkKey = `${sourceId}-${targetId}`;
                                    const reverseLinkKey = `${targetId}-${sourceId}`;
                                    const isHighlighted = highlightLinks.has(linkKey) || highlightLinks.has(reverseLinkKey);
                                    return isHighlighted ? 4 : 1;
                                }}
                                linkDirectionalParticleSpeed={(link: any) => {
                                    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                                    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
                                    const linkKey = `${sourceId}-${targetId}`;
                                    const reverseLinkKey = `${targetId}-${sourceId}`;
                                    const isHighlighted = highlightLinks.has(linkKey) || highlightLinks.has(reverseLinkKey);
                                    return isHighlighted ? 0.015 : 0.003;
                                }}
                                linkDirectionalParticleWidth={settings.particleWidth}
                                linkDirectionalParticleColor={() => "rgba(255,255,255,0.6)"}

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
                                onLinkClick={(link: any) => {
                                    if (selectedLink === link) {
                                        setSelectedLink(null);
                                    } else {
                                        setSelectedLink(link);
                                        setLockedNode(null); // 关闭节点锁定
                                    }
                                }}
                                onBackgroundClick={() => {
                                    // 点击空白处关闭锁定的卡片
                                    if (lockedNode) {
                                        setLockedNode(null);
                                        setHoverNode(null);
                                    }
                                    if (selectedLink) {
                                        setSelectedLink(null);
                                    }
                                }}
                            />
                        )}
                    </div>

                    {/* 🌟 连线详情卡片 (Intelligence Style) */}
                    {selectedLink && (() => {
                        const midX = (selectedLink.source.x + selectedLink.target.x) / 2;
                        const midY = (selectedLink.source.y + selectedLink.target.y) / 2;
                        const coords = fgRef.current?.graph2ScreenCoords(midX, midY);
                        if (!coords) return null;

                        const sourceNode = selectedLink.source;
                        const targetNode = selectedLink.target;
                        const type = selectedLink.linkType;

                        let relationText = "关联";
                        let description = "这两者之间存在数据连接";

                        if (type === 'author') {
                            relationText = "发布";
                            description = `${targetNode.label} 发布了这条推文`;
                        } else if (type === 'tag') {
                            relationText = "话题";
                            description = `该推文标记了 #${targetNode.label} 标签`;
                        } else if (type === 'reply') {
                            relationText = "回复";
                            description = `该推文是由于回复产生的连接`;
                        } else if (type === 'quote') {
                            relationText = "引用";
                            description = `该推文引用了另一个帖子`;
                        }

                        return (
                            <div
                                className="absolute pointer-events-auto z-[60] animate-in fade-in zoom-in-95 duration-300"
                                style={{ top: coords.y, left: coords.x, transform: 'translate(-50%, -100%) translateY(-20px)' }}
                            >
                                <div className="bg-zinc-950/90 backdrop-blur-2xl px-5 py-3 rounded-2xl border border-blue-500/30 shadow-[0_20px_40px_rgba(0,0,0,0.6),0_0_20px_rgba(59,130,246,0.1)] min-w-[200px] group">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{relationText}</span>
                                        </div>
                                        <button onClick={() => setSelectedLink(null)} className="text-zinc-600 hover:text-white transition-colors">✕</button>
                                    </div>
                                    <div className="text-xs text-zinc-300 leading-snug font-light whitespace-normal">
                                        {description}
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-2">
                                        <div className="text-[9px] font-mono text-zinc-600 truncate flex-1 flex items-center gap-1">
                                            {sourceNode.label.slice(0, 15)}...
                                            <span className="text-zinc-800">→</span>
                                            {targetNode.label.slice(0, 15)}...
                                        </div>
                                    </div>
                                    {/* 装饰三角形 */}
                                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-950 border-r border-b border-blue-500/30 rotate-45 transform" />
                                </div>
                            </div>
                        );
                    })()}

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
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                useUIStore.getState().openLightbox(
                                                                    activeNode.data.media,
                                                                    idx,
                                                                    activeNode.data.mediaAnalysis,
                                                                    activeNode.data.visionDescription
                                                                );
                                                            }}
                                                            className={`relative bg-zinc-900 overflow-hidden cursor-zoom-in group/media ${activeNode.data.media.length === 1 ? 'aspect-video' :
                                                                activeNode.data.media.length === 3 && idx === 0 ? 'row-span-2 aspect-[3/4]' :
                                                                    'aspect-square'
                                                                }`}
                                                        >
                                                            {item.type === 'video' || item.type === 'gif' ? (
                                                                <>
                                                                    <img
                                                                        src={item.previewUrl || item.url}
                                                                        alt=""
                                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/media:scale-110"
                                                                    />
                                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/media:bg-black/10 transition-colors">
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
                                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/media:scale-110"
                                                                />
                                                            )}
                                                            <div className="absolute inset-0 bg-white/0 group-hover/media:bg-white/10 transition-colors pointer-events-none" />
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
