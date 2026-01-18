import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/storage/db';

export interface GraphData {
    nodes: Array<{ id: string; group?: number; val?: number;[key: string]: any }>;
    links: Array<{ source: string; target: string; value?: number;[key: string]: any }>;
}

export function useGraphData() {
    // 使用 useLiveQuery 实时监听数据库变化
    // 只要 graphEdges, users, tweets 任何一个表发生变动，这个查询就会重新执行
    const data = useLiveQuery(async () => {
        try {
            // 1. 获取所有的边
            const edges = await db.graphEdges.toArray();

            // 2. 也是最重要的：通过边的关系来推断节点类型
            const userIds = new Set<string>();
            const tweetIds = new Set<string>();
            const tags = new Set<string>();

            edges.forEach(e => {
                // 推断 Source (通常都是 Tweet)
                if (e.type !== 'tag') tweetIds.add(e.source);

                // 推断 Target
                if (e.type === 'author') userIds.add(e.target);
                else if (e.type === 'reply' || e.type === 'quote') tweetIds.add(e.target);
                else if (e.type === 'tag') {
                    tweetIds.add(e.source);
                    tags.add(e.target);
                }
            });

            // 3. 批量查询元数据 (Rich Data Fetching)
            const [users, tweets] = await Promise.all([
                db.users.where('id').anyOf([...userIds]).toArray(),
                db.tweets.where('id').anyOf([...tweetIds]).toArray()
            ]);

            // 4. 用户融合 (Entity Resolution): 基于 handle 合并重复用户
            const userRedirectMap = new Map<string, string>(); // duplicateId -> canonicalId
            const handleMap = new Map<string, any>(); // handle -> User Object

            users.forEach(u => {
                if (!u.handle) return;
                const existing = handleMap.get(u.handle);
                if (existing) {
                    // 发现重复！保留那个有头像的，或者 ID 更大的
                    const keepExisting = !!existing.avatar && !u.avatar;

                    if (keepExisting) {
                        userRedirectMap.set(u.id, existing.id);
                    } else {
                        //由此 ID 篡位成为正统
                        userRedirectMap.set(existing.id, u.id);
                        handleMap.set(u.handle, u);
                    }
                } else {
                    handleMap.set(u.handle, u);
                }
            });

            // 4.1 重建 User Map (只保留 Canonical Users)
            const userMap = new Map<string, any>();
            handleMap.forEach((u) => userMap.set(u.id, u));

            // 4.2 Helper:以此获取最终 ID
            const getCanonicalId = (id: string) => userRedirectMap.get(id) || id;

            const tweetMap = new Map(tweets.map(t => [t.id, t]));

            // 5. 构建最终节点
            const nodeMap = new Map<string, any>();

            // Helper: 添加或更新节点权重
            const addNode = (rawId: string, type: 'user' | 'tweet' | 'tag', valDelta = 0) => {
                const id = getCanonicalId(rawId);

                if (!nodeMap.has(id)) {
                    let label = id;
                    let img = undefined;
                    let color = '#ccc';
                    let data = {};
                    let val = 1;

                    // 填充数据并计算权重
                    if (type === 'user') {
                        const u = userMap.get(id);
                        label = u ? (u.name || u.handle) : id;
                        img = u?.avatar;
                        color = '#ffffff';
                        data = u || {};

                        // 🌟 用户权重: 10 + 粉丝量的对数加成
                        const followers = Number(u?.followersCount || 0);
                        val = 10 + (Math.log10(followers + 1) * 5);
                    } else if (type === 'tweet') {
                        const t = tweetMap.get(id);
                        label = t ? (t.text?.slice(0, 40)) : 'Dead Link';
                        color = '#404040';
                        data = t || {};

                        // 🌟 推文权重: 2 + 互动量的开方加成
                        const likes = Number(t?.favoriteCount || 0);
                        const retweets = Number(t?.retweetCount || 0);
                        const replies = Number(t?.replyCount || 0);
                        const score = likes + (retweets * 2) + (replies * 3);
                        val = 2 + (Math.sqrt(score) * 1.5);
                    } else if (type === 'tag') {
                        label = id;
                        color = '#a1a1aa';
                        val = 5; // 标签固定大小
                    }

                    nodeMap.set(id, { id, type, label, img, color, val, data });
                } else if (valDelta > 0) {
                    // 如果是重复节点，仅微调权重
                    const node = nodeMap.get(id);
                    node.val += valDelta;
                }
            };

            // 遍历边来生成节点
            edges.forEach(e => {
                const source = getCanonicalId(e.source);
                const target = getCanonicalId(e.target);

                // 只有当 source != target 时才添加边 (避免自环)
                if (source === target) return;

                // Source 是 tweet (Tag除外)
                if (e.type !== 'tag') addNode(source, 'tweet', 0.5);
                else addNode(source, 'tweet', 0.0); // tag 的 source 也是 tweet，但不增加额外权重

                // Target 根据类型
                if (e.type === 'author') addNode(target, 'user', 1.5);
                else if (e.type === 'tag') addNode(target, 'tag', 0.8);
                else if (e.type === 'reply' || e.type === 'quote') addNode(target, 'tweet', 0.5);
            });

            const nodes = Array.from(nodeMap.values());

            // 6. 连线 (也需要重定向)
            const links = edges
                .map(e => ({
                    source: getCanonicalId(e.source),
                    target: getCanonicalId(e.target),
                    value: e.weight,
                    linkType: e.type // 🌟 传递关系类型
                }))
                .filter(l => l.source !== l.target); // 再次过滤自环

            return { nodes, links };
        } catch (e) {
            console.error("Failed to load graph", e);
            return { nodes: [], links: [] };
        }
    }, []);

    return {
        data: data || { nodes: [], links: [] },
        loading: !data
    };
}
