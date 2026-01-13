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
        const userMap = new Map<string, UserCache>();
        const processedTweetIds = new Set<string>();

        const traverse = (node: any, depth = 0) => {
            if (depth > 25 || !node || typeof node !== 'object') return;

            // 1. 尝试解析用户 (优先提取，供推文关联)
            const user = this.extractUser(node);
            if (user) {
                userMap.set(user.id, user);
            }

            // 2. 尝试解析推文
            const tweet = this.extractTweet(node);
            if (tweet && !processedTweetIds.has(tweet.id)) {
                foundTweets.push(tweet);
                processedTweetIds.add(tweet.id);
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
        return {
            tweets: foundTweets,
            users: Array.from(userMap.values())
        };
    },

    /**
     * 标准化推文提取逻辑
     */
    extractTweet(node: any): Tweet | null {
        let tweetNode = node;
        if (node.__typename === 'TweetWithVisibilityResults' && node.tweet) {
            tweetNode = node.tweet;
        }
        if (node.tweet_results?.result) {
            tweetNode = node.tweet_results.result;
            if (tweetNode.tweet) tweetNode = tweetNode.tweet;
        }

        if (!tweetNode || !tweetNode.legacy) return null;

        const legacy = tweetNode.legacy;
        const tweetId = tweetNode.rest_id ?? legacy.id_str;

        // 提取作者 ID - 采用最宽泛的探测
        const userResult = tweetNode.core?.user_results?.result ?? tweetNode.core?.user ?? tweetNode.author_results?.result;
        const authorId = userResult?.rest_id ?? userResult?.id_str ?? tweetNode.author_id_str;

        if (!tweetId || !authorId) return null;

        // 处理长推文 (Notes / Premium)
        const noteText = tweetNode.note_tweet?.note_tweet_results?.result?.text;
        const fullText = (noteText && noteText.length > (legacy.full_text || '').length)
            ? noteText
            : (legacy.full_text || legacy.text || '');

        const media = this.extractMedia(legacy);
        if (!fullText && media.length === 0) return null;

        return {
            id: tweetId,
            authorId: authorId,
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
     * 标准化用户提取逻辑 (参考旧版“鲁棒”逻辑重写)
     */
    extractUser(node: any): UserCache | null {
        if (!node || typeof node !== 'object') return null;

        // 【探测】是否像一个用户对象？
        const isLikelyUser =
            node.__typename === 'User' ||
            (node.legacy && node.legacy.screen_name) ||
            (node.screen_name && node.followers_count !== undefined);

        if (!isLikelyUser) return null;

        // 【定位数据层】尽可能向上和向下兼容
        const core = node.core?.user_results?.result ?? node.core ?? node;
        const legacy = node.legacy ?? core?.legacy ?? node;

        const userId = node.rest_id ?? node.id_str ?? core.rest_id ?? core.id_str;
        const handle = legacy.screen_name ?? core.screen_name ?? node.screen_name;

        if (!userId || !handle) return null;

        return {
            id: userId,
            handle: handle.replace(/^@/, ''),
            name: legacy.name ?? core.name ?? node.name ?? handle,
            avatar: (legacy.profile_image_url_https ?? core.profile_image_url_https ?? '').replace('_normal.', '_bigger.'),
            description: legacy.description ?? core.description,
            followersCount: legacy.followers_count ?? node.followers_count,
            verified: legacy.verified ?? core.verified ?? node.verified,
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
