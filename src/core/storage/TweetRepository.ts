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
                // 已存在的推文：只更新基础元数据，保留 AI 结果和用户标记
                await db.tweets.update(tweet.id, {
                    // 更新互动数据（可能有新数据）
                    favoriteCount: tweet.favoriteCount || existingTweet.favoriteCount,
                    retweetCount: tweet.retweetCount || existingTweet.retweetCount,
                    replyCount: tweet.replyCount || existingTweet.replyCount,
                    viewCount: tweet.viewCount || existingTweet.viewCount,
                    // 更新头像（智能合并）
                    authorAvatarUrl: user.avatar || existingUser?.avatar || existingTweet.authorAvatarUrl || tweet.authorAvatarUrl,
                    // 媒体可能有更完整的数据
                    media: (tweet.media?.length > (existingTweet.media?.length || 0)) ? tweet.media : existingTweet.media,
                    // 保留所有 AI 相关数据（不覆盖）
                    // aiStatus, aiScore, aiSummary, aiReason, aiTags, aiCategory, aiProcessedAt - 全部保留
                    // 保留所有图像处理数据（不覆盖）
                    // imageProcessStatus, ocrText, visionDescription, imageProcessedAt - 全部保留
                    // 保留用户标记（不覆盖）
                    // isBookmarked, isArchived, tags, note - 全部保留
                });
                console.log(`[ThatTweet] Tweet ${tweet.id} updated (preserved AI data)`);
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
