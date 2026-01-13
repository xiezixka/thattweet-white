import { DomExtractor } from './domExtractor';
import { Tweet } from '../../shared/types/tweet';

/**
 * 👀 DOM 观察员
 * 持续扫描页面上的推文元素，将漏网之鱼发送给后台
 */
export class DomObserver {
    private observer: MutationObserver | null = null;
    private processedIds = new Set<string>();
    private isScanning = false;
    private scanTimer: any = null;

    constructor() {
        this.start();
    }

    start() {
        if (this.observer) return;

        // 🛡️ 确保 body 存在再启动 (针对 document_start)
        if (!document.body) {
            window.requestAnimationFrame(() => this.start());
            return;
        }

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
     * 标记这些 ID 已经被 API 拦截到了，DOM 没必要再处理
     */
    markAsProcessed(ids: string[]) {
        ids.forEach(id => this.processedIds.add(id));
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
        }, 1000); // 1秒防抖，不需要太实时，这是兜底
    }

    private scan() {
        if (this.isScanning) return;
        this.isScanning = true;

        try {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            const newTweets: Tweet[] = [];

            articles.forEach(article => {
                // 试图解析
                const tweet = DomExtractor.extractTweetFromElement(article);

                if (tweet && tweet.id && !this.processedIds.has(tweet.id)) {
                    // 找到了一个漏网之鱼！
                    console.log('[ThatTweet] DOM found fallback tweet:', tweet.id);
                    newTweets.push(tweet);
                    this.processedIds.add(tweet.id);
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
