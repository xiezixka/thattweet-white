import { DomExtractor } from './domExtractor';
import { Tweet } from '../../shared/types/tweet';

/**
 * 👀 DOM 观察员
 * 持续扫描页面上的推文元素，将漏网之鱼发送给后台，并给已保存的推文添加视觉标记
 */
export class DomObserver {
    private observer: MutationObserver | null = null;
    private processedIds = new Set<string>();
    private validator?: (tweet: Tweet) => boolean;
    private isScanning = false;
    private scanTimer: any = null;

    constructor(validator?: (tweet: Tweet) => boolean) {
        this.validator = validator;
        this.start();
    }

    start() {
        if (this.observer) return;

        // 🛡️ 确保 body 存在再启动
        if (!document.body) {
            window.requestAnimationFrame(() => this.start());
            return;
        }

        // 0. 注入高亮样式
        this.injectStyles();

        // 1. 初始全量扫描
        this.scan();

        // 2. 监听 DOM 变化 (防抖)
        this.observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    shouldScan = true;
                    break;
                }
            }
            if (shouldScan) {
                this.scheduleScan();
            }
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
        console.log('[ThatTweet] DOM Observer started.');
    }

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    /**
     * 注入高亮样式
     */
    private injectStyles() {
        if (document.getElementById("thattweet-styles")) return;
        const style = document.createElement("style");
        style.id = "thattweet-styles";
        // 样式：天蓝色柔和发光边框，与 Dark Mode 完美融合
        style.textContent = `
            article[data-thattweet-saved="true"] {
                outline: 2px solid rgba(29, 155, 240, 0.4) !important;
                outline-offset: -2px !important;
                border-radius: 12px !important;
                transition: outline 0.3s ease;
                box-shadow: inset 0 0 10px rgba(29, 155, 240, 0.05) !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 标记这些 ID 已经被 API 拦截到了
     * DOM 就会给它们加上高亮框
     */
    markAsProcessed(ids: string[]) {
        ids.forEach(id => this.processedIds.add(id));
        // 收到新的 API 数据后，立即扫一遍 DOM，给它们加上高亮
        this.scheduleScan();
    }

    private scheduleScan() {
        if (this.scanTimer) clearTimeout(this.scanTimer);
        this.scanTimer = setTimeout(() => {
            // 使用 requestIdleCallback 在浏览器空闲时扫描，避免卡顿
            if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(() => this.scan());
            } else {
                this.scan();
            }
        }, 200); // 提速：200ms 防抖，视觉反馈更灵敏
    }

    private scan() {
        if (this.isScanning) return;
        this.isScanning = true;

        try {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            const newTweets: Tweet[] = [];

            articles.forEach(article => {
                // 1. 先尝试获取 Tweet 对象 (内部已含广告过滤)
                const tweet = DomExtractor.extractTweetFromElement(article);

                if (!tweet) return; // 可能是广告，跳过

                // 2. 校验：是否符合当前页面的抓取规则 (详情页只存主推，主页全存等)
                if (this.validator && !this.validator(tweet)) {
                    return;
                }

                // 3. 检查是否已处理
                if (this.processedIds.has(tweet.id)) {
                    // 已处理 -> 标记视觉高亮
                    if (article.getAttribute('data-thattweet-saved') !== 'true') {
                        article.setAttribute('data-thattweet-saved', 'true');
                    }
                } else if (tweet.id) {
                    // 未处理 -> 加入保存队列
                    console.log('[ThatTweet] DOM found fallback tweet:', tweet.id);
                    newTweets.push(tweet);

                    // 标记为已处理
                    this.processedIds.add(tweet.id);
                    article.setAttribute('data-thattweet-saved', 'true');
                }
            });

            if (newTweets.length > 0) {
                // 发送给 Background 保存
                chrome.runtime.sendMessage({
                    type: 'SAVE_TWEETS_BATCH',
                    payload: {
                        tweets: newTweets,
                        users: [] // DOM 模式下很难提取完整的 UserCache，只依靠 Tweet 里的嵌入字段
                    }
                }).catch(() => { /* ignore connection errors */ });
            }
        } finally {
            this.isScanning = false;
        }
    }
}
