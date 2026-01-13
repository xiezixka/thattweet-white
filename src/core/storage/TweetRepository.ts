import { db } from './db';
import { Tweet, UserCache, TweetWithUser } from '../../shared/types/tweet';
import LZString from 'lz-string';

export const TweetRepository = {
    /**
     * 核心方法：保存推文及其作者信息
     * 使用事务保证原子性
     */
    async saveTweet(tweet: Tweet, user: UserCache, rawJson?: object) {
        return await db.transaction('rw', [db.tweets, db.users], async () => {
            // 1. 处理原始快照压缩
            if (rawJson) {
                tweet.rawZip = LZString.compressToUTF16(JSON.stringify(rawJson));
            }

            // 2. 更新用户信息 (Upsert)
            await db.users.put({
                ...user,
                updatedAt: Date.now(),
            });

            // 3. 写入推文数据
            await db.tweets.put(tweet);

            return tweet.id;
        });
    },

    /**
     * 获取单条推文（带作者信息）
     */
    async getTweetWithUser(id: string): Promise<TweetWithUser | undefined> {
        const tweet = await db.tweets.get(id);
        if (!tweet) return undefined;

        const author = await db.users.get(tweet.authorId);
        if (!author) return undefined;

        return { ...tweet, author };
    },

    /**
     * 分页获取推文列表（带作者信息）
     */
    async getPagedTweets(offset = 0, limit = 20): Promise<TweetWithUser[]> {
        const tweets = await db.tweets
            .orderBy('savedAt')
            .reverse()
            .offset(offset)
            .limit(limit)
            .toArray();

        return await Promise.all(
            tweets.map(async (tweet) => {
                const author = await db.users.get(tweet.authorId);
                return { ...tweet, author: author! };
            })
        );
    },

    /**
     * 筛选待处理 AI 的推文
     */
    async getPendingAITweets() {
        return await db.tweets
            .where('aiStatus')
            .equals('pending')
            .toArray();
    },

    /**
     * 删除推文
     */
    async deleteTweet(id: string) {
        return await db.tweets.delete(id);
    }
};
