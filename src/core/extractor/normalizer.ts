import { Tweet, UserCache, ProcessStatus, CaptureSource } from '../../shared/types/tweet';

/**
 * 【解析引擎】
 * 负责从 X 的原始 GraphQL 响应中提取并标准化数据
 * 汲取了旧版递归搜索与路径探测的经验，并进行了强类型适配
 */
export const Normalizer = {
    /**
     * 递归搜索 JSON 对象中的推文和用户信息
     */
    findDataInObject(obj: any): { tweets: Tweet[], users: UserCache[] } {
        const foundTweets: Tweet[] = [];
        const foundUsers: UserCache[] = [];
        const processedIds = new Set<string>();

        const traverse = (node: any, depth = 0) => {
            // 限制深度防止死循环
            if (depth > 25 || !node || typeof node !== 'object') return;

            // 1. 尝试解析推文
            const tweet = this.extractTweet(node);
            if (tweet && !processedIds.has(tweet.id)) {
                foundTweets.push(tweet);
                processedIds.add(tweet.id);
            }

            // 2. 尝试解析用户 
            const user = this.extractUser(node);
            if (user) {
                foundUsers.push(user);
            }

            // 3. 递归子节点
            if (Array.isArray(node)) {
                for (const item of node) traverse(item, depth + 1);
            } else {
                for (const key of Object.keys(node)) {
                    traverse(node[key], depth + 1);
                }
            }
        };

        traverse(obj);
        return { tweets: foundTweets, users: foundUsers };
    },

    /**
     * 标准化推文提取逻辑
     */
    extractTweet(node: any): Tweet | null {
        // 识别推文节点特征
        let tweetNode = node;

        // 处理 TweetWithVisibilityResults 嵌套
        if (node.__typename === 'TweetWithVisibilityResults' && node.tweet) {
            tweetNode = node.tweet;
        }
        // 处理 tweet_results.result 嵌套
        if (node.tweet_results?.result) {
            tweetNode = node.tweet_results.result;
            if (tweetNode.tweet) tweetNode = tweetNode.tweet;
        }

        if (!tweetNode || !tweetNode.legacy) return null;

        const legacy = tweetNode.legacy;
        const tweetId = tweetNode.rest_id ?? legacy.id_str;
        const userResult = tweetNode.core?.user_results?.result ?? tweetNode.core?.user;

        if (!tweetId || !userResult) return null;

        // 处理长推文 (Notes / Premium)
        const noteText = tweetNode.note_tweet?.note_tweet_results?.result?.text;
        const fullText = (noteText && noteText.length > (legacy.full_text || '').length)
            ? noteText
            : (legacy.full_text || legacy.text || '');

        // 如果文本和媒体都为空，则不是有效推文
        const media = this.extractMedia(legacy);
        if (!fullText && media.length === 0) return null;

        return {
            id: tweetId,
            authorId: userResult.rest_id || userResult.id_str,
            text: fullText,
            tweetUrl: `https://x.com/i/status/${tweetId}`,
            createdAt: legacy.created_at ? new Date(legacy.created_at).getTime() : Date.now(),
            source: CaptureSource.Interceptor,
            savedAt: Date.now(),

            isBookmarked: false,
            isArchived: false,
            tags: [],

            favoriteCount: legacy.favorite_count || 0,
            retweetCount: legacy.retweet_count || 0,
            replyCount: legacy.reply_count || 0,
            viewCount: this.parseViewCount(tweetNode.views?.count),

            media: media,

            conversationId: legacy.conversation_id_str,
            replyToId: legacy.in_reply_to_status_id_str,
            replyToUser: legacy.in_reply_to_screen_name,

            aiStatus: ProcessStatus.Pending,
            imageProcessStatus: ProcessStatus.Pending
        };
    },

    /**
     * 标准化用户提取逻辑
     */
    extractUser(node: any): UserCache | null {
        const userResult = node.core?.user_results?.result ??
            node.author_results?.result ??
            (node.__typename === 'User' ? node : null);

        if (!userResult || !userResult.legacy) return null;

        const legacy = userResult.legacy;
        const userId = userResult.rest_id || userResult.id_str;

        if (!userId || !legacy.screen_name) return null;

        return {
            id: userId,
            handle: legacy.screen_name,
            name: legacy.name || legacy.screen_name,
            avatar: (legacy.profile_image_url_https || legacy.profile_image_url || '').replace('_normal.', '_bigger.'),
            description: legacy.description,
            followersCount: legacy.followers_count,
            verified: legacy.verified,
            updatedAt: Date.now()
        };
    },

    /**
     * 媒体文件解析
     */
    extractMedia(legacy: any): any[] {
        const mediaNodes = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];
        return mediaNodes.map((m: any) => {
            const type = (m.type === 'photo' || m.type === 'image') ? 'image' :
                (m.type === 'animated_gif' ? 'gif' : 'video');

            let url = m.media_url_https ?? m.media_url;

            if ((type === 'video' || type === 'gif') && m.video_info?.variants) {
                // 取质量最高的 MP4
                const variants = m.video_info.variants
                    .filter((v: any) => v.content_type === 'video/mp4')
                    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                if (variants.length > 0) url = variants[0].url;
            } else if (type === 'image' && url && !url.includes('?')) {
                url += '?format=jpg&name=large';
            }

            return { type, url };
        });
    },

    parseViewCount(count: any): number {
        if (typeof count === 'number') return count;
        if (typeof count === 'string') return parseInt(count.replace(/,/g, ''), 10) || 0;
        return 0;
    }
};
