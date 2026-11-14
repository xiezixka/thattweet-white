import { useState, useEffect } from 'react';
import { db } from '../../core/storage/db';
import { TweetWithUser, UserCache } from '../../shared/types/tweet';
import { liveQuery } from 'dexie';

export function useTweets() {
    const [tweets, setTweets] = useState<TweetWithUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let timer: any;
        const subscription = liveQuery(async () => {
            // 🚀 性能优化 1：限制读取数量，防止海量数据撑爆内存
            // 大多数视图只需要最近的 1000 条，如果是统计图表，应该单独查询
            const MAX_TWEETS = 1000;

            const allTweets = await db.tweets
                .orderBy('savedAt')
                .reverse()
                .limit(MAX_TWEETS)
                .toArray();

            // 🚀 性能优化 2：及早剥离无用大数据 (rawZip)
            const leanTweets = allTweets.map((t: any) => {
                const { rawZip, ...rest } = t;
                return rest;
            });
            allTweets.length = 0; // 手动释放内存

            const authorIds = Array.from(new Set(leanTweets.map(t => t.authorId).filter(Boolean)));
            const users = authorIds.length ? await db.users.where('id').anyOf(authorIds).toArray() : [];
            const userMap = new Map(users.map(u => [u.id, u]));

            const tweetsWithUsers = leanTweets.map((t: any) => {
                let author = t.authorId ? userMap.get(t.authorId) : undefined;

                if (author && !author.avatar) {
                    const tweetAvatar = (t as any).authorAvatarUrl;
                    if (tweetAvatar) author = { ...author, avatar: tweetAvatar };
                }

                if (!author) {
                    const legacyHandle = (t as any).author || (t as any).authorHandle;
                    const legacyName = (t as any).authorName;
                    const legacyAvatar = (t as any).authorAvatarUrl;

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
            });

            return tweetsWithUsers.filter(t => t.author) as TweetWithUser[];
        }).subscribe({
            next: (val) => {
                // 🚀 性能优化 3：防抖/节流更新。在抓取模式下，数据变化极快，没必要每秒更新几十次。
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    setTweets(val);
                    setLoading(false);
                    setError(null);
                }, 500); // 500ms 的更新缓冲
            },
            error: (err) => {
                console.error('[ThatTweet] Failed to read local tweets:', err);
                setLoading(false);
                setError('读取本地推文失败，请刷新重试。已有数据不会被删除。');
            }
        });

        return () => {
            subscription.unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, []);

    return { tweets, loading, error };
}
