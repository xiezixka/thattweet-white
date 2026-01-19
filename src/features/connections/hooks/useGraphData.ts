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
            // 🌟 1. 改为直接拉取所有数据，不再依赖 edges 作为入口
            // 这样即使旧数据没有 Edge，我们也能在内存中通过逻辑把它们连起来
            const [allUsers, allTweets, edges] = await Promise.all([
                db.users.toArray(),
                db.tweets.toArray(),
                db.graphEdges.toArray()
            ]);

            const userIds = new Set(allUsers.map(u => u.id));
            const tweetIds = new Set(allTweets.map(t => t.id));

            // 2. 建立重定向 Map
            const userRedirectMap = new Map<string, string>();
            const handleMap = new Map<string, any>();

            allUsers.forEach(u => {
                if (!u.handle) return;
                const normalizedHandle = u.handle.toLowerCase(); // 统一小写处理防止匹配失败
                const existing = handleMap.get(normalizedHandle);
                if (existing) {
                    const keepExisting = !!existing.avatar && !u.avatar;
                    if (keepExisting) userRedirectMap.set(u.id, existing.id);
                    else {
                        userRedirectMap.set(existing.id, u.id);
                        handleMap.set(normalizedHandle, u);
                    }
                } else {
                    handleMap.set(normalizedHandle, u);
                }
            });

            const userMap = new Map<string, any>();
            handleMap.forEach((u) => userMap.set(u.id, u));

            const getCanonicalId = (id: string) => userRedirectMap.get(id) || id;
            const tweetMap = new Map(allTweets.map(t => [t.id, t]));

            // 3. 统计
            const userStats = new Map<string, { tweetCount: number; totalEngagement: number }>();
            allTweets.forEach(t => {
                const authorId = getCanonicalId(t.authorId);
                if (!authorId) return;
                const existing = userStats.get(authorId) || { tweetCount: 0, totalEngagement: 0 };
                existing.tweetCount += 1;
                existing.totalEngagement += (t.favoriteCount || 0) + (t.retweetCount || 0) * 2;
                userStats.set(authorId, existing);
            });

            // 6. 构建最终节点
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
                        const stats = userStats.get(id) || { tweetCount: 0, totalEngagement: 0 };

                        label = u ? (u.name || u.handle) : id;
                        img = u?.avatar;
                        color = '#ffffff';
                        data = { ...u, stats }; // 附加统计数据

                        // 🌟 用户权重: 基础 + 粉丝量 + 推文数 + 互动量
                        const followers = Number(u?.followersCount || 0);
                        val = 12                                          // 基础大小增加
                            + (Math.log10(followers + 1) * 2)             // 粉丝量 (对数)
                            + (Math.sqrt(stats.tweetCount) * 4)           // 推文数 (开方)
                            + (Math.sqrt(stats.totalEngagement / 100) * 3); // 互动量 (开方)
                    } else if (type === 'tweet') {
                        const t = tweetMap.get(id);
                        label = t ? (t.text?.slice(0, 40)) : 'Dead Link';
                        color = '#404040';

                        // 🌟 丰富作者信息
                        let enrichedAuthor = null;
                        if (t?.authorId) {
                            const canonicalAuthorId = getCanonicalId(t.authorId);
                            enrichedAuthor = userMap.get(canonicalAuthorId);
                        }

                        data = {
                            ...t,
                            author: enrichedAuthor || t?.author || { id: t?.authorId }
                        };

                        const likes = Number(t?.favoriteCount || 0);
                        const score = likes + (Number(t?.retweetCount || 0) * 2);
                        val = 3 + (Math.sqrt(score) * 1.5);
                    } else if (type === 'tag') {
                        label = id;
                        color = '#a1a1aa';
                        val = 5;
                    }

                    nodeMap.set(id, { id, type, label, img, color, val, data });
                } else if (valDelta > 0) {
                    const node = nodeMap.get(id);
                    node.val += valDelta;
                }
            };

            // 🌟 7. 派生更深层的连线 (Social & Semantic)
            const derivedLinks: any[] = [];

            // 7.1 社交互动边 (User -> User): 基于回复/引用/转发
            allTweets.forEach((t: any) => {
                const sourceUser = getCanonicalId(t.authorId);
                const targets = new Set<string>(); // 一个推文可能关联多个目标用户

                // A. 处理回复 (Reply) - replyToUser 是用户 Handle
                if (t.replyToUser) {
                    const normalizedReplyHandle = t.replyToUser.toLowerCase();
                    const target = Array.from(userMap.values()).find((u: any) => u.handle?.toLowerCase() === normalizedReplyHandle);

                    if (target) targets.add(getCanonicalId(target.id));
                    else targets.add(`phantom-${t.replyToUser}`);
                }

                // B. 处理转发 (Retweet) - retweetFromId 是推文 ID，需要找到其作者
                if ((t as any).retweetFromId) {
                    const originalTweet = tweetMap.get((t as any).retweetFromId);
                    if (originalTweet) {
                        const originalAuthor = getCanonicalId(originalTweet.authorId);
                        if (originalAuthor && originalAuthor !== sourceUser) {
                            targets.add(originalAuthor);
                        }
                    }
                    // 如果找不到原推文，不创建虚假的用户节点
                }

                // C. 处理引用 (Quote) - quoteFromId 也是推文 ID
                if ((t as any).quoteFromId) {
                    const quotedTweet = tweetMap.get((t as any).quoteFromId);
                    if (quotedTweet) {
                        const quotedAuthor = getCanonicalId(quotedTweet.authorId);
                        if (quotedAuthor && quotedAuthor !== sourceUser) {
                            targets.add(quotedAuthor);
                        }
                    }
                }

                // D. 🌟 处理推文到推文的直接关联 (Thread/Reply/Retweet)
                // 如果目标推文不在数据库里，我们创建一个幻影推文节点（不是用户节点）
                const tweetLineage = [
                    { id: t.replyToId, type: 'reply' },
                    { id: (t as any).retweetFromId, type: 'retweet' },
                    { id: (t as any).quoteFromId, type: 'quote' }
                ];

                tweetLineage.forEach(link => {
                    if (!link.id) return;
                    const canonicalTarget = link.id; // 不要 getCanonicalId，这是推文 ID

                    // 如果这个推文不在数据库里，创建幻影推文节点
                    if (!tweetMap.has(canonicalTarget) && !nodeMap.has(canonicalTarget)) {
                        nodeMap.set(canonicalTarget, {
                            id: canonicalTarget,
                            type: 'tweet',
                            label: link.type === 'reply' ? '原帖' : (link.type === 'retweet' ? '被转发' : '被引用'),
                            color: '#333',
                            val: 3,
                            data: {
                                isPhantom: true,
                                tweetUrl: `https://x.com/i/status/${canonicalTarget}` // 提供跳转链接
                            }
                        });
                    }
                });

                // 建立 User -> User 的强关联 (维持原有逻辑)
                targets.forEach(targetId => {
                    if (sourceUser && targetId && sourceUser !== targetId) {
                        derivedLinks.push({
                            source: sourceUser,
                            target: targetId,
                            value: 5,
                            linkType: 'social',
                            label: '社交互动'
                        });

                        // 确保 source 节点存在
                        addNode(sourceUser, 'user');

                        // 确保 target 节点存在
                        if (targetId.startsWith('phantom-')) {
                            const handle = targetId.replace('phantom-', '');
                            if (!nodeMap.has(targetId)) {
                                nodeMap.set(targetId, {
                                    id: targetId,
                                    type: 'user',
                                    label: `@${handle}`,
                                    img: `https://unavatar.io/x/${handle}`,
                                    color: '#444', // 幻影节点用深灰色
                                    val: 10,
                                    data: { handle, isPhantom: true }
                                });
                            }
                        } else {
                            addNode(targetId, 'user');
                        }
                    }
                });
            });

            // 7.2 语义/同好边 (User -> User): 基于 AI 关键词重合
            const usersList = Array.from(userMap.values());
            for (let i = 0; i < usersList.length; i++) {
                for (let j = i + 1; j < usersList.length; j++) {
                    const u1 = usersList[i];
                    const u2 = usersList[j];

                    const k1 = new Set(u1.aiProfile?.keywords || []);
                    const k2 = new Set(u2.aiProfile?.keywords || []);

                    if (k1.size === 0 || k2.size === 0) continue;

                    // 计算交集
                    const intersection = Array.from(k1).filter(k => k2.has(k));
                    if (intersection.length >= 2) { // 至少有2个共同关键词
                        const id1 = getCanonicalId(u1.id);
                        const id2 = getCanonicalId(u2.id);
                        derivedLinks.push({
                            source: id1,
                            target: id2,
                            value: 2,
                            linkType: 'semantic', // 🌟 语义/同好连线
                            label: `共同关注: ${intersection.slice(0, 2).join(', ')}`
                        });
                        addNode(id1, 'user');
                        addNode(id2, 'user');
                    }
                }
            }

            // 8. 遍历原有边来生成节点
            edges.forEach(e => {
                const source = getCanonicalId(e.source);
                const target = getCanonicalId(e.target);
                if (source === target) return;

                if (e.type !== 'tag') addNode(source, 'tweet', 0.5);
                else addNode(source, 'tweet', 0.0);

                if (e.type === 'author') addNode(target, 'user', 1.5);
                else if (e.type === 'tag') addNode(target, 'tag', 0.8);
                else if (e.type === 'reply' || e.type === 'quote') addNode(target, 'tweet', 0.5);
            });

            // 9. 汇总连线
            const originalLinks = edges
                .map(e => ({
                    source: getCanonicalId(e.source),
                    target: getCanonicalId(e.target),
                    value: e.weight || 1,
                    linkType: e.type
                }))
                .filter(l => l.source !== l.target);


            return {
                nodes: Array.from(nodeMap.values()),
                links: [...originalLinks, ...derivedLinks]
            };
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
