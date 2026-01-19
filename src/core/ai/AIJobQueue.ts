import { db } from '../storage/db';
import { TweetRepository } from '../storage/TweetRepository';
import { TweetAnalyzer } from './analyzer';
import { AISettings, DEFAULT_AI_SETTINGS, getSafeAISettings } from '../../shared/types/settings';
import { ProcessStatus } from '../../shared/types/tweet';
import { useSettingsStore } from '../../shared/store/useSettingsStore';

export class AIJobQueue {
    private static isProcessing = false;
    private static BUSY_COOLDOWN_UNTIL = 0;

    /**
     * 启动一次队列处理任务 (自动批处理)
     */
    static async processNextBatch() {
        if (this.isProcessing) return;
        if (Date.now() < this.BUSY_COOLDOWN_UNTIL) return;

        const settings = await this.getSettings();
        const node = settings.workflowNodes.textAnalysis;

        // Check if enabled and has a valid default or node provider
        const providerId = node.providerId || settings.defaultProviderId;
        const provider = settings.providers.find(p => p.id === providerId);

        if (!settings.autoAnalyze || !provider || !provider.apiKey) {
            return;
        }

        this.isProcessing = true;
        // this.isProcessing = true; (already set above)
        try {
            // 1. 获取待处理的推文 ID
            const pendingIds = await TweetRepository.getPendingAITweets();
            if (pendingIds.length === 0) return;

            // 2. 加载这些推文实体进行精确筛选
            const candidateTweets = await db.tweets.bulkGet(pendingIds as string[]);
            const toProcess = (candidateTweets.filter(t => t !== undefined) as any[]).filter(t => {
                if (t.isArchived) return false;
                if (t.aiStatus !== ProcessStatus.Pending) return false;

                // 如果启用了图片分析且推文有图，必须等图片处理完
                const isVisionActive = settings.workflowNodes.perception.enabled;
                if (isVisionActive) {
                    const hasImages = t.media?.some((m: any) => m.type === 'image');
                    if (hasImages && (t.imageProcessStatus === ProcessStatus.Pending || t.imageProcessStatus === ProcessStatus.Processing)) {
                        return false;
                    }
                }
                return true;
            }).slice(0, settings.batchSize);

            // 队列积压逻辑：必须满一整批才处理，节省 API 限额
            if (toProcess.length < settings.batchSize) {
                return;
            }

            // 🚀 核心修复：立即标记为 Processing，防止重复进入队列
            for (const t of toProcess) {
                await db.tweets.update(t.id, { aiStatus: ProcessStatus.Processing });
            }

            console.log(`[ThatTweet] AI Queue starting batch process for ${toProcess.length} tweets.`);

            try {
                const results = await TweetAnalyzer.analyzeBatch(toProcess, settings);

                for (let i = 0; i < toProcess.length; i++) {
                    const tweet = toProcess[i];
                    const result = results[i];

                    if (result) {
                        await db.tweets.update(tweet.id, {
                            aiSummary: result.summary,
                            aiReason: result.reason,
                            aiTags: result.tags,
                            aiCategory: result.category,
                            aiScore: result.score,
                            aiStatus: ProcessStatus.Completed,
                            aiProcessedAt: Date.now()
                        });
                    } else {
                        console.warn(`[ThatTweet] AI result missing for tweet ${tweet.id}`);
                        await db.tweets.update(tweet.id, { aiStatus: ProcessStatus.Failed });
                    }
                }
                console.log(`%c[ThatTweet] Batch AI Success: ${toProcess.length} tweets processed.`, 'color: #4CAF50');
            } catch (err: any) {
                console.error(`[ThatTweet] Batch AI Processing Failed:`, err);
                // 如果是网络错误或 50x，重置为 Pending 以便重试，并进入冷却
                const isRetriable = err.message?.includes('fetch') || err.message?.includes('50') || err.message?.includes('busy');

                if (isRetriable) {
                    this.BUSY_COOLDOWN_UNTIL = Date.now() + 60 * 1000;
                    for (const tweet of toProcess) {
                        await db.tweets.update(tweet.id, { aiStatus: ProcessStatus.Pending });
                    }
                } else {
                    for (const tweet of toProcess) {
                        await db.tweets.update(tweet.id, { aiStatus: ProcessStatus.Failed });
                    }
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 强制立即处理单个推文 (用户手动点击收藏时触发)
     */
    static async forceProcessTweet(tweetId: string) {
        const settings = await this.getSettings();
        const tweet = await db.tweets.get(tweetId);
        if (!tweet) return;

        console.log(`[AIJobQueue] Forcing immediate analysis for ${tweetId}`);

        try {
            const result = await TweetAnalyzer.analyze(tweet, settings);
            if (result) {
                await db.tweets.update(tweet.id, {
                    aiSummary: result.summary,
                    aiReason: result.reason,
                    aiTags: result.tags,
                    aiCategory: result.category,
                    aiScore: result.score,
                    aiStatus: ProcessStatus.Completed,
                    aiProcessedAt: Date.now()
                });
                console.log(`%c[AIJobQueue] Force success: ${tweetId}`, 'color: #4CAF50');
            }
        } catch (err) {
            console.error(`[AIJobQueue] Force analysis failed for ${tweetId}:`, err);
            await db.tweets.update(tweetId, { aiStatus: ProcessStatus.Failed });
        }
    }

    private static async getSettings(): Promise<AISettings> {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['aiSettings'], (res) => {
                    resolve(getSafeAISettings(res.aiSettings));
                });
            } else {
                // Fallback for non-extension environments (dev)
                const state = useSettingsStore.getState();
                resolve(state.settings);
            }
        });
    }
}
