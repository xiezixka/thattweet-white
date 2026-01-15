import { Tweet, CaptureSource, ProcessStatus, MediaItem } from '../../shared/types/tweet';

type TweetMedia = { type: "image" | "video" | "gif"; url: string; previewUrl?: string };

/**
 * 🕵️‍♂️ DOM 解析器 (移植自旧版)
 * 作为 API 拦截的兜底方案，专门用于抓取首屏漏网或 API 变动后的推文
 */
export class DomExtractor {
    /**
     * 判断是否为广告 (移植自旧版)
     */
    static isAdvertisement(articleElement: Element): boolean {
        // 1. socialContext 检查
        const socialContext = articleElement.querySelector('[data-testid="socialContext"]');
        if (socialContext) {
            const text = socialContext.textContent?.trim() || "";
            if (/^(Promoted|Ad|广告|推荐|赞助)$/.test(text) || text.includes("Promoted") || text.includes("广告") || text.includes("Sponsored")) {
                return true;
            }
        }

        // 2. aria-label 检查
        const adLabels = articleElement.querySelectorAll(
            '[aria-label*="Promoted"], [aria-label*="广告"], [aria-label*="Ad"], [aria-label*="Sponsored"]'
        );
        for (const el of adLabels) {
            const label = el.getAttribute('aria-label') || "";
            if (label === "Promoted" || label === "广告" || label === "Ad" || label === "Sponsored" ||
                label.endsWith(" Promoted") || label.endsWith(" 广告")) {
                return true;
            }
        }

        // 3. 顶部文本检查
        const hasTopAdText = !!Array.from(articleElement.querySelectorAll('span')).find(s =>
            s.textContent?.trim() === "广告" || s.textContent?.trim() === "Promoted"
        );
        if (hasTopAdText) return true;

        // 4. 组合特征检查 (PlacementTracking + No Time)
        const hasPlacementTracking = !!articleElement.querySelector('[data-testid="placementTracking"]');
        const noTimeElement = !articleElement.querySelector('time');

        if (hasPlacementTracking && noTimeElement) {
            const textContent = articleElement.textContent || "";
            if (textContent.includes("Promoted") || textContent.includes("广告") || textContent.includes("赞助")) {
                return true;
            }
        }

        return false;
    }

    static extractTweetFromElement(articleElement: Element): Tweet | null {
        // 🛡️ 广告过滤
        if (this.isAdvertisement(articleElement)) return null;

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

        // 4. 头像 (DOM 兜底关键) + 从头像 URL 提取数字 ID
        let authorAvatarUrl: string | undefined;
        let numericAuthorId: string | null = null;

        const avatarSelectors = [
            'article[data-testid="tweet"] [data-testid="Tweet-User-Avatar"] img',
            'article[data-testid="tweet"] img[src*="profile_images"]',
            'img[data-testid="Tweet-User-Avatar"]',
        ];

        for (const selector of avatarSelectors) {
            const img = articleElement.querySelector(selector);
            // 考虑 lazy-loading: 优先取 data-src 或 src
            const src = img?.getAttribute("src") || img?.getAttribute("data-src");

            if (src && (src.includes("profile_images") || src.includes("abs.twimg.com/sticky/default_profile_images"))) {
                authorAvatarUrl = src.replace("_normal.", "_bigger.");

                const idMatch = src.match(/profile_images\/(\d+)\//);
                if (idMatch) {
                    numericAuthorId = idMatch[1];
                }
                break;
            }
        }

        // 5. 媒体提取
        const media = this.extractMediaFromDOM(articleElement);

        // 6. 确定最终的 authorId（优先使用数字 ID）
        const finalAuthorId = numericAuthorId || authorHandle;

        return {
            id: tweetId,
            authorId: finalAuthorId, // 优先使用数字 ID，无法获取时回退到 Handle
            author: authorHandle,   // 旧版兼容字段（始终存 handle）
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
