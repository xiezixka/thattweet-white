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

        // 🌟 优先尝试长文解析 (X Article / Longform)
        // 方法1: longformRichTextComponent (文章正文)
        const articleTextElement = articleElement.querySelector('[data-testid="longformRichTextComponent"]');
        if (articleTextElement) {
            // 获取所有段落和文本块并拼接
            const fragments = Array.from(articleTextElement.querySelectorAll('[data-text="true"]'));
            if (fragments.length > 0) {
                text = fragments.map(f => f.textContent).join('\n\n');
                console.log(`[ThatTweet DOM] Found ${fragments.length} text fragments in article`);
            } else {
                // 回退: 直接取容器文本
                text = articleTextElement.textContent || "";
            }
        }

        // 方法2: 如果方法1没拿到，尝试从 twitterArticleReadView 获取
        if (!text) {
            const articleReadView = articleElement.querySelector('[data-testid="twitterArticleReadView"]');
            if (articleReadView) {
                // 尝试获取标题
                const titleEl = articleReadView.querySelector('[data-testid="twitter-article-title"]');
                const title = titleEl?.textContent || '';

                // 获取所有文本块
                const allTextBlocks = Array.from(articleReadView.querySelectorAll('[data-text="true"]'));
                if (allTextBlocks.length > 0) {
                    const bodyText = allTextBlocks.map(f => f.textContent).join('\n\n');
                    text = title ? `${title}\n\n${bodyText}` : bodyText;
                    console.log(`[ThatTweet DOM] Found article via articleReadView: ${allTextBlocks.length} blocks, title: ${title.substring(0, 50)}`);
                }
            }
        }

        // 方法3: 直接寻找 DraftJS 编辑器内容 (X 文章使用 DraftJS)
        if (!text) {
            const draftContent = articleElement.querySelector('.public-DraftEditor-content');
            if (draftContent) {
                const fragments = Array.from(draftContent.querySelectorAll('[data-text="true"]'));
                if (fragments.length > 0) {
                    text = fragments.map(f => f.textContent).join('\n\n');
                    console.log(`[ThatTweet DOM] Found ${fragments.length} fragments via DraftJS`);
                }
            }
        }

        // 如果没拿到长文，或者是普通推文，用标准选择器
        if (!text) {
            const tweetTextElement = articleElement.querySelector('[data-testid="tweetText"]');
            if (tweetTextElement) {
                text = tweetTextElement.textContent || "";
            }
        }

        // Debug: 输出最终结果
        if (text && text.length > 100) {
            console.log(`[ThatTweet DOM] Extracted text (${text.length} chars): ${text.substring(0, 100)}...`);
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

        // 6. 互动数据提取 (加上 DOM 解析)
        const replyCount = this.parseDOMCount(articleElement, '[data-testid="reply"]', ["reply", "replies", "回复"]);
        const retweetCount = this.parseDOMCount(articleElement, '[data-testid="retweet"]', ["retweet", "retweets", "转发"]);
        const favoriteCount = this.parseDOMCount(articleElement, '[data-testid="like"]', ["like", "likes", "喜欢"]);
        const viewCount = this.parseDOMCount(articleElement, 'a[href*="/analytics"], [data-testid="app-search-tweet-stats-analytics"]', ["view", "views", "浏览"]);

        // 7. 确定最终的 authorId（优先使用数字 ID）
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
            favoriteCount: favoriteCount || 0,
            retweetCount: retweetCount || 0,
            replyCount: replyCount || 0,
            viewCount: viewCount || 0,
            media: media,
            aiStatus: ProcessStatus.Pending,
            imageProcessStatus: ProcessStatus.Pending
        } as Tweet;
    }

    private static parseDOMCount(articleElement: Element, selector: string, keywords: string[]): number | undefined {
        const el = articleElement.querySelector(selector);
        if (!el) return undefined;

        const text = el.textContent?.trim() || "";
        const label = el.getAttribute('aria-label') || "";

        // 1. 优先尝试从 aria-label 提取 (通常更准确且包含完整数字)
        let targetText = "";
        if (label) {
            for (const kw of keywords) {
                if (label.toLowerCase().includes(kw.toLowerCase())) {
                    const regex = new RegExp(`(\\d[\\d,.]*)\\s*([KM万]?)\\s*${kw}`, 'i');
                    const m = label.match(regex);
                    if (m) { targetText = m[1] + (m[2] || ""); break; }
                }
            }
        }

        // 2. 如果 label 没拿到，尝试从可视文本提取
        if (!targetText) {
            const m = text.match(/(\d[\d,.]*)\s*([KM万]?)/i);
            if (m) targetText = m[1] + (m[2] || "");
        }

        if (!targetText) return undefined;

        // 3. 单位转换
        const cleanText = targetText.replace(/,/g, '');
        const match = cleanText.match(/(\d[\d.]*)\s*([KM万]?)/i);
        if (!match) return undefined;

        let val = parseFloat(match[1]);
        const unit = (match[2] || "").toUpperCase();
        if (unit === 'K') val *= 1000;
        else if (unit === 'M') val *= 1000000;
        else if (unit === '万') val *= 10000;

        return Math.floor(val);
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
                let source = videoEl.querySelector('source')?.getAttribute('src') || videoEl.getAttribute('src');

                // 🛡️ 核心修复：不要存 blob: URL，它在扩展页面无效
                if (source && source.startsWith('blob:')) {
                    source = null;
                }

                if (thumbnailUrl && thumbnailUrl.startsWith('blob:')) {
                    // 如果封面也是 blob，尝试置空，由下游逻辑处理或由 TweetCard normalize 处理
                }

                // 去重
                const key = source || thumbnailUrl;
                if (!key || seen.has(key)) continue;
                seen.add(key);

                // 区分 GIF
                const isGif = (source?.includes('tweet_video') || thumbnailUrl.includes('tweet_video_thumb'));

                media.push({
                    type: isGif ? 'gif' : 'video',
                    url: source || (thumbnailUrl && !thumbnailUrl.startsWith('blob:') ? thumbnailUrl : ''),
                    previewUrl: thumbnailUrl && !thumbnailUrl.startsWith('blob:') ? thumbnailUrl : ''
                });
            }
        }

        return media;
    }
}
