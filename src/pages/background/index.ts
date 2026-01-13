import { TweetRepository } from '../../core/storage/TweetRepository';
import { Tweet, UserCache } from '../../shared/types/tweet';
import { AIJobQueue } from '../../core/ai/AIJobQueue';

/**
 * [ThatTweet] Background Service Worker
 */
console.log('%c[ThatTweet] Background Script Active v1.0.1', 'color: #1d9bf0; font-weight: bold');

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SAVE_TWEETS_BATCH') {
        const { tweets, users } = message.payload;
        handleBatchSave(tweets, users);
        return true;
    }
});

// 自动化定时：每隔 10 秒检查一次 AI 队列（测试阶段设短一点）
setInterval(() => {
    AIJobQueue.processNextBatch().catch(console.error);
}, 10 * 1000);

async function handleBatchSave(tweets: Tweet[], users: UserCache[]) {
    try {
        console.log(`[ThatTweet] Incoming batch: ${tweets.length} items`);
        const userMap = new Map(users.map(u => [u.id, u]));

        for (const tweet of tweets) {
            const author = userMap.get(tweet.authorId);
            if (author) {
                await TweetRepository.saveTweet(tweet, author);
            }
        }
        // 存完后立刻触发 AI
        AIJobQueue.processNextBatch().catch(console.error);
    } catch (error) {
        console.error('[ThatTweet] Batch save failed:', error);
    }
}

// 终极导出方案：同时挂载到 self 和 globalThis
(self as any).AIJobQueue = AIJobQueue;
(globalThis as any).AIJobQueue = AIJobQueue;

console.log('[ThatTweet] AIJobQueue exported to console.');
