/**
 * Rerank Service - 重排序服务
 * 
 * 使用 Reranker 模型对候选结果进行精排
 * 将向量检索的 Top-50 精排为 Top-10
 */

import { AISettings, DEFAULT_AI_SETTINGS, getSafeAISettings } from '../../../shared/types/settings';

export interface RerankResult {
    index: number;
    score: number;
}

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

export const rerankService = {
    /**
     * 调用 Rerank API 对候选文档进行重排序
     * 
     * @param query 用户查询
     * @param documents 候选文档列表
     * @param topK 返回的 Top-K 数量
     * @returns 重排序后的结果 (包含原始索引和分数)
     */
    async rerank(
        query: string,
        documents: string[],
        topK: number = 10
    ): Promise<RerankResult[]> {
        if (documents.length === 0) {
            return [];
        }

        const settings = await getSettings();

        if (!settings.ragEnabled) {
            console.warn('[RerankService] RAG is not enabled');
            // 回退：返回原始顺序
            return documents.slice(0, topK).map((_, i) => ({ index: i, score: 1 - i * 0.01 }));
        }

        // 智能获取 API Key
        let apiKey = settings.ragApiKey;
        if (!apiKey) {
            const rerankerUrl = settings.rerankerUrl || 'https://api.siliconflow.cn/v1/rerank';

            // 尝试匹配地址相近的 Provider
            let matchedProvider = settings.providers.find(p =>
                p.baseUrl && rerankerUrl.includes(new URL(p.baseUrl).hostname)
            );

            // 如果没匹配到，用默认的
            if (!matchedProvider) {
                matchedProvider = settings.providers.find(p => p.id === settings.defaultProviderId);
            }

            apiKey = matchedProvider?.apiKey || '';
            console.log(`[RerankService] Using ${matchedProvider ? matchedProvider.name : 'fallback'} API key`);
        }

        const apiUrl = settings.rerankerUrl || 'https://api.siliconflow.cn/v1/rerank';
        const model = settings.rerankerModel || 'BAAI/bge-reranker-v2-m3';

        if (!apiKey) {
            console.warn('[RerankService] No API Key found, falling back to original order');
            return documents.slice(0, topK).map((_, i) => ({ index: i, score: 1 - i * 0.01 }));
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    query,
                    documents,
                    top_n: topK,
                    return_documents: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[RerankService] API Error:', response.status, errorText);
                // 回退：返回原始顺序
                return documents.slice(0, topK).map((_, i) => ({ index: i, score: 1 - i * 0.01 }));
            }

            const data = await response.json();

            // SiliconFlow/Cohere 格式
            if (data.results && Array.isArray(data.results)) {
                return data.results.map((item: any) => ({
                    index: item.index,
                    score: item.relevance_score ?? item.score ?? 0
                }));
            }

            // OpenAI-compatible 格式
            if (data.data && Array.isArray(data.data)) {
                return data.data.map((item: any) => ({
                    index: item.index,
                    score: item.score ?? 0
                }));
            }

            console.error('[RerankService] Unknown response format:', data);
            return documents.slice(0, topK).map((_, i) => ({ index: i, score: 1 - i * 0.01 }));

        } catch (error) {
            console.error('[RerankService] Request failed:', error);
            // 回退：返回原始顺序
            return documents.slice(0, topK).map((_, i) => ({ index: i, score: 1 - i * 0.01 }));
        }
    },

    /**
     * 检查 Rerank 服务是否可用
     */
    async isAvailable(): Promise<boolean> {
        const settings = await getSettings();
        return settings.ragEnabled && !!settings.ragApiKey;
    }
};
