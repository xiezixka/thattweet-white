/**
 * Embedding Service - 向量嵌入生成与管理
 * 
 * 功能：
 * - 调用远程 Embedding API 生成文本向量
 * - 量化压缩 (float32 → uint8) 节省存储空间
 * - 管理 IndexedDB 中的向量存储
 * - 支持增量同步
 */

import { db, EmbeddingRecord } from '../../../core/storage/db';
import { Tweet } from '../../../shared/types/tweet';
import { AISettings, DEFAULT_AI_SETTINGS, getSafeAISettings } from '../../../shared/types/settings';

// ================================
// 类型定义
// ================================

export interface EmbeddingResult {
    tweetId: string;
    vector: number[];       // 原始 float32 向量
    success: boolean;
    error?: string;
}

export interface SyncProgress {
    total: number;
    processed: number;
    failed: number;
    currentBatch: number;
    status: 'idle' | 'syncing' | 'completed' | 'error';
    message?: string;
}

// ================================
// 向量操作工具函数
// ================================

/**
 * 计算简单哈希 (用于检测文本变化)
 */
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转为 32 位整数
    }
    return hash.toString(36);
}

/**
 * 量化压缩：float32[] → uint8[]
 * 线性量化到 [0, 255] 范围
 */
export function quantizeVector(vector: number[]): { quantized: Uint8Array; min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;

    for (const v of vector) {
        if (v < min) min = v;
        if (v > max) max = v;
    }

    const range = max - min || 1; // 防止除零
    const quantized = new Uint8Array(vector.length);

    for (let i = 0; i < vector.length; i++) {
        quantized[i] = Math.round(((vector[i] - min) / range) * 255);
    }

    return { quantized, min, max };
}

/**
 * 反量化：uint8[] → float32[]
 */
export function dequantizeVector(quantized: Uint8Array, min: number, max: number): number[] {
    const range = max - min || 1;
    const vector = new Array(quantized.length);

    for (let i = 0; i < quantized.length; i++) {
        vector[i] = (quantized[i] / 255) * range + min;
    }

    return vector;
}

/**
 * 计算余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * 构建推文的可检索文本
 */
export function buildSearchableText(tweet: Tweet): string {
    const parts: string[] = [];

    // 作者信息
    if (tweet.authorName) {
        parts.push(`@${tweet.authorName}`);
    }

    // 正文
    if (tweet.text) {
        parts.push(tweet.text);
    }

    // OCR 文字
    if (tweet.ocrText?.trim()) {
        parts.push(`[图片文字] ${tweet.ocrText}`);
    }

    // Vision 描述
    if (tweet.visionDescription?.trim()) {
        parts.push(`[图片内容] ${tweet.visionDescription}`);
    }

    // AI 摘要
    if (tweet.aiSummary?.trim()) {
        parts.push(`[摘要] ${tweet.aiSummary}`);
    }

    // 标签
    const allTags = [...(tweet.tags || []), ...(tweet.aiTags || [])];
    if (allTags.length > 0) {
        parts.push(`[标签] ${allTags.join(', ')}`);
    }

    return parts.join('\n').trim();
}

// ================================
// Embedding API 调用
// ================================

async function getSettings(): Promise<AISettings> {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(['aiSettings'], (res) => {
                resolve(getSafeAISettings(res.aiSettings));
            });
        } else {
            resolve(DEFAULT_AI_SETTINGS);
        }
    });
}

/**
 * 智能获取 API Key
 */
function getApiKey(settings: AISettings): string {
    let apiKey = settings.ragApiKey;
    if (!apiKey) {
        const embeddingUrl = settings.embeddingUrl || 'https://api.siliconflow.cn/v1/embeddings';

        // 尝试匹配地址相近的 Provider
        let matchedProvider = settings.providers.find(p =>
            p.baseUrl && embeddingUrl.includes(new URL(p.baseUrl).hostname)
        );

        // 如果没匹配到，用默认的
        if (!matchedProvider) {
            matchedProvider = settings.providers.find(p => p.id === settings.defaultProviderId);
        }

        apiKey = matchedProvider?.apiKey || '';
        console.log(`[EmbeddingService] Using ${matchedProvider ? matchedProvider.name : 'fallback'} API key`);
    }
    return apiKey;
}

/**
 * 调用 Embedding API
 */
