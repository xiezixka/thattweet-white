import { useState, useEffect } from 'react';
import { db } from '../../core/storage/db';
import { TweetWithUser, UserCache } from '../../shared/types/tweet';
import { liveQuery } from 'dexie';

export function useTweets() {
    const [tweets, setTweets] = useState<TweetWithUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const subscription = liveQuery(async () => {
            // 依赖追踪：虽然我们不需要直接用这个结果，但查询它能让 liveQuery 监听到 users 表的变化
            await db.users.limit(1).toArray();

            const allTweets = await db.tweets.orderBy('savedAt').reverse().toArray();

            const tweetsWithUsers = await Promise.all(allTweets.map(async (t: any) => {
                // 🛠️ 兼容旧版与新版数据结构
                let author: UserCache | undefined;

                // 新版：用 authorId 关联 users 表
                if (t.authorId) {
                    author = await db.users.get(t.authorId);
                }

                // 🔧 关键修复：即使从 users 表查到了用户，如果 avatar 是空的，也要从推文里补上！
                if (author && !author.avatar) {
                    const tweetAvatar = (t as any).authorAvatarUrl;
                    if (tweetAvatar) {
                        author = { ...author, avatar: tweetAvatar };
                    }
                }

                // 兜底：如果 users 表查不到，尝试从推文嵌入数据构造
                if (!author) {
                    // 旧版数据可能直接嵌入了 author/authorName/authorAvatarUrl
                    const legacyUser = (t as any).user;
                    const legacyHandle = (t as any).author || (t as any).authorHandle || legacyUser?.screen_name || legacyUser?.handle;
                    const legacyName = (t as any).authorName || legacyUser?.name;
                    const legacyAvatar = (t as any).authorAvatarUrl || legacyUser?.profile_image_url_https || legacyUser?.avatar;

                    // 只要有 名字、Handle 或头像其中之一，就尝试构造
                    if (legacyHandle || legacyName || legacyAvatar) {
                        author = {
                            id: t.authorId || legacyHandle || 'unknown_id',
                            handle: legacyHandle || 'Unknown',
                            name: legacyName || legacyHandle || 'Unknown',
                            avatar: legacyAvatar || '',
                            updatedAt: Date.now()
                        };
                    }
                }

                return { ...t, author };
            }));

            // 过滤掉没有作者信息的推文
            return tweetsWithUsers.filter(t => t.author) as TweetWithUser[];
        }).subscribe({
            next: (val) => {
                setTweets(val);
                setLoading(false);
            },
            error: (err) => console.error(err)
        });

        return () => subscription.unsubscribe();
    }, []);

    return { tweets, loading };
}
