import { db } from './db';
import { Tweet, UserCache, TweetWithUser } from '../../shared/types/tweet';
import LZString from 'lz-string';
import { GraphService } from '../../features/connections/services/graphService';

export const TweetRepository = {
    /**
     * 核心方法：保存推文及其作者信息
     * 使用事务保证原子性
     */
    async saveTweet(tweet: Tweet, user: UserCache, rawJson?: object) {
        const resultId = await db.transaction('rw', [db.tweets, db.users], async () => {
            // 1. 处理原始快照压缩
            if (rawJson) {
                tweet.rawZip = LZString.compressToUTF16(JSON.stringify(rawJson));
            }

            // 2. 更新用户信息 (Smart Merge)
            const existingUser = await db.users.get(user.id);
            if (existingUser) {
                // 如果已有用户，只在有新数据时更新特定字段
                await db.users.update(user.id, {
                    handle: user.handle || existingUser.handle,
                    name: user.name || existingUser.name,
                    // 仅当新头像不为空时更新头像
                    avatar: user.avatar || existingUser.avatar,
                    description: user.description || existingUser.description,
                    followersCount: user.followersCount || existingUser.followersCount,
                    verified: user.verified ?? existingUser.verified,
                    updatedAt: Date.now(),
                });
            } else {
                // 新用户，直接写入
                await db.users.put({
                    ...user,
                    updatedAt: Date.now(),
                });
            }

            // 3. 写入推文数据 (Smart Merge - 保护已有的 AI 数据和用户标记)
            const existingTweet = await db.tweets.get(tweet.id);

            if (existingTweet) {
                // 已存在的推文：更新互动数据，保留 AI 结果和用户标记
                // 采用 Math.max 确保计数只会增长 (或者至少不会被 0 覆盖)
                await db.tweets.update(tweet.id, {
                    favoriteCount: Math.max(tweet.favoriteCount || 0, existingTweet.favoriteCount || 0),
                    retweetCount: Math.max(tweet.retweetCount || 0, existingTweet.retweetCount || 0),
                    replyCount: Math.max(tweet.replyCount || 0, existingTweet.replyCount || 0),
                    viewCount: Math.max(tweet.viewCount || 0, existingTweet.viewCount || 0),

                    // 更新头像（智能合并）
                    authorAvatarUrl: user.avatar || existingUser?.avatar || existingTweet.authorAvatarUrl || tweet.authorAvatarUrl,

                    // 媒体可能有更完整的数据 (比如从封面图更新到了视频源)
                    media: (tweet.media?.length > (existingTweet.media?.length || 0)) ? tweet.media : existingTweet.media,
                });
                console.log(`[ThatTweet] Tweet ${tweet.id} stats updated`);
            } else {
                // 新推文：完整写入
                await db.tweets.put({
                    ...tweet,
                    authorAvatarUrl: user.avatar || tweet.authorAvatarUrl
                });
                console.log(`[ThatTweet] Tweet ${tweet.id} saved (new)`);
            }

            return tweet.id;
        });

        // 4. 异步触发图谱更新 (Fire and forget, 但记录错误)
        // 放在事务之外，避免阻塞主保存流程，也不竞争写锁
        GraphService.processTweet(tweet).catch(console.error);

        return resultId;
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
    },

    /**
     * 更新作者信息 (特别是 AI Profile)
     */
    async updateAuthorProfile(id: string, updates: Partial<UserCache>) {
        return await db.users.update(id, updates);
    },

    /**
     * 导出所有数据
     */
    async exportAllData() {
        const tweets = await db.tweets.toArray();
        const users = await db.users.toArray();
        return { tweets, users, version: 1, exportedAt: Date.now() };
    },

    /**
     * 导入数据
     */
    async importData(data: any) {
        return await db.transaction('rw', [db.tweets, db.users], async () => {
            if (data.users && Array.isArray(data.users)) {
                await db.users.bulkPut(data.users);
            }
            if (data.tweets && Array.isArray(data.tweets)) {
                await db.tweets.bulkPut(data.tweets);
            }
        });
    },

    /**
     * 清空所有数据 (推文和用户)
     * @returns 删除的记录数
     */
    async clearAllData(): Promise<{ tweets: number; users: number }> {
        const tweetCount = await db.tweets.count();
        const userCount = await db.users.count();

        await db.transaction('rw', [db.tweets, db.users], async () => {
            await db.tweets.clear();
            await db.users.clear();
        });

        console.log(`[TweetRepository] Cleared ${tweetCount} tweets and ${userCount} users`);
        return { tweets: tweetCount, users: userCount };
    }
};
