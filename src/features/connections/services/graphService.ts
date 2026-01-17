
import { db, GraphEdge } from '../../../core/storage/db';
import { Tweet } from '../../../shared/types/tweet';
import LZString from 'lz-string';

/**
 * 图谱构建服务
 * 负责将推文转化为图谱节点和连线
 */
export const GraphService = {
    /**
     * 处理单条推文的关系
     * 在 TweetRepository.saveTweet 后调用
     */
    async processTweet(tweet: Tweet) {
        const edges: Omit<GraphEdge, 'id'>[] = [];
        const NOW = Date.now();

        // 1. 作者连结 (Author Edge)
        // 权重: 1.0 (最强绑定)
        edges.push({
            source: tweet.id,
            target: tweet.authorId,
            type: 'author',
            weight: 1.0,
            createdAt: NOW
        });

        // 2. 回复连结 (Reply Edge)
        // 权重: 0.8 (强相关)
        if (tweet.replyToId) {
            edges.push({
                source: tweet.id,
                target: tweet.replyToId,
                type: 'reply',
                weight: 0.8,
                createdAt: NOW
            });
        }

        // 3. 标签连结 (Tag Edge)
        // 权重: 0.5 (主题聚类)
        // 合并手动标签和 AI 标签
        const allTags = new Set([
            ...(tweet.tags || []),
            ...(tweet.aiTags || [])
        ]);

        // 还没处理 TagMapping，先存原始标签，读取时再映射
        allTags.forEach(tag => {
            // 确保标签格式统一 (比如转小写或去除#)
            // 这里暂且保留原始格式，依靠 TagMapping 清洗
            edges.push({
                source: tweet.id,
                target: tag,
                type: 'tag',
                weight: 0.5,
                createdAt: NOW
            });
        });

        // 4. 尝试解析引用 (Quote Edge)
        // 权重: 0.7 (转发也是强关联)
        // 由于 Tweet 接口暂时没有 quotedId，尝试从 rawZip 解析
        if (tweet.rawZip) {
            try {
                const rawJson = JSON.parse(LZString.decompressFromUTF16(tweet.rawZip) || '{}');
                // 推特 API 结构通常是: legacy.retweeted_status_id_str 或 quoted_status_id_str
                // 或者是 result.legacy...
                // 深度防御式读取
                const legacy = rawJson.legacy || rawJson.result?.legacy || rawJson.tweet?.legacy;

                const quotedId = rawJson.quoted_status_id_str
                    || legacy?.quoted_status_id_str;

                if (quotedId) {
                    edges.push({
                        source: tweet.id,
                        target: quotedId,
                        type: 'quote',
                        weight: 0.7,
                        createdAt: NOW
                    });
                }
            } catch (e) {
                // 忽略解析错误，不阻碍主流程
            }
        }

        // 批量写入
        // 使用 put 来覆盖旧的相同 source+target+type 组合
        // 这样如果推文更新了，关系也会刷新
        await db.transaction('rw', db.graphEdges, async () => {
            // 先清理该推文产生的旧连线 (全量覆盖模式)
            // 这一步对于防止“标签删除了但连线还在”很重要
            await db.graphEdges.where('source').equals(tweet.id).delete();

            for (const edge of edges) {
                await db.graphEdges.put(edge as GraphEdge);
            }
        });
    },

    /**
     * 重建整个图谱 (Migrations or Data Fixes)
     * 耗时操作，建议显示 Loading
     */
    async rebuildAll() {
        console.time('GraphRebuild');
        // 清空
        await db.graphEdges.clear();

        // 流式处理所有推文
        const BATCH_SIZE = 100;
        let processed = 0;

        let offset = 0;
        while (true) {
            const tweets = await db.tweets.offset(offset).limit(BATCH_SIZE).toArray();
            if (tweets.length === 0) break;

            for (const tweet of tweets) {
                await this.processTweet(tweet);
            }

            processed += tweets.length;
            offset += BATCH_SIZE;
            console.log(`[GraphService] Processed ${processed} tweets...`);
        }
        console.timeEnd('GraphRebuild');
        return processed;
    }
};
