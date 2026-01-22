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

                // 🌟 智能保留更长的文本
                const keepLongerText = (existingTweet.text?.length || 0) >= (tweet.text?.length || 0)
                    ? existingTweet.text
                    : tweet.text;

                // --- 历史趋势快照逻辑 (Snapshot Logic) ---
                let history = existingTweet.metricsHistory || [];
                const createdAtTs = typeof existingTweet.createdAt === 'string'
                    ? new Date(existingTweet.createdAt).getTime()
                    : Number(existingTweet.createdAt);

                // 确保有 P0 (发布时的 0 数据点)
                if (history.length === 0 || history[0].capturedAt > createdAtTs + 1000) {
                    history.unshift({
                        capturedAt: createdAtTs,
                        favoriteCount: 0,
                        retweetCount: 0,
                        replyCount: 0,
                        viewCount: 0
                    });
                }

                const lastSnapshot = history[history.length - 1];
                const now = Date.now();

                // 构造当前快照
                const currentSnapshot = {
                    capturedAt: now,
                    favoriteCount: Math.max(tweet.favoriteCount || 0, existingTweet.favoriteCount || 0),
                    retweetCount: Math.max(tweet.retweetCount || 0, existingTweet.retweetCount || 0),
                    replyCount: Math.max(tweet.replyCount || 0, existingTweet.replyCount || 0),
                    viewCount: Math.max(tweet.viewCount || 0, existingTweet.viewCount || 0)
                };

                let shouldAppend = false;

                if (history.length <= 1) { // 只有 P0 时，强制推入当前点作为 P1
                    shouldAppend = true;
                } else {
                    const timeDiff = now - lastSnapshot.capturedAt;
                    // 策略：每 4 小时至少存一次 OR 关键互动量变化超过 5% (更灵敏一点)
                    const isTimeDue = timeDiff > 1000 * 60 * 60 * 4;
                    const isSignificantChange = (
                        Math.abs(currentSnapshot.favoriteCount - lastSnapshot.favoriteCount) > Math.max(5, lastSnapshot.favoriteCount * 0.05) ||
                        Math.abs(currentSnapshot.retweetCount - lastSnapshot.retweetCount) > Math.max(2, lastSnapshot.retweetCount * 0.05) ||
                        Math.abs(currentSnapshot.viewCount - lastSnapshot.viewCount) > Math.max(100, lastSnapshot.viewCount * 0.05)
                    );

                    shouldAppend = isTimeDue || isSignificantChange;
                }

                if (shouldAppend) {
                    history.push(currentSnapshot);
                    // 限制历史记录最大长度，保留最近 100 个点，足以覆盖较长的追踪期
                    if (history.length > 100) history = history.slice(-100);
                }

                await db.tweets.update(tweet.id, {
                    // 保留更长的文本
                    text: keepLongerText,

                    favoriteCount: currentSnapshot.favoriteCount,
                    retweetCount: currentSnapshot.retweetCount,
                    replyCount: currentSnapshot.replyCount,
                    viewCount: currentSnapshot.viewCount,

                    // 更新趋势数据
                    metricsHistory: history,

                    // 更新头像（智能合并）
                    authorAvatarUrl: user.avatar || existingUser?.avatar || existingTweet.authorAvatarUrl || tweet.authorAvatarUrl,

                    // 媒体可能有更完整的数据
                    media: (tweet.media?.length > (existingTweet.media?.length || 0)) ? tweet.media : existingTweet.media,
                });
                console.log(`[ThatTweet] Tweet ${tweet.id} stats updated. Snapshot captured: ${shouldAppend} (Total: ${history.length})`);
            } else {
                // 新推文：完整写入 + 初始化历史快照 (P0 + P1)
                const createdAtTs = typeof tweet.createdAt === 'string'
                    ? new Date(tweet.createdAt).getTime()
                    : Number(tweet.createdAt);

                const now = Date.now();
                const history = [
                    {
                        capturedAt: createdAtTs,
                        favoriteCount: 0,
                        retweetCount: 0,
                        replyCount: 0,
                        viewCount: 0
                    }
                ];

                // 如果当前时间明显晚于发布时间，且已有数据，则存入 P1
                if (now > createdAtTs + 60000) {
                    history.push({
                        capturedAt: now,
                        favoriteCount: tweet.favoriteCount || 0,
                        retweetCount: tweet.retweetCount || 0,
                        replyCount: tweet.replyCount || 0,
                        viewCount: tweet.viewCount || 0
                    });
                }

                await db.tweets.put({
                    ...tweet,
                    authorAvatarUrl: user.avatar || tweet.authorAvatarUrl,
                    metricsHistory: history
                });
                console.log(`[ThatTweet] Tweet ${tweet.id} saved (new) with P0 baseline.`);
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
    /**
     * 筛选待处理 AI 的推文 (优化版：只拉取 ID，不加载实体)
     */
    async getPendingAITweets() {
        return await db.tweets
            .where('aiStatus')
            .equals('pending')
            .limit(100) // 🛡️ 限制单次检索数量
            .primaryKeys(); // 🚀 关键：只取主键 ID
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

        await db.transaction('rw', [db.tweets, db.users, db.graphEdges, db.tagMappings], async () => {
            await db.tweets.clear();
            await db.users.clear();
            await db.graphEdges.clear();
            await db.tagMappings.clear();
        });

        console.log(`[TweetRepository] Cleared all data: ${tweetCount} tweets, ${userCount} users, and all graph data.`);
        return { tweets: tweetCount, users: userCount };
    }

};
