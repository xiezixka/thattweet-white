import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';
import { forceX, forceY, forceManyBody, forceRadial } from 'd3-force';
import * as THREE from 'three';
import { useGraphData } from './hooks/useGraphData';
import { useUIStore } from '../../shared/store/useUIStore';
import { Heart, RefreshCw } from 'lucide-react';

import { GraphSettingsPanel, GraphSettings } from './components/GraphSettingsPanel';
import { GraphSearch } from './components/GraphSearch';

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
    const userSpriteCache = useRef<Map<string, THREE.Sprite>>(new Map());
    const nodeSpriteCache = useRef<Map<string, THREE.Sprite>>(new Map());
    const glowMaterialCache = useRef<Map<string, THREE.SpriteMaterial>>(new Map());
    const nodeImageCache = useRef<Map<string, HTMLImageElement | 'error'>>(new Map());
    const MAX_NODE_IMAGE_CACHE = 200;

    // 组件卸载时清理纹理
    useEffect(() => {
        return () => {
            userSpriteCache.current.forEach(sprite => {
                const material = sprite.material as THREE.SpriteMaterial;
                material?.dispose();
            });
            userSpriteCache.current.clear();
            nodeSpriteCache.current.clear();
            glowMaterialCache.current.forEach(material => material.dispose());
            glowMaterialCache.current.clear();
            nodeImageCache.current.clear();
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
        is3D: true,  // 默认 3D 模式
        clusterByTopic: false,
        temporalEvolution: false,
        showPanelOnHover: false, // 🚀 默认关闭：悬浮时不弹出面板，必须点击锁定才弹出
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

    const getUserCacheKey = useCallback((node: any) => {
        return (node.data?.handle || node.id || 'unknown') as string;
    }, []);

    const getGlowMaterial = useCallback((color: string, opacity: number, nodeType: 'tweet' | 'tag') => {
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
                const gradient = ctx.createRadialGradient(x, y, 4, x, y, r);
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.3, color);
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.generateMipmaps = false;
            texture.minFilter = THREE.LinearFilter;
            glowTextureCache.current.set(color, texture);
        }

        const materialKey = `${nodeType}_${color}_${opacity}`;
        let material = glowMaterialCache.current.get(materialKey);
        if (!material) {
            material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity,
                blending: nodeType === 'tweet' ? THREE.NormalBlending : THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: true
            });
            glowMaterialCache.current.set(materialKey, material);
        }
        return material;
    }, []);

    const getNodeImage = useCallback((cacheKey: string, src: string) => {
        const cache = nodeImageCache.current;
        const cached = cache.get(cacheKey);
        if (cached) {
            cache.delete(cacheKey);
            cache.set(cacheKey, cached);
            return cached;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        cache.set(cacheKey, img);

        if (cache.size > MAX_NODE_IMAGE_CACHE) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
        }

        img.onload = () => {
            if (cache.get(cacheKey) === img) {
                setRefreshCount(c => c + 1);
            }
        };
        img.onerror = () => {
            if (cache.get(cacheKey) === img) {
                cache.set(cacheKey, 'error');
                setRefreshCount(c => c + 1);
            }
        };

        return img;
    }, []);



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

    // 🌟 聚类标签功能已移除

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
        // 1. 🌟 3D 模式下添加星空背景 (增强版)
        if (settings.is3D && fgRef.current) {
            const scene = fgRef.current.scene();
            if (scene && !scene.getObjectByName('starfield')) {
                const geometry = new THREE.BufferGeometry();
                const count = 30000;
                const positions = new Float32Array(count * 3);
                const sizes = new Float32Array(count);

                for (let i = 0; i < count; i++) {
                    const isBackground = Math.random() > 0.2;
                    let r = isBackground ? 10000 + Math.random() * 90000 : 4000 + Math.random() * 6000;
                    const theta = 2 * Math.PI * Math.random();
                    const phi = Math.acos(2 * Math.random() - 1);
                    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
                    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
                    positions[i * 3 + 2] = r * Math.cos(phi);
                    sizes[i] = isBackground ? 4.0 : 2.0;
                }

                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

                const material = new THREE.PointsMaterial({
                    size: 1.5,
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.6,
                    sizeAttenuation: true
                });

                const stars = new THREE.Points(geometry, material);
                stars.name = 'starfield';
                scene.add(stars);
            }
        }

        // 2. 🌟 实时动力学参数调整 (覆盖 2D & 3D)
        const timeoutId = setTimeout(() => {
            const fg = fgRef.current;
            if (!fg || typeof fg.d3Force !== 'function') return;

            try {
                // 重置自动缩放标记 (仅在数据大变或初次加载时)
                // hasInitialZoomRef.current = false;

                // 🌟 基础斥力与连接距离
                fg.d3Force('charge')?.strength((node: any) => {
                    // 用户节点需要更强的斥力来推开周围的推文
                    const baseRepel = -settings.repelForce * (settings.is3D ? 4 : 1);
                    return node.type === 'user' ? baseRepel * 2.5 : baseRepel;
                });

                fg.d3Force('link')?.distance((link: any) => {
                    // 连接用户和推文的线稍微拉长一点，防止重叠
                    const baseDist = settings.linkDistance * (settings.is3D ? 1.5 : 1);
                    return (link.source.type === 'user' || link.target.type === 'user') ? baseDist * 1.5 : baseDist;
                });

                // 🌟 增加碰撞检测 (防止节点物理重叠)
                if (!fg.d3Force('collision')) {
                    fg.d3Force('collision', (node: any) => {
                        const radius = node.type === 'user' ? 25 : 15;
                        return radius * settings.nodeScale;
                    });
                }

                // 🌟 中心引力控制 (3D 模式下需要更弱的引力，否则会缩成一个球)
                const centerAlpha = settings.is3D ? settings.centerForce * 0.2 : settings.centerForce;

                if (!settings.is3D) {
                    const centerX = dimensions.w / 2;
                    const centerY = dimensions.h / 2;
                    if (!fg.d3Force('centerX')) {
                        fg.d3Force('centerX', forceX(centerX));
                        fg.d3Force('centerY', forceY(centerY));
                    }
                    fg.d3Force('centerX')?.strength(centerAlpha);
                    fg.d3Force('centerY')?.strength(centerAlpha);
                } else {
                    // 3D 模式使用原点作为重心
                    fg.d3Force('center')?.strength(centerAlpha);
                }

                // 🌟 聚类力场优化
                if (settings.clusterByTopic) {
                    fg.d3Force('charge')?.strength((node: any) => -settings.repelForce * 0.8);
                }

                // 🛡️ 只有在首次渲染或手动刷新时才重启物理模拟
                // 移除了之前的频繁 reheat，防止节点抖动

            } catch (err) {
                console.warn('[ConnectionsView] Physics update failed:', err);
            }
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [filteredData, settings, dimensions]);

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setDimensions({
                    w: containerRef.current.clientWidth,
                    h: containerRef.current.clientHeight
                });
            }
        };

        const ro = new ResizeObserver(updateSize);
        if (containerRef.current) ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
        };
    }, []);

    useEffect(() => {
        const activeNodeIds = new Set(filteredData.nodes.map((n: any) => n.id));
        const activeUserKeys = new Set(
            filteredData.nodes
                .filter((n: any) => n.type === 'user')
                .map((n: any) => getUserCacheKey(n))
        );

        const animState = nodeAnimStateRef.current;
        for (const key of animState.keys()) {
            if (!activeNodeIds.has(key)) {
                animState.delete(key);
            }
        }

        userSpriteCache.current.forEach((sprite, key) => {
            if (!activeUserKeys.has(key)) {
                const material = sprite.material as THREE.SpriteMaterial;
                material?.dispose();
                userSpriteCache.current.delete(key);
            }
        });

        userTextureCache.current.forEach((texture, key) => {
            if (!activeUserKeys.has(key)) {
                texture.dispose();
                userTextureCache.current.delete(key);
            }
        });

        nodeSpriteCache.current.forEach((sprite, key) => {
            if (!activeNodeIds.has(key)) {
                nodeSpriteCache.current.delete(key);
            }
        });
    }, [filteredData.nodes, getUserCacheKey]);

    // 🌟 动画循环：平滑更新节点状态
    useEffect(() => {
        if (settings.is3D) return;
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
    }, [filteredData.nodes, highlightNodes, lerp, settings.is3D]);

    useEffect(() => {
        if (!settings.is3D || !fgRef.current) return;

        let needsRefresh = false;

        filteredData.nodes.forEach((node: any) => {
            const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
            const focusOpacity = (lockedNode && !isHighlighted) ? 0.6 : 1.0;

            if (node.type === 'user') {
                const cacheKey = getUserCacheKey(node);
                const sprite = userSpriteCache.current.get(cacheKey);
                if (sprite) {
                    const material = sprite.material as THREE.SpriteMaterial;
                    if (material.opacity !== focusOpacity) {
                        material.opacity = focusOpacity;
                        needsRefresh = true;
                    }

                    const baseSize = (Math.sqrt(node.val || 1) * 6) + 20;
                    const size = Math.min(baseSize, 120);
                    if (sprite.scale.x !== size || sprite.scale.y !== size) {
                        sprite.scale.set(size, size, 1);
                        needsRefresh = true;
                    }
                }
                return;
            }

            const nodeType = node.type === 'tweet' ? 'tweet' : 'tag';
            const color = node.color || '#60a5fa';
            const material = getGlowMaterial(color, focusOpacity, nodeType);
            const sprite = nodeSpriteCache.current.get(node.id);
            if (sprite) {
                if (sprite.material !== material) {
                    sprite.material = material;
                    needsRefresh = true;
                }

                const val = node.val || 1;
                let baseSize = node.type === 'tweet' ? (Math.sqrt(val) * 2.5) + 6 : 8;
                const size = node.type === 'tweet' ? Math.min(baseSize, 40) : baseSize;
                if (sprite.scale.x !== size || sprite.scale.y !== size) {
                    sprite.scale.set(size, size, 1);
                    needsRefresh = true;
                }
            }
        });

        if (needsRefresh && fgRef.current) {
            fgRef.current.refresh();
        }
    }, [filteredData.nodes, highlightNodes, lockedNode, settings.is3D, getGlowMaterial, getUserCacheKey]);

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

            {/* 🔍 搜索框 - 左上角，标题下方 */}
            <div className="absolute top-24 left-8 z-20 pointer-events-auto">
                <GraphSearch
                    nodes={filteredData.nodes}
                    onSelect={(node) => {
                        // 锁定节点并显示侧边栏
                        setLockedNode(node);
                        setHoverNode(node);

                        // 平滑导航到节点（不会闪凸脸）
                        if (fgRef.current) {
                            if (settings.is3D) {
                                // 3D: 使用合适的距离，避免穿过节点
                                const distance = 400;
                                const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);
                                fgRef.current.cameraPosition(
                                    { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
                                    node,
                                    1000
                                );
                            } else {
                                // 2D: 只居中，不暴力缩放
                                fgRef.current.centerAt(node.x, node.y, 800);
                                if (fgRef.current.zoom() < 1.5) {
                                    fgRef.current.zoom(1.5, 800);
                                }
                            }
                        }
                    }}
                />
            </div>

            {/* 控制面板 */}
            <GraphSettingsPanel settings={settings} onUpdate={handleSettingUpdate} />

            {filteredData.nodes.length > 0 ? (
                <>
                    {/* 🌟 核心图谱组件容器 */}
                    <div className="w-full h-full">
                        {settings.is3D ? (
                            <ForceGraph3D
                                key="graph-3d" // 🌟 强制重新挂载，避免状态冲突
                                ref={fgRef}
                                width={dimensions.w}
                                height={dimensions.h}
                                graphData={filteredData}
                                backgroundColor="#09090b"
                                showNavInfo={false}
                                enableNodeDrag={false}
                                enableNavigationControls={true}

                                // 🛡️ 物理模拟稳定化参数
                                cooldownTime={3000} // 3秒后停止物理模拟
                                warmupTicks={50}    // 初始化时快速稳定

                                nodeRelSize={4}
                                nodeVal={d => d.val}
                                nodeThreeObject={(node: any) => {
                                    // 3D 节点定制 - 纯 Sprite 方案 (高性能 + 2D 视觉一致性)

                                    // 1. User ??: ???? + ?? (???)
                                    if (node.type === 'user') {
                                        const cacheKey = getUserCacheKey(node);
                                        const imgUrl = `https://unavatar.io/x/${cacheKey}?size=128&fallback=https://wsrv.nl/?url=${encodeURIComponent(node.img || '')}`;

                                        // ???????
                                        let texture = userTextureCache.current.get(cacheKey);

                                        if (!texture) {
                                            // ????? Canvas ???????
                                            const canvas = document.createElement('canvas');
                                            canvas.width = 128;
                                            canvas.height = 128;
                                            const ctx = canvas.getContext('2d');
                                            if (ctx) {
                                                // ??????
                                                ctx.fillStyle = '#18181b';
                                                ctx.beginPath();
                                                ctx.arc(64, 64, 60, 0, Math.PI * 2);
                                                ctx.fill();

                                                // ??????
                                                ctx.fillStyle = '#a1a1aa';
                                                ctx.font = 'bold 40px Arial';
                                                ctx.textAlign = 'center';
                                                ctx.textBaseline = 'middle';
                                                ctx.fillText((node.data?.name || '?').charAt(0).toUpperCase(), 64, 64);
                                            }

                                            texture = new THREE.CanvasTexture(canvas);
                                            texture.colorSpace = THREE.SRGBColorSpace;
                                            texture.generateMipmaps = false;
                                            texture.minFilter = THREE.LinearFilter;
                                            userTextureCache.current.set(cacheKey, texture); // ????

                                            // ?????????? Canvas
                                            const img = new Image();
                                            img.crossOrigin = "Anonymous";
                                            img.src = imgUrl;
                                            img.onload = () => {
                                                if (ctx) {
                                                    ctx.clearRect(0, 0, 128, 128);

                                                    // ?????? (????)
                                                    ctx.save();
                                                    ctx.shadowColor = 'rgba(255, 255, 255, 0.25)'; // ??????
                                                    ctx.shadowBlur = 6; // ??????
                                                    ctx.beginPath();
                                                    ctx.arc(64, 64, 60, 0, Math.PI * 2);
                                                    ctx.fillStyle = '#0a0a0a'; // ???????
                                                    ctx.fill();
                                                    ctx.restore();

                                                    // ?????????
                                                    ctx.save();
                                                    ctx.beginPath();
                                                    ctx.arc(64, 64, 60, 0, Math.PI * 2);
                                                    ctx.clip();
                                                    ctx.drawImage(img, 0, 0, 128, 128);

                                                    // ???? (????)
                                                    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; // ??????
                                                    ctx.lineWidth = 2; // ???
                                                    ctx.stroke();
                                                    ctx.restore();

                                                    if (texture) texture.needsUpdate = true;
                                                    if (fgRef.current) fgRef.current.refresh();
                                                }
                                            };
                                        }

                                        // ?? ????? Sprite & Material???????
                                        const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
                                        const opacity = (lockedNode && !isHighlighted) ? 0.6 : 1.0;

                                        let sprite = userSpriteCache.current.get(cacheKey);
                                        if (!sprite) {
                                            const material = new THREE.SpriteMaterial({
                                                map: texture,
                                                transparent: true,
                                                opacity: opacity,
                                                depthWrite: false,
                                                depthTest: true,
                                                sizeAttenuation: true
                                            });
                                            sprite = new THREE.Sprite(material);
                                            userSpriteCache.current.set(cacheKey, sprite);
                                        } else {
                                            const material = sprite.material as THREE.SpriteMaterial;
                                            if (material.map !== texture) {
                                                material.map = texture;
                                                material.needsUpdate = true;
                                            }
                                            material.opacity = opacity;
                                        }

                                        const baseSize = (Math.sqrt(node.val || 1) * 6) + 20;
                                        const size = Math.min(baseSize, 120);
                                        sprite.scale.set(size, size, 1);
                                        return sprite;
                                    }

                                    // 2. Tweet/Tag ??: ???? Canvas Sprite (???)
                                    const color = node.color || '#60a5fa';

                                    // ?? ??????????
                                    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
                                    const focusOpacity = (lockedNode && !isHighlighted) ? 0.6 : 1.0;
                                    const nodeType = node.type === 'tweet' ? 'tweet' : 'tag';

                                    const material = getGlowMaterial(color, focusOpacity, nodeType);
                                    const spriteKey = node.id;

                                    let sprite = nodeSpriteCache.current.get(spriteKey);
                                    if (!sprite) {
                                        sprite = new THREE.Sprite(material);
                                        nodeSpriteCache.current.set(spriteKey, sprite);
                                    } else if (sprite.material !== material) {
                                        sprite.material = material;
                                    }

                                    // ????
                                    const val = node.val || 1;
                                    // ?? ???????????????? + ????
                                    let baseSize = node.type === 'tweet' ? (Math.sqrt(val) * 2.5) + 6 : 8;
                                    const size = node.type === 'tweet' ? Math.min(baseSize, 40) : baseSize; // ??????? 40

                                    sprite.scale.set(size, size, 1);

                                    return sprite;
                                }}
                                nodeThreeObjectExtend={false}

                                linkCurvature={l => {
                                    // 🌟 如果是特殊的社交/语义连线，给一点弧度美感，防止双向互动时重叠
                                    const type = (l as any).linkType;
                                    return (type === 'social' || type === 'semantic') ? 0.15 : 0;
                                }}
                                linkDirectionalArrowLength={2.5}
                                linkDirectionalArrowRelPos={1} // 箭头在末端

                                linkColor={link => {
                                    const l = link as any;
                                    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                                    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                                    const isHighlighted = highlightLinks.has(`${sourceId}-${targetId}`) || highlightLinks.has(`${targetId}-${sourceId}`);

                                    // 🌟 社交互动 (回复/转发): 亮粉红
                                    if (l.linkType === 'social') return isHighlighted ? "#ff758f" : "rgba(255, 117, 143, 0.12)";
                                    // 🌟 语义/同好: 青绿色
                                    if (l.linkType === 'semantic') return isHighlighted ? "#00f5d4" : "rgba(0, 245, 212, 0.08)";

                                    return isHighlighted ? "rgba(255, 255, 255, 0.45)" : "rgba(255, 255, 255, 0.03)";
                                }}
                                linkWidth={link => {
                                    const l = link as any;
                                    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                                    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                                    const isHighlighted = highlightLinks.has(`${sourceId}-${targetId}`) || highlightLinks.has(`${targetId}-${sourceId}`);

                                    if (l.linkType === 'social' || l.linkType === 'semantic') return isHighlighted ? 1.0 : 0.3;
                                    return isHighlighted ? 0.6 : 0.15;
                                }}
                                linkDirectionalParticles={l => {
                                    const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                                    const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                                    const isHighlighted = highlightNodes.has(sourceId) || highlightNodes.has(targetId);

                                    // 🌟 只有在相关联或者高亮时才展示流光粒子，避免全局太乱
                                    if (!isHighlighted && (l as any).linkType !== 'social') return 0;

                                    const base = (l as any).linkType === 'social' ? 2 : 1;
                                    return isHighlighted ? base + 2 : base;
                                }}
                                linkDirectionalParticleWidth={l => {
                                    if ((l as any).linkType === 'social') return 2.5;
                                    return 1.2;
                                }}
                                linkDirectionalParticleSpeed={l => {
                                    const baseSpeed = 0.004;
                                    if ((l as any).linkType === 'social') return baseSpeed * 2.5;
                                    return baseSpeed;
                                }}

                                onNodeHover={node => {
                                    // 当鼠标移开节点时，node为null
                                    // 只有在没有锁定节点时才清空hoverNode
                                    if (!node && !lockedNode) {
                                        if (hoverNode) {
                                            setHoverNode(null);
                                        }
                                    } else if (node) {
                                        if (hoverNode?.id !== node.id) {
                                            setHoverNode(node);
                                            setShowFullText(false);
                                        }
                                    }
                                }}
                                onNodeClick={node => {
                                    // 🌟 3D模式：只锁定侧边栏，不移动相机
                                    // 这样避免了节点突然变大的闪烁效果
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

                                    // 🌟 聚焦模式：锁定节点后，非关联节点透明度降低
                                    if (lockedNode && !isHighlighted) {
                                        dimFactor *= 0.6;
                                    }

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

                                    // 1. User ??: ???? + ?? (???)
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

                                        // 🌟 LoD 分级显示：根据缩放级别决定渲染方式
                                        // 只在非常缩小的情况下才切换到简化模式
                                        const useSimplified = globalScale < 0.15;

                                        if (useSimplified) {
                                            // 🌟 简化模式：首字母 + 背景色
                                            ctx.fillStyle = '#1e3a5f'; // 蓝灰色背景
                                            ctx.fill();
                                            ctx.fillStyle = '#60a5fa'; // 蓝色文字
                                            ctx.font = `bold ${Math.max(8, size * 0.5)}px sans-serif`;
                                            ctx.textAlign = 'center';
                                            ctx.textBaseline = 'middle';
                                            const initial = (node.data?.name || node.label || '?').charAt(0).toUpperCase();
                                            ctx.fillText(initial, x, y);
                                        } else {
                                            const handle = node.data?.handle || node.id;
                                            const cacheKey = String(handle || node.id);
                                            const imgUrl = `https://unavatar.io/x/${handle}?size=64&fallback=https://wsrv.nl/?url=${encodeURIComponent(node.img || '')}`;
                                            const cachedImg = getNodeImage(cacheKey, imgUrl);

                                            if (cachedImg instanceof HTMLImageElement && cachedImg.complete && cachedImg.naturalWidth > 0) {
                                                ctx.clip();
                                                ctx.drawImage(cachedImg, x - r, y - r, size, size);
                                            } else if (cachedImg === 'error') {
                                                ctx.fillStyle = '#18181b';
                                                ctx.fill();
                                                ctx.fillStyle = '#a1a1aa';
                                                ctx.font = `bold ${Math.max(10, size * 0.4)}px sans-serif`;
                                                ctx.textAlign = 'center';
                                                ctx.textBaseline = 'middle';
                                                const initial = (node.label || '?').charAt(0).toUpperCase();
                                                ctx.fillText(initial, x, y);
                                            } else {
                                                ctx.fillStyle = '#18181b';
                                                ctx.fill();
                                            }
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
                                    // 当鼠标移开节点时，node为null
                                    // 只有在没有锁定节点时才清空hoverNode
                                    if (!node && !lockedNode) {
                                        if (hoverNode) {
                                            setHoverNode(null);
                                        }
                                    } else if (node) {
                                        if (hoverNode?.id !== node.id) {
                                            setHoverNode(node);
                                            setShowFullText(false);
                                        }
                                    }
                                }}
                                onNodeClick={(node) => {
                                    if (fgRef.current) {
                                        // 🌟 智能缩放：只居中节点，不强制放大
                                        // 这样可以避免节点突然占满屏幕的闪烁效果
                                        fgRef.current.centerAt(node.x, node.y, 600);

                                        // 只在当前缩放级别小于2时才轻微放大
                                        const currentZoom = fgRef.current.zoom();
                                        if (currentZoom < 2) {
                                            fgRef.current.zoom(2, 600); // 最多放大到2倍，而不是4倍
                                        }
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

                    {/* 🌟 左侧详情面板 (Left Sidebar) - Hover 自动显示 */}
                    <div
                        className={`fixed left-0 top-0 h-full w-[420px] bg-zinc-950/98 backdrop-blur-2xl border-r border-white/10 
                                    transform transition-all duration-500 ease-out z-50 overflow-y-auto overflow-x-hidden
                                    ${(lockedNode || (settings.showPanelOnHover && hoverNode)) ? 'translate-x-0 shadow-[0_0_80px_rgba(0,0,0,0.5)]' : '-translate-x-full'}`}
                        style={{
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 隐藏滚动条 */}
                        <style>{`
                            .fixed::-webkit-scrollbar { display: none; }
                        `}</style>

                        {(lockedNode || (settings.showPanelOnHover && hoverNode)) && (() => {
                            const activeNode = lockedNode || hoverNode;
                            const isLocked = !!lockedNode;
                            return (
                                <>
                                    {/* 关闭按钮 - 只在锁定时显示 */}
                                    {isLocked && (
                                        <button
                                            onClick={() => { setLockedNode(null); setHoverNode(null); }}
                                            className="absolute top-6 right-6 w-8 h-8 bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 
                                                   rounded-full flex items-center justify-center text-zinc-400 hover:text-white 
                                                   transition-all duration-200 z-10 group"
                                        >
                                            <span className="text-sm group-hover:scale-110 transition-transform">✕</span>
                                        </button>
                                    )}

                                    <div className="p-8 pb-16">
                                        {/* User 节点详情 */}
                                        {activeNode.type === 'user' && (
                                            <div className="space-y-6">
                                                {/* 用户头部 */}
                                                <div className="flex items-start gap-5">
                                                    <div className="w-20 h-20 rounded-2xl border-2 border-blue-500/30 overflow-hidden bg-zinc-900 shrink-0 
                                                                shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                                                        <img
                                                            src={`https://unavatar.io/x/${activeNode.data?.handle || activeNode.id}?fallback=https://wsrv.nl/?url=${encodeURIComponent(activeNode.img || '')}`}
                                                            className="w-full h-full object-cover"
                                                            alt={activeNode.label}
                                                        />
                                                    </div>
                                                    <div className="min-w-0 flex-1 pt-1">
                                                        <h2 className="font-black text-white text-2xl mb-1 tracking-tight">{activeNode.label}</h2>
                                                        <a
                                                            href={activeNode.data?.handle ? `https://x.com/${activeNode.data.handle}` : '#'}
                                                            target="_blank"
                                                            className="text-sm text-blue-400 font-mono hover:text-blue-300 transition-colors inline-flex items-center gap-1.5"
                                                        >
                                                            @{activeNode.data?.handle || activeNode.id}
                                                            <span className="text-xs opacity-60">↗</span>
                                                        </a>
                                                    </div>
                                                </div>

                                                {/* 用户简介 */}
                                                {activeNode.data?.description && (
                                                    <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5">
                                                        <p className="text-sm text-zinc-300 leading-relaxed italic font-serif">
                                                            "{activeNode.data.description}"
                                                        </p>
                                                    </div>
                                                )}

                                                {/* 统计数据 */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5">
                                                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2">粉丝数</div>
                                                        <div className="text-2xl font-black text-white">{(activeNode.data?.followersCount || 0).toLocaleString()}</div>
                                                    </div>
                                                    <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5">
                                                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2">节点权重</div>
                                                        <div className="text-2xl font-black text-blue-400">{Math.round(activeNode.val || 0)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tweet 节点详情 */}
                                        {activeNode.type === 'tweet' && (
                                            <div className="space-y-6">
                                                {/* 推文头部状态 */}
                                                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
                                                        <span className="text-xs font-black text-blue-500 uppercase tracking-[0.15em]">推文详情</span>
                                                    </div>
                                                    {activeNode.data?.tweetUrl && (
                                                        <a
                                                            href={activeNode.data.tweetUrl}
                                                            target="_blank"
                                                            className="text-xs text-zinc-500 hover:text-blue-400 transition-colors font-medium"
                                                        >
                                                            查看原文 ↗
                                                        </a>
                                                    )}
                                                </div>

                                                {/* 作者信息与操作 */}
                                                <div className="flex items-center justify-between bg-zinc-900/30 rounded-xl p-3 border border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden bg-zinc-900 shrink-0">
                                                            <img
                                                                src={activeNode.data?.author?.avatar ||
                                                                    activeNode.data?.authorAvatarUrl ||
                                                                    `https://unavatar.io/x/${activeNode.data?.author?.handle || activeNode.data?.authorId}?size=80`}
                                                                className="w-full h-full object-cover"
                                                                alt={activeNode.data?.author?.name || 'Author'}
                                                                onError={(e: any) => {
                                                                    e.target.src = 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-bold text-white text-sm truncate">
                                                                {activeNode.data?.author?.name || activeNode.data?.authorName || 'Unknown'}
                                                            </div>
                                                            <div className="text-xs text-zinc-500 font-mono">
                                                                @{activeNode.data?.author?.handle || activeNode.data?.authorId}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 💡 实用操作：跳转到作者主页 */}
                                                    {activeNode.data?.author?.handle && (
                                                        <a
                                                            href={`https://x.com/${activeNode.data.author.handle}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-[10px] font-black text-blue-400 transition-all uppercase tracking-wider"
                                                        >
                                                            查看主页
                                                        </a>
                                                    )}
                                                </div>

                                                {/* 推文内容 */}
                                                <div className="space-y-3">
                                                    <div className={`text-base text-zinc-100 leading-relaxed font-light ${showFullText ? '' : 'line-clamp-6'} 
                                                                     selection:bg-blue-500/30 whitespace-pre-wrap`}>
                                                        {activeNode.data?.text || activeNode.label}
                                                    </div>
                                                    {(activeNode.data?.text?.length > 150 || (activeNode.data?.text?.split('\n').length > 6)) && (
                                                        <button
                                                            onClick={() => setShowFullText(!showFullText)}
                                                            className="text-xs font-black text-zinc-500 hover:text-blue-400 uppercase tracking-widest transition-colors"
                                                        >
                                                            {showFullText ? '收起 ↑' : '展开全文 ↓'}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* 媒体展示区域 - 带 AI 描述预览 */}
                                                {activeNode.data?.media && activeNode.data.media.length > 0 && (
                                                    <div className="space-y-4">
                                                        <div className="space-y-2">
                                                            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">媒体内容</div>
                                                            <div className={`grid gap-2 rounded-xl overflow-hidden ${activeNode.data.media.length === 1 ? 'grid-cols-1' :
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
                                                                        className={`relative bg-zinc-900 rounded-lg overflow-hidden cursor-zoom-in group/media 
                                                                                border border-white/5 hover:border-blue-500/30 transition-all duration-300
                                                                                ${activeNode.data.media.length === 1 ? 'aspect-video' :
                                                                                activeNode.data.media.length === 3 && idx === 0 ? 'row-span-2 aspect-[3/4]' :
                                                                                    'aspect-square'}`}
                                                                    >
                                                                        {item.type === 'video' || item.type === 'gif' ? (
                                                                            <>
                                                                                <img
                                                                                    src={item.previewUrl || item.url}
                                                                                    alt=""
                                                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/media:scale-105"
                                                                                />
                                                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/media:bg-black/10 transition-colors">
                                                                                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                                                                        <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent ml-1" />
                                                                                    </div>
                                                                                </div>
                                                                            </>
                                                                        ) : (
                                                                            <img
                                                                                src={item.url}
                                                                                alt=""
                                                                                className="w-full h-full object-cover transition-transform duration-500 group-hover/media:scale-105"
                                                                            />
                                                                        )}
                                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover/media:opacity-100 transition-opacity pointer-events-none" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* 🧠 AI 洞察摘要 (可以直接在侧边栏看到，不用点击) */}
                                                        {(activeNode.data.visionDescription || activeNode.data.mediaAnalysis) && (
                                                            <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/10 space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                                    <div className="text-[10px] text-blue-400 uppercase tracking-widest font-black">AI 视觉描述</div>
                                                                </div>
                                                                <p className="text-xs text-zinc-400 leading-relaxed font-light">
                                                                    {activeNode.data.visionDescription || activeNode.data.mediaAnalysis}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* 互动数据 */}
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="bg-zinc-900/50 rounded-xl p-3 border border-white/5 text-center">
                                                        <Heart size={16} className="text-rose-500 mx-auto mb-1.5" />
                                                        <div className="text-xs font-mono text-zinc-400">{(activeNode.data?.favoriteCount || 0).toLocaleString()}</div>
                                                    </div>
                                                    <div className="bg-zinc-900/50 rounded-xl p-3 border border-white/5 text-center">
                                                        <RefreshCw size={16} className="text-emerald-500 mx-auto mb-1.5" />
                                                        <div className="text-xs font-mono text-zinc-400">{(activeNode.data?.retweetCount || 0).toLocaleString()}</div>
                                                    </div>
                                                    <div className="bg-zinc-900/50 rounded-xl p-3 border border-white/5 text-center">
                                                        <div className="text-lg font-black text-blue-400 mb-0.5">{Math.round(activeNode.val || 0)}</div>
                                                        <div className="text-[9px] text-zinc-600 uppercase tracking-wider">热度</div>
                                                    </div>
                                                </div>

                                                {/* 时间戳 */}
                                                <div className="text-xs text-zinc-600 font-mono text-center pt-2 border-t border-white/5">
                                                    {new Date(activeNode.data?.createdAt || 0).toLocaleString('zh-CN', {
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Tag 节点详情 */}
                                        {activeNode.type === 'tag' && (
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-5">
                                                    <div className="w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-blue-500/20 flex items-center justify-center 
                                                                text-4xl font-black text-blue-500/60 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                                                        #
                                                    </div>
                                                    <div className="flex-1">
                                                        <h2 className="font-black text-3xl text-white tracking-tighter uppercase mb-1">
                                                            {activeNode.label.replace('#', '')}
                                                        </h2>
                                                        <div className="text-xs text-zinc-500 uppercase tracking-[0.2em] font-medium">话题标签</div>
                                                    </div>
                                                </div>
                                                <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5">
                                                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2">节点权重</div>
                                                    <div className="text-2xl font-black text-blue-400">{Math.round(activeNode.val || 0)}</div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 🔗 关联关系探索 (Side Navigation) */}
                                        {(() => {
                                            // 找出与当前节点相连的所有节点 (利用 memo 里的 highlightNodes)
                                            const neighbors = Array.from(highlightNodes)
                                                .filter(id => id !== activeNode.id)
                                                .map(id => filteredData.nodes.find(n => n.id === id))
                                                .filter(Boolean)
                                                .slice(0, 6);

                                            if (neighbors.length === 0) return null;

                                            return (
                                                <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">关联节点</div>
                                                        <div className="text-[9px] text-zinc-600 font-mono">最近联系</div>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {neighbors.map((n: any) => (
                                                            <div
                                                                key={n.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setLockedNode(n);
                                                                    setHoverNode(n);

                                                                    // 🌟 智能导航：平滑移动到选中的关联节点
                                                                    if (fgRef.current) {
                                                                        if (settings.is3D) {
                                                                            const distance = 400;
                                                                            const distRatio = 1 + distance / Math.hypot(n.x, n.y, n.z);
                                                                            fgRef.current.cameraPosition(
                                                                                { x: n.x * distRatio, y: n.y * distRatio, z: n.z * distRatio },
                                                                                n,
                                                                                1000
                                                                            );
                                                                        } else {
                                                                            fgRef.current.centerAt(n.x, n.y, 800);
                                                                            if (fgRef.current.zoom() < 1.5) {
                                                                                fgRef.current.zoom(1.5, 800);
                                                                            }
                                                                        }
                                                                    }
                                                                }}
                                                                className="flex items-center gap-3 p-2 bg-zinc-900/30 border border-white/5 rounded-xl hover:bg-blue-500/10 hover:border-blue-500/20 transition-all cursor-pointer group/item"
                                                            >
                                                                <div className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 border flex items-center justify-center
                                                                    ${n.type === 'user' ? 'bg-blue-500/10 border-blue-500/20' :
                                                                        n.type === 'tweet' ? 'bg-emerald-500/10 border-emerald-500/20' :
                                                                            'bg-amber-500/10 border-amber-500/20'}`}>
                                                                    {n.type === 'tag' ? (
                                                                        <span className="text-amber-500 font-black text-lg">#</span>
                                                                    ) : (
                                                                        <img
                                                                            src={n.type === 'user'
                                                                                ? `https://unavatar.io/x/${n.data?.handle || n.id}?size=40`
                                                                                : n.data?.author?.handle
                                                                                    ? `https://unavatar.io/x/${n.data.author.handle}?size=40`
                                                                                    : n.img || `https://unavatar.io/x/${n.id}?size=40`
                                                                            }
                                                                            className="w-full h-full object-cover transition-all duration-300"
                                                                            onError={(e: any) => {
                                                                                e.target.style.display = 'none';
                                                                                e.target.parentNode.innerHTML = `<span class="text-[10px] font-bold text-zinc-500 uppercase">${n.label?.substring(0, 1)}</span>`;
                                                                            }}
                                                                        />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-[11px] font-bold text-zinc-300 truncate group-hover/item:text-white transition-colors">
                                                                        {n.label}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`text-[9px] uppercase font-black tracking-tighter
                                                                            ${n.type === 'user' ? 'text-blue-500/60' :
                                                                                n.type === 'tweet' ? 'text-emerald-500/60' :
                                                                                    'text-amber-500/60'}`}>
                                                                            {n.type === 'tweet' ? '相关推文' : n.type === 'user' ? '相关人物' : '话题'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="w-6 h-6 rounded-full bg-zinc-800 group-hover/item:bg-blue-500/20 flex items-center justify-center transition-all">
                                                                    <span className="text-[10px] text-zinc-500 group-hover/item:text-blue-500">→</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div >
                                </>
                            );
                        })()}
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-700 pointer-events-none">
                    <p className="font-light tracking-widest text-sm opacity-50">WAITING FOR SIGNAL...</p>
                </div>
            )
            }
        </div >
    );
};

export default ConnectionsView;
