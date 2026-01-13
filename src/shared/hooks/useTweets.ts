import { useState, useEffect } from 'react';
import { db } from '../../core/storage/db';
import { TweetWithUser, UserCache } from '../../shared/types/tweet';
import { liveQuery } from 'dexie';

export function useTweets() {
    const [tweets, setTweets] = useState<TweetWithUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const subscription = liveQuery(async () => {
            const allTweets = await db.tweets.orderBy('savedAt').reverse().toArray();

            const tweetsWithUsers = await Promise.all(allTweets.map(async (t: any) => {
                // 🛠️ 兼容旧版与新版数据结构
                let author: UserCache | undefined;

                // 新版：用 authorId 关联 users 表
                if (t.authorId) {
                    author = await db.users.get(t.authorId);
                }

                // 兜底：如果 users 表查不到，尝试从推文嵌入数据构造
                if (!author) {
                    // 旧版数据可能直接嵌入了 author/authorName/authorAvatarUrl
                    const legacyHandle = (t as any).author || (t as any).authorHandle;
                    const legacyName = (t as any).authorName;
                    const legacyAvatar = (t as any).authorAvatarUrl;

                    if (legacyHandle) {
                        author = {
                            id: t.authorId || legacyHandle, // 以 handle 作为临时 ID
                            handle: legacyHandle,
                            name: legacyName || legacyHandle,
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
