import { TweetRepository } from '../../core/storage/TweetRepository';
import { Tweet, UserCache } from '../../shared/types/tweet';

console.log('[ThatTweet] Background Service Worker Loaded');

/**
 * 监听来自 Content Script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SAVE_TWEETS_BATCH') {
        const { tweets, users } = message.payload;

        // 执行批量保存
        handleBatchSave(tweets, users);

        return true; // 保持通道开启
    }
});

/**
 * 处理批量保存逻辑
 */
async function handleBatchSave(tweets: Tweet[], users: UserCache[]) {
    try {
        console.log(`[ThatTweet] Processing batch: ${tweets.length} tweets, ${users.length} users`);

        // 将用户数组转为 Map 加速查找
        const userMap = new Map(users.map(u => [u.id, u]));

        for (const tweet of tweets) {
            const author = userMap.get(tweet.authorId);
            if (author) {
                await TweetRepository.saveTweet(tweet, author);
                console.log(`%c[ThatTweet] Saved to DB: ${tweet.id}`, 'color: #4CAF50');
            }
        }

        console.log('[ThatTweet] Batch save completed');
    } catch (error) {
        console.error('[ThatTweet] Batch save failed:', error);
    }
}
