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

                // 如果启用了图片分析且推文有图，必须等图片处理完；
                // 但如果 Vision 和 OCR 此时都是关闭状态，则直接视为不需要等待图片。
                const isVisionActive = settings.visionEnabled || settings.ocrEnabled;
                if (isVisionActive) {
                    const hasImages = t.media?.some(m => m.type === 'image');
                    if (hasImages && t.imageProcessStatus === ProcessStatus.Pending) {
                        return false;
                    }
                }
                return true;
            }).slice(0, settings.batchSize);

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
            } catch (err) {
                console.error(`[ThatTweet] Batch AI Processing Failed:`, err);
                // 标记该批次所有推文为失败，防止死循环
                for (const tweet of toProcess) {
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
