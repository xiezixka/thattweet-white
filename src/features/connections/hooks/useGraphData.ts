import { useState, useEffect } from 'react';
import { db } from '../../../core/storage/db';

export interface GraphData {
    nodes: Array<{ id: string; group?: number; val?: number;[key: string]: any }>;
    links: Array<{ source: string; target: string; value?: number;[key: string]: any }>;
}

export function useGraphData() {
    const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setLoading(true);
            console.time('GraphLoad');
            try {
                // 1. 获取所有的边
                const edges = await db.graphEdges.toArray();

                // 2. 提取所有涉及的节点 ID 并初判类型
                const nodeMap = new Map<string, { id: string, val: number, color?: string }>();

                // 辅助：快速判断类型
                const getType = (id: string) => {
                    if (id.startsWith('#')) return 'tag';
                    if (id.match(/^\d+$/)) return 'user_or_tweet'; // 纯数字可能是推文或用户ID
                    return 'unknown';
                };

                // 3. 构建临时节点
                edges.forEach(e => {
                    if (!nodeMap.has(e.source)) {
                        nodeMap.set(e.source, { id: e.source, val: 1 });
                    }
                    if (!nodeMap.has(e.target)) {
                        nodeMap.set(e.target, { id: e.target, val: 1 });
                    }

                    // 增加连线双方的权重 (简单的度中心性 Degree Centrality)
                    nodeMap.get(e.source)!.val += 0.5;
                    nodeMap.get(e.target)!.val += 0.5;
                });

                // 4. 构建最终数组
                const nodes = Array.from(nodeMap.values());

                // 5. 构建连线
                const links = edges.map(e => ({
                    source: e.source,
                    target: e.target,
                    value: e.weight,
                    type: e.type // 传递类型以供渲染颜色
                }));

                console.log(`[Graph] Loaded ${nodes.length} nodes, ${links.length} edges`);
                setData({ nodes, links });
            } catch (e) {
                console.error("Failed to load graph", e);
            } finally {
                setLoading(false);
                console.timeEnd('GraphLoad');
            }
        }

        load();
    }, []);

    return { data, loading };
}
