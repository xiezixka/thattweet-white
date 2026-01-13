import { Tweet, CaptureSource, ProcessStatus, MediaItem } from '../../shared/types/tweet';

type TweetMedia = { type: "image" | "video" | "gif"; url: string; previewUrl?: string };

/**
 * 🕵️‍♂️ DOM 解析器 (移植自旧版)
 * 作为 API 拦截的兜底方案，专门用于抓取首屏漏网或 API 变动后的推文
 */
export class DomExtractor {
    static extractTweetFromElement(articleElement: Element): Tweet | null {
        // 1. 提取推文 URL 和 ID
        const links = articleElement.querySelectorAll('a[href*="/status/"]');
        let tweetUrl: string | null = null;
        let tweetId: string | null = null;

        for (const link of links) {
            const href = link.getAttribute("href");
            if (href && href.includes("/status/")) {
                // 确保只提取主推文，而不是回复链接（通常主推文链接就在 header 或 time 旁边）
                // 简单 heuristic: 优先取包含 time 元素的 link，或者是第一个匹配的
                tweetUrl = href.startsWith("http") ? href : `https://${location.hostname}${href}`;
                const match = href.match(/\/status\/(\d+)/);
                if (match) {
                    tweetId = match[1];
                    break;
                }
            }
        }
        if (!tweetId || !tweetUrl) return null;

        // 2. 提取文本
        let text = "";
        const tweetTextElement = articleElement.querySelector('[data-testid="tweetText"]');
        if (tweetTextElement) {
            // 移除 hidden 辅助文本，提取纯净内容
            text = tweetTextElement.textContent || "";
        }

        // 3. 提取作者信息
        let authorHandle: string = '';
        let authorName: string = '';

        // Handle 通常在 URL里: x.com/Handle/status/123
        const handleMatch = tweetUrl.match(/(?:x\.com|twitter\.com)\/([^/]+)\/status/);
        if (handleMatch) {
            authorHandle = handleMatch[1];
        }

        // Name
        const userNameElement = articleElement.querySelector('[data-testid="User-Name"]');
        if (userNameElement) {
            const displayName = userNameElement.querySelector("span")?.textContent;
            if (displayName) authorName = displayName;

            // 如果没从 URL 拿到 Handle，尝试从 User-Name 区域找 @handle
            if (!authorHandle) {
                const handleEl = userNameElement.querySelectorAll('div[dir="ltr"] > span');
                handleEl.forEach(el => {
                    const txt = el.textContent || '';
                    if (txt.startsWith('@')) authorHandle = txt.replace('@', '');
                });
            }
        }

        // 4. 头像 (DOM 兜底关键)
        let authorAvatarUrl: string | undefined;
        const avatarSelectors = [
            '[data-testid="Tweet-User-Avatar"] img',
            'div[data-testid="tweet"] img[src*="profile_images"]',
            'img[src*="profile_images"]',
        ];

        for (const selector of avatarSelectors) {
            const img = articleElement.querySelector(selector);
            const src = img?.getAttribute("src");
            if (src && src.includes("profile_images")) {
                authorAvatarUrl = src.replace("_normal.", "_bigger.");
                break;
            }
        }

        // 5. 媒体提取
        const media = this.extractMediaFromDOM(articleElement);

        return {
            id: tweetId,
            authorId: authorHandle, // DOM 模式下暂用 Handle 做 ID
            author: authorHandle,   // 旧版兼容字段
            authorName: authorName || authorHandle, // 旧版兼容字段
            authorAvatarUrl: authorAvatarUrl, // 旧版兼容字段

            text: text,
            tweetUrl: tweetUrl,
            createdAt: Date.now(), // DOM 拿不到准确时间，只好用当前时间
            source: CaptureSource.DomScan,
            savedAt: Date.now(),
            isBookmarked: false,
            isArchived: false,
            tags: [],
            favoriteCount: 0, // DOM 无法精确获取
            retweetCount: 0,
            replyCount: 0,
            viewCount: 0,
            media: media,
            aiStatus: ProcessStatus.Pending,
            imageProcessStatus: ProcessStatus.Pending
        } as Tweet;
    }

    private static extractMediaFromDOM(articleElement: Element): MediaItem[] {
        const media: MediaItem[] = [];
        const seen = new Set<string>();

        // 图片选择器
        const imageSelectors = [
            '[data-testid="tweetPhoto"] img',
            'div[aria-label] img[src*="pbs.twimg.com/media"]',
            'img[src*="pbs.twimg.com/media"]',
        ];

        for (const selector of imageSelectors) {
            const imgs = articleElement.querySelectorAll(selector);
            for (const img of imgs) {
                let src = img.getAttribute("src");
                if (!src) continue;
                if (src.includes("profile_images") || src.includes("emoji")) continue;

                // 规范化
                let largeUrl = src;
                if (!src.includes("?")) largeUrl += "?format=jpg&name=large";
                else if (!src.includes("name=")) largeUrl += "&name=large";

                const base = largeUrl.split("?")[0]; // 去重基准
                if (seen.has(base)) continue;
                seen.add(base);

                media.push({ type: "image", url: largeUrl, previewUrl: largeUrl });
            }
        }

        // 视频选择器
        const videoSelectors = [
            '[data-testid="videoPlayer"]',
            'div[data-testid="videoComponent"]',
            'video'
        ];

        for (const selector of videoSelectors) {
            const videos = articleElement.querySelectorAll(selector);
            for (const el of videos) {
                const videoEl = el.tagName === 'VIDEO' ? el as HTMLVideoElement : el.querySelector('video');
                if (!videoEl) continue;

                // 封面图
                const poster = videoEl.getAttribute("poster");
                // 尝试找紧邻的 img 作为封面
                const siblingImg = el.querySelector('img[src*="pbs.twimg.com"]')?.getAttribute('src');
                const thumbnailUrl = poster || siblingImg || '';

                // 视频源
                const source = videoEl.querySelector('source')?.getAttribute('src') || videoEl.getAttribute('src');

                // 去重
                const key = source || thumbnailUrl;
                if (!key || seen.has(key)) continue;
                seen.add(key);

                // 区分 GIF
                const isGif = (source?.includes('tweet_video') || thumbnailUrl.includes('tweet_video_thumb'));

                media.push({
                    type: isGif ? 'gif' : 'video',
                    url: source || thumbnailUrl, // 如果没源，至少把封面存下来
                    previewUrl: thumbnailUrl
                });
            }
        }

        return media;
    }
}
