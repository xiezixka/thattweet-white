import { db } from '../../../core/storage/db';
import { Tweet } from '../../../shared/types/tweet';

export interface SearchResult {
    tweet: Tweet;
    score: number;
    method: 'structured' | 'rag';
}

export interface SearchCriteria {
    keywords: string[];
}

export const ragService = {
    /**
     * 将自然语言分词
     */
    analyzeQuery(query: string): SearchCriteria {
        return {
            keywords: query.trim().toLowerCase().split(/\s+/).filter(w => w.length >= 1)
        };
    },

    /**
     * 执行混合搜索 (精确 + 评分)
     */
    async search(query: string, limit: number = 15): Promise<SearchResult[]> {
        const criteria = this.analyzeQuery(query);
        if (criteria.keywords.length === 0) return [];

        // 性能考虑，取最近 2000 条
        const candidates = await db.tweets.orderBy('savedAt').reverse().limit(2000).toArray();

        const results: SearchResult[] = candidates.map(tweet => {
            let score = 0;
            let method: 'structured' | 'rag' = 'rag';

            const text = (tweet.text || '').toLowerCase();
            const authorName = (tweet.authorName || '').toLowerCase();

            // 处理作者账号 (支持新旧版本)
            let authorHandle = '';
            if (typeof tweet.author === 'string') {
                authorHandle = tweet.author.toLowerCase();
            } else if (tweet.author && typeof (tweet.author as any).handle === 'string') {
                authorHandle = (tweet.author as any).handle.toLowerCase();
            }

            // 关键词多维度匹配
            criteria.keywords.forEach(keyword => {
                // 1. 作者匹配 (权重最高：50分)
                // 只要关键词包含在账号或昵称中，就视为精确匹配
                if (authorHandle.includes(keyword) || authorName.includes(keyword)) {
                    score += 50;
                    method = 'structured';
                }

                // 2. 正文匹配 (权重: 20分)
                if (text.includes(keyword)) {
                    score += 20;
                }

                // 3. AI 辅助数据匹配 (权重: 15分)
                if (tweet.aiSummary?.toLowerCase().includes(keyword)) score += 15;
                if (tweet.aiCategory?.toLowerCase().includes(keyword)) score += 15;
                if (tweet.ocrText?.toLowerCase().includes(keyword)) score += 15;
                if (tweet.visionDescription?.toLowerCase().includes(keyword)) score += 15;

                // 4. 标签匹配 (权重: 10分)
                if (tweet.tags?.some(tag => tag.toLowerCase().includes(keyword))) score += 10;
                if (tweet.aiTags?.some(tag => tag.toLowerCase().includes(keyword))) score += 10;
            });

            // 时间衰减 (24小时内加分)
            const hourDiff = (Date.now() - tweet.savedAt) / (1000 * 60 * 60);
            score += Math.max(0, 10 - (hourDiff / 24));

            return { tweet, score, method };
        });

        return results
            .filter(r => r.score > 10)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
};
