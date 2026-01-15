import { db } from '../storage/db';
import { TweetRepository } from '../storage/TweetRepository';
import { TweetAnalyzer } from './analyzer';
import { AISettings, DEFAULT_AI_SETTINGS } from '../../shared/types/settings';
import { ProcessStatus } from '../../shared/types/tweet';

export class AIJobQueue {
    private static isProcessing = false;

    /**
     * 启动一次队列处理任务
     */
    static async processNextBatch() {
        if (this.isProcessing) return;

        const settings = await this.getSettings();
        if (!settings.autoAnalyze || !settings.apiKey || settings.apiKey.trim().length < 5) {
            return;
        }

        this.isProcessing = true;
        try {
            // 1. 获取待处理的推文
            const pendingTweets = await TweetRepository.getPendingAITweets();
            const toProcess = pendingTweets.filter(t => {
                if (t.isArchived) return false;

                // 如果启用了图片分析，且推文有图，必须等图片处理完
                if (settings.visionEnabled || settings.ocrEnabled) {
                    const hasImages = t.media?.some(m => m.type === 'image');
                    if (hasImages && t.imageProcessStatus === ProcessStatus.Pending) {
                        return false;
                    }
                }
                return true;
            }).slice(0, settings.batchSize);

            console.log(`[ThatTweet] AI Queue found ${toProcess.length} tweets to process.`);

            for (const tweet of toProcess) {
                try {
                    const result = await TweetAnalyzer.analyze(tweet, settings);

                    // 写回数据库
                    await db.tweets.update(tweet.id, {
                        aiSummary: result.summary,
                        aiReason: result.reason,
                        aiTags: result.tags,
                        aiCategory: result.category,
                        aiScore: result.score,
                        aiStatus: ProcessStatus.Completed,
                        aiProcessedAt: Date.now()
                    });

                    console.log(`%c[ThatTweet] AI Success: ${tweet.id}`, 'color: #4CAF50');

                    // 限速等待
                    await new Promise(r => setTimeout(r, settings.rateLimitMs));
                } catch (err) {
                    console.error(`[ThatTweet] AI Failed for ${tweet.id}:`, err);
                    // 可以在此处实现重试计数逻辑
                    await db.tweets.update(tweet.id, { aiStatus: ProcessStatus.Failed });
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private static async getSettings(): Promise<AISettings> {
        return new Promise((resolve) => {
            chrome.storage.local.get(['aiSettings'], (res) => {
                resolve(res.aiSettings || DEFAULT_AI_SETTINGS);
            });
        });
    }
}
