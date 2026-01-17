/**
 * RAG Service - 检索增强生成服务
 * 
 * 支持三种检索模式：
 * - structured: 精确关键词匹配 (作者、标签等)
 * - rag: 基于向量的语义检索 + Rerank
 * - auto: 智能融合两种模式
 */

import { db } from '../../../core/storage/db';
import { Tweet } from '../../../shared/types/tweet';
import { embeddingService, buildSearchableText } from './embeddingService';
import { rerankService } from './rerankService';

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
     * 将自然语言分词 (增强对中文的支持)
     */
    analyzeQuery(query: string): SearchCriteria {
        const text = query.trim().toLowerCase();

        // 1. 基础分词 (按空格)
        const words = text.split(/\s+/).filter(w => w.length >= 1);

        // 2. 针对中文的增强：如果包含中文字符，将每个中文字符也作为关键词 (简单的一元分词)
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];

        // 3. 去重合并
        const keywords = Array.from(new Set([...words, ...chineseChars]));

        return { keywords };
    },

    /**
     * 精确关键词搜索 (原有逻辑)
     */
    async structuredSearch(query: string, limit: number = 15, aiKeywords?: string[]): Promise<SearchResult[]> {
        const criteria = aiKeywords && aiKeywords.length > 0 ? { keywords: aiKeywords } : this.analyzeQuery(query);
        if (criteria.keywords.length === 0) return [];

        // 性能考虑，取最近 2000 条
        const candidates = await db.tweets.orderBy('savedAt').reverse().limit(2000).toArray();

        const results: SearchResult[] = candidates.map(tweet => {
            let score = 0;
            const method: 'structured' | 'rag' = 'structured';

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
                if (authorHandle.includes(keyword) || authorName.includes(keyword)) {
                    score += 50;
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

        const sortedResults = results
            .filter(r => r.score > 10)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        // 批量获取作者信息
        return Promise.all(sortedResults.map(async res => {
            const tweet = res.tweet;
            if (tweet.authorId) {
                const user = await db.users.get(tweet.authorId);
                if (user) {
                    (tweet as any).author = {
                        id: user.id,
                        handle: user.handle,
                        name: user.name,
                        avatar: user.avatar || (tweet as any).authorAvatarUrl
                    };
                }
            }
            return res;
        }));
    },

    /**
     * 向量语义搜索 + Rerank
     */
    async semanticSearch(query: string, limit: number = 10, aiKeywords?: string[]): Promise<SearchResult[]> {
        // Step 1: 向量检索 Top-50
        // 如果有 AI 提取的关键词，将关键词也合并到查询中，增强语义检索的准确性
        const searchQuery = aiKeywords && aiKeywords.length > 0 ? `${query} ${aiKeywords.join(' ')}` : query;
        const vectorResults = await embeddingService.vectorSearch(searchQuery, 50);

        if (vectorResults.length === 0) {
            console.log('[RAGService] No vector results, falling back to structured search');
            return this.structuredSearch(query, limit, aiKeywords);
        }

        // Step 2: 获取对应的推文
        const tweetIds = vectorResults.map(r => r.tweetId);
        const tweets = await db.tweets.bulkGet(tweetIds);
        const validTweets = tweets.filter((t): t is Tweet => t !== undefined);

        if (validTweets.length === 0) {
            return [];
        }

        // Step 3: 构建候选文档列表 (用于 Rerank)
        const tweetMap = new Map<string, Tweet>();
        const documents: string[] = [];
        const docToTweetId: string[] = [];

        for (const tweet of validTweets) {
            const text = buildSearchableText(tweet);
            documents.push(text);
            docToTweetId.push(tweet.id);
            tweetMap.set(tweet.id, tweet);
        }

        // Step 4: Rerank
        const rerankResults = await rerankService.rerank(query, documents, limit);

        // Step 5: 构建最终结果
        const results: SearchResult[] = [];

        for (const rr of rerankResults) {
            const tweetId = docToTweetId[rr.index];
            const tweet = tweetMap.get(tweetId);

            if (tweet) {
                // 填充作者信息
                if (tweet.authorId) {
                    const user = await db.users.get(tweet.authorId);
                    if (user) {
                        (tweet as any).author = {
                            id: user.id,
                            handle: user.handle,
                            name: user.name,
                            avatar: user.avatar || (tweet as any).authorAvatarUrl
                        };
                    }
                }

                results.push({
                    tweet,
                    score: rr.score * 100, // 归一化到 0-100
                    method: 'rag'
                });
            }
        }

        return results;
    },

    /**
     * 混合搜索 (自动融合精确和语义)
     */
    async hybridSearch(query: string, limit: number = 12, aiKeywords?: string[]): Promise<SearchResult[]> {
        // 并行执行两种搜索
        const [structuredResults, semanticResults] = await Promise.all([
            this.structuredSearch(query, limit, aiKeywords),
            this.semanticSearch(query, limit, aiKeywords)
        ]);

        // 合并结果，去重
        const seen = new Set<string>();
        const merged: SearchResult[] = [];

        // 优先取精确匹配的高分结果
        for (const r of structuredResults) {
            if (r.score >= 50 && !seen.has(r.tweet.id)) {
                seen.add(r.tweet.id);
                merged.push(r);
            }
        }

        // 然后取语义搜索结果
        for (const r of semanticResults) {
            if (!seen.has(r.tweet.id)) {
                seen.add(r.tweet.id);
                merged.push(r);
            }
        }

        // 补充精确匹配的低分结果
        for (const r of structuredResults) {
            if (!seen.has(r.tweet.id)) {
                seen.add(r.tweet.id);
                merged.push(r);
            }
        }

        return merged.slice(0, limit);
    },

    /**
     * 统一搜索入口
     */
    async search(query: string, limit: number = 15, mode: 'auto' | 'structured' | 'rag' = 'auto', aiKeywords?: string[]): Promise<SearchResult[]> {
        console.log(`[RAGService] Searching with mode: ${mode}, query: "${query.slice(0, 50)}...", keywords: ${aiKeywords?.join(',')}`);

        switch (mode) {
            case 'structured':
                return this.structuredSearch(query, limit, aiKeywords);

            case 'rag':
                return this.semanticSearch(query, limit, aiKeywords);

            case 'auto':
            default:
                return this.hybridSearch(query, limit, aiKeywords);
        }
    }
};
