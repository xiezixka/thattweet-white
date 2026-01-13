import { useState, useEffect } from 'react';
import { db } from '../../core/storage/db';
import { TweetWithUser } from '../../shared/types/tweet';
import { liveQuery } from 'dexie';
import { useObservable } from 'react-use'; // I should install this or just use useEffect

export function useTweets() {
    const [tweets, setTweets] = useState<TweetWithUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const subscription = liveQuery(async () => {
            const allTweets = await db.tweets.orderBy('savedAt').reverse().toArray();
            const tweetsWithUsers = await Promise.all(allTweets.map(async (t) => {
                const author = await db.users.get(t.authorId);
                return { ...t, author };
            }));
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