async function callEmbeddingAPI(
    texts: string[],
    apiKey: string,
    apiUrl: string,
    model: string
): Promise<number[][]> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            input: texts,
            encoding_format: 'float'
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 提取向量 (OpenAI 兼容格式)
    if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid embedding response format');
    }

    return data.data.map((item: any) => item.embedding);
}

// ================================
// 嵌入服务核心
// ================================

export const embeddingService = {
    /**
     * 获取需要生成 embedding 的推文
     */
    async getTweetsNeedingEmbedding(modelId: string, limit: number = 100): Promise<Tweet[]> {
        // 获取所有推文 ID
        const allTweets = await db.tweets.orderBy('savedAt').reverse().limit(limit * 2).toArray();

        // 获取已有的 embedding
        const existingEmbeddings = await db.embeddings
            .where('modelId')
            .equals(modelId)
            .toArray();

        const existingMap = new Map<string, EmbeddingRecord>();
        for (const e of existingEmbeddings) {
            existingMap.set(e.tweetId, e);
        }

        // 找出需要更新的推文
        const needsUpdate: Tweet[] = [];

        for (const tweet of allTweets) {
            if (needsUpdate.length >= limit) break;

            const existing = existingMap.get(tweet.id);
            const searchText = buildSearchableText(tweet);
            const textHash = simpleHash(searchText);

            // 需要新建或更新的条件
            if (!existing || existing.textHash !== textHash) {
                needsUpdate.push(tweet);
            }
        }

        return needsUpdate;
    },

    /**
     * 批量生成 embeddings (自适应分批逻辑)
     */
    async generateEmbeddings(
        tweets: Tweet[],
        onProgress?: (progress: SyncProgress) => void
    ): Promise<EmbeddingResult[]> {
        const settings = await getSettings();
        if (!settings.ragEnabled) throw new Error('RAG is not enabled');

        // 智能获取 API Key
        const apiKey = getApiKey(settings);

        const apiUrl = settings.embeddingUrl || 'https://api.siliconflow.cn/v1/embeddings';
        const model = settings.embeddingModel || 'BAAI/bge-m3';

        const results: EmbeddingResult[] = [];
        let processedCount = 0;

        // 内部辅助函数：处理一个特定的推文序列
        const processChunk = async (chunk: Tweet[], currentBatchSize: number) => {
            if (chunk.length === 0) return;

            onProgress?.({
                total: tweets.length,
                processed: processedCount,
                failed: results.filter(r => !r.success).length,
                currentBatch: 0,
                status: 'syncing',
                message: `正在处理批次 (容量: ${currentBatchSize})...`
            });

            try {
                const texts = chunk.map(t => buildSearchableText(t));
                const vectors = await callEmbeddingAPI(texts, apiKey, apiUrl, model);

                for (let i = 0; i < chunk.length; i++) {
                    results.push({ tweetId: chunk[i].id, vector: vectors[i], success: true });
                }
                processedCount += chunk.length;
            } catch (error: any) {
                console.warn(`[EmbeddingService] Batch of ${chunk.length} failed. Reason: ${error.message}`);

                // 如果批次已经很小 (<= 5)，则直接标记失败，不再切分
                if (chunk.length <= 5) {
                    for (const tweet of chunk) {
                        results.push({ tweetId: tweet.id, vector: [], success: false, error: error.message });
                    }
                    processedCount += chunk.length;
                    return;
                }

                // 错误时执行减半尝试逻辑
                const half = Math.ceil(chunk.length / 2);
                const firstHalf = chunk.slice(0, half);
                const secondHalf = chunk.slice(half);

                console.log(`[EmbeddingService] Retrying with smaller batches: ${firstHalf.length} and ${secondHalf.length}`);
                await processChunk(firstHalf, firstHalf.length);
                await processChunk(secondHalf, secondHalf.length);
            }
        };

        // 按 64 为初始大组进行切分 (SiliconFlow 的上限是 64)
        const initialBatchSize = 64;
        for (let i = 0; i < tweets.length; i += initialBatchSize) {
            const initialChunk = tweets.slice(i, i + initialBatchSize);
            await processChunk(initialChunk, initialBatchSize);
        }

        return results;
    },

    /**
     * 保存 embeddings 到数据库
     */
    async saveEmbeddings(results: EmbeddingResult[], modelId: string): Promise<number> {
        const now = Date.now();
        let savedCount = 0;

        for (const result of results) {
            if (!result.success || result.vector.length === 0) continue;

            const tweet = await db.tweets.get(result.tweetId);
            if (!tweet) continue;

            const { quantized, min, max } = quantizeVector(result.vector);
            const textHash = simpleHash(buildSearchableText(tweet));

            const record: EmbeddingRecord = {
                tweetId: result.tweetId,
                vector: quantized,
                vectorMin: min,
                vectorMax: max,
                textHash,
                modelId,
                createdAt: now,
                updatedAt: now
            };

            await db.embeddings.put(record);
            savedCount++;
        }

        return savedCount;
    },

    /**
     * 同步所有缺失的 embeddings
     */
    async syncAll(onProgress?: (progress: SyncProgress) => void): Promise<{ success: number; failed: number }> {
        const settings = await getSettings();
        const modelId = settings.embeddingModel || 'BAAI/bge-m3';

        onProgress?.({
            total: 0, processed: 0, failed: 0, currentBatch: 0, status: 'syncing',
            message: '正在检查需要更新的推文...'
        });

        // 提升上限到 1000 条
        const tweetsToProcess = await this.getTweetsNeedingEmbedding(modelId, 1000);

        if (tweetsToProcess.length === 0) {
            onProgress?.({
                total: 0, processed: 0, failed: 0, currentBatch: 0, status: 'completed',
                message: '所有推文已同步完成'
            });
            return { success: 0, failed: 0 };
        }

        onProgress?.({
            total: tweetsToProcess.length,
            processed: 0,
            failed: 0,
            currentBatch: 0,
            status: 'syncing',
            message: `发现 ${tweetsToProcess.length} 条推文需要处理`
        });

        // 生成 embeddings
        const results = await this.generateEmbeddings(tweetsToProcess, onProgress);

        // 保存到数据库
        const savedCount = await this.saveEmbeddings(results, modelId);
        const failedCount = results.filter(r => !r.success).length;

        onProgress?.({
            total: tweetsToProcess.length,
            processed: savedCount + failedCount,
            failed: failedCount,
            currentBatch: 0,
            status: 'completed',
            message: `同步完成：成功 ${savedCount}，失败 ${failedCount}`
        });

        return { success: savedCount, failed: failedCount };
    },

    /**
     * 向量搜索 (返回 Top-K 候选)
     */
    async vectorSearch(queryText: string, topK: number = 50): Promise<{
        tweetId: string;
        score: number;
    }[]> {
        const settings = await getSettings();

        if (!settings.ragEnabled) {
            return [];
        }

        const apiKey = getApiKey(settings);
        const apiUrl = settings.embeddingUrl || 'https://api.siliconflow.cn/v1/embeddings';
        const model = settings.embeddingModel || 'BAAI/bge-m3';

        if (!apiKey) {
            console.warn('[EmbeddingService] RAG API Key not configured and no fallback found');
            return [];
        }

        // 生成查询向量
        let queryVector: number[];
        try {
            const vectors = await callEmbeddingAPI([queryText], apiKey, apiUrl, model);
            queryVector = vectors[0];
        } catch (error) {
            console.error('[EmbeddingService] Failed to generate query embedding:', error);
            return [];
        }

        // 获取所有 embeddings
        const allEmbeddings = await db.embeddings
            .where('modelId')
            .equals(model)
            .toArray();

        if (allEmbeddings.length === 0) {
            return [];
        }

        // 计算相似度
        const scores: { tweetId: string; score: number }[] = [];

        for (const record of allEmbeddings) {
            const docVector = dequantizeVector(record.vector, record.vectorMin, record.vectorMax);
            const score = cosineSimilarity(queryVector, docVector);
            scores.push({ tweetId: record.tweetId, score });
        }

        // 排序并返回 Top-K
        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, topK);
    },

    /**
     * 获取统计信息
     */
    async getStats(): Promise<{
        totalEmbeddings: number;
        totalTweets: number;
        coveragePercent: number;
        modelId: string;
    }> {
        const settings = await getSettings();
        const modelId = settings.embeddingModel || 'BAAI/bge-m3';

        const totalEmbeddings = await db.embeddings.where('modelId').equals(modelId).count();
        const totalTweets = await db.tweets.count();
        const coveragePercent = totalTweets > 0 ? Math.round((totalEmbeddings / totalTweets) * 100) : 0;

        return { totalEmbeddings, totalTweets, coveragePercent, modelId };
    },

    /**
     * 清空所有 embeddings
     */
    async clearAll(): Promise<void> {
        await db.embeddings.clear();
    }
};
