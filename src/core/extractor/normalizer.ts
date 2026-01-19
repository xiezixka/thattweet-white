import { Tweet, UserCache, ProcessStatus, CaptureSource, MediaItem } from '../../shared/types/tweet';

/**
 * 【解析引擎】
 * 负责从 X 的原始 GraphQL 响应中提取并标准化数据
 * 【修复】完全对齐旧版数据结构：
 *   - 媒体项保留 thumbnailUrl
 *   - 推文嵌入作者字段 (author/authorName/authorAvatarUrl) 以及 authorId
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

            // 1. 尝试解析用户 (优先提取)
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
     * 标准化推文提取逻辑 (对齐旧版 injected.ts)
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
        if (!tweetId) return null;

        // 🛡️ 广告过滤 (API 拦截版)
        // GraphQL 响应中广告推文通常有这些标记
        if (
            tweetNode.promotedMetadata ||
            tweetNode.promoted_metadata ||
            node.promotedMetadata ||
            node.promoted_metadata ||
            tweetNode.advertiserInfo ||
            tweetNode.advertiser_info ||
            node.itemContent?.promotedMetadata ||
            node.entryId?.startsWith('promoted-') ||
            node.entryId?.startsWith('promotedTweet-') ||
            legacy?.promoted_content
        ) {
            console.log(`[ThatTweet] Skipped promoted tweet: ${tweetId}`);
            return null;
        }

        // --- 作者信息提取 (对齐旧版) ---
        const userResult = tweetNode.core?.user_results?.result ?? tweetNode.core?.user;
        const userLegacy = userResult?.legacy ?? userResult;

        const authorId = userResult?.rest_id ?? userResult?.id_str ?? '';
        const authorHandle = userLegacy?.screen_name ?? userResult?.screen_name ?? '';
        const authorName = userLegacy?.name ?? userResult?.name ?? authorHandle;

        // 头像处理：尝试多种备选路径，最后做 _normal -> _bigger
        let authorAvatarUrl =
            userLegacy?.profile_image_url_https ??
            userLegacy?.profile_image_url ??
            userResult?.profile_image_url_https ??
            userResult?.profile_image_url ??
            userResult?.profile_image_url_https_extended ??
            userResult?.avatar?.image_url ??
            userResult?.avatar?.media_info?.url ??
            userResult?.avatar?.url ??
            '';
        if (authorAvatarUrl) {
            authorAvatarUrl = authorAvatarUrl.replace('_normal.', '_bigger.');
        }

        if (!authorId && !authorHandle) return null;

        // --- 推文正文 (处理长推文 & X Article) ---
        // 🌟 尝试多个可能的路径获取长推文/文章内容
        const noteText =
            tweetNode.article?.content?.text ||
            tweetNode.note_tweet?.note_tweet_results?.result?.text ||
            tweetNode.note_tweet?.text ||
            tweetNode.noteTweet?.noteTweetResults?.result?.text ||
            tweetNode.noteTweet?.text ||
            legacy.note_tweet?.note_tweet_results?.result?.text ||
            null;

        // 检查是否有截断标记（如果 legacy.full_text 以 "..." 结尾且 noteText 存在）
        const legacyText = legacy.full_text || legacy.text || '';
        const isTruncated = legacyText.endsWith('…') || legacyText.endsWith('...');

        // 优先使用 noteText/articleText（如果存在且更长），否则使用 legacy 文本
        const fullText = (noteText && (noteText.length > legacyText.length || isTruncated))
            ? noteText
            : legacyText;

        const media = this.extractMedia(legacy);
        if (!fullText && media.length === 0) return null;

        // --- 🌟 社交关系提取 (新增) ---
        // 1. 回复关系
        const replyToId = legacy.in_reply_to_status_id_str || null;
        const replyToUser = legacy.in_reply_to_screen_name || null;

        // 2. 转发关系
        const retweetedStatus = tweetNode.retweeted_status_result?.result ?? tweetNode.retweeted_status;
        const retweetFromId = retweetedStatus?.rest_id ?? retweetedStatus?.id_str ?? null;

        // 3. 引用关系
        const quotedStatus = tweetNode.quoted_status_result?.result ?? tweetNode.quoted_status;
        const quoteFromId = quotedStatus?.rest_id ?? quotedStatus?.id_str ?? null;

        return {
            id: tweetId,
            authorId: authorId || authorHandle, // 优先用 ID，兜底用 Handle
            // 【旧版兼容】同时嵌入作者字段
            author: authorHandle,
            authorName: authorName,
            authorAvatarUrl: authorAvatarUrl,

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
            viewCount: parseInt(tweetNode.views?.count || "0"),
            media: media,

            // 🌟 注入社交元数据
            conversationId: legacy.conversation_id_str,
            replyToId: replyToId,
            replyToUser: replyToUser,
            retweetFromId: retweetFromId, // 🆕 新增字段
            quoteFromId: quoteFromId,      // 🆕 新增字段
            aiStatus: ProcessStatus.Pending,
            imageProcessStatus: ProcessStatus.Pending
        } as Tweet;
    },

    /**
     * 标准化用户提取逻辑
     */
    extractUser(node: any): UserCache | null {
        if (!node || typeof node !== 'object') return null;

        const isLikelyUser =
            node.__typename === 'User' ||
            (node.legacy && node.legacy.screen_name) ||
            (node.screen_name && node.followers_count !== undefined);

        if (!isLikelyUser) return null;

        const core = node.core?.user_results?.result ?? node.core ?? node;
        const legacy = node.legacy ?? core?.legacy ?? node;

        const userId = node.rest_id ?? node.id_str ?? core.rest_id ?? core.id_str;
        const handle = legacy.screen_name ?? core.screen_name ?? node.screen_name;

        if (!userId || !handle) return null;

        let avatar = legacy.profile_image_url_https ?? core.profile_image_url_https ?? '';
        if (avatar) {
            avatar = avatar.replace('_normal.', '_bigger.');
        }

        return {
            id: userId,
            handle: handle.replace(/^@/, ''),
            name: legacy.name ?? core.name ?? node.name ?? handle,
            avatar: avatar,
            description: legacy.description ?? core.description,
            followersCount: legacy.followers_count ?? node.followers_count,
            verified: legacy.verified ?? core.verified ?? node.verified,
            updatedAt: Date.now()
        };
    },

    /**
     * 媒体文件解析 (对齐旧版：同时保存 url 和 thumbnailUrl)
     */
    extractMedia(legacy: any): MediaItem[] {
        const mediaNodes = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];
        return mediaNodes.map((m: any) => {
            const typeRaw = m.type;
            let type: 'image' | 'video' | 'gif';

            if (typeRaw === 'photo') type = 'image';
            else if (typeRaw === 'video') type = 'video';
            else if (typeRaw === 'animated_gif') type = 'gif';
            else return null;

            // 原始图片 URL (这是封面图)
            let thumbnailUrl = m.media_url_https ?? m.media_url ?? '';
            let url = thumbnailUrl;

            // 图片：补齐质量参数
            if (type === 'image' && url && !url.includes('?')) {
                url += '?format=jpg&name=large';
            }

            // 视频/GIF：取最高码率 MP4，但保留封面图
            if ((type === 'video' || type === 'gif') && m.video_info?.variants) {
                const mp4Variants = m.video_info.variants
                    .filter((v: any) => v.content_type === 'video/mp4')
                    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                if (mp4Variants.length > 0) {
                    url = mp4Variants[0].url;
                }
            }

            return {
                type,
                url,               // 播放源 (mp4) 或 图片源
                previewUrl: thumbnailUrl // 封面图 (对齐旧版 thumbnailUrl)
            };
        }).filter(Boolean) as MediaItem[];
    },

    parseViewCount(count: any): number {
        if (typeof count === 'number') return count;
        if (typeof count === 'string') return parseInt(count.replace(/,/g, ''), 10) || 0;
        return 0;
    }
};
