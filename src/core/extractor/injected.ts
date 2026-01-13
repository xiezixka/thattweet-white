import { Normalizer } from './normalizer';

/**
 * ThatTweet API Interceptor
 * 运行在网页环境 (MAIN World)，负责 Hook 原生网络请求
 */
(function () {
    if ((window as any).__THATTWEET_INJECTED__) return;
    (window as any).__THATTWEET_INJECTED__ = true;

    const processText = (url: string, text: string) => {
        // 粗筛路径
        if (!url.includes('/graphql/') && !url.includes('/1.1/') && !url.includes('/2/')) return;

        try {
            const json = JSON.parse(text);
            const result = Normalizer.findDataInObject(json);

            if (result.tweets.length > 0) {
                console.log(`%c[ThatTweet] 提取到 ${result.tweets.length} 条推文数据`, 'color: #1d9bf0; font-weight: bold');
                // 发送给 Content Script
                window.dispatchEvent(new CustomEvent('thattweet-tweet-data', {
                    detail: {
                        tweets: result.tweets,
                        users: result.users,
                        url: url
                    }
                }));
            }
        } catch (e) {
            // 忽略非 JSON 响应
        }
    };

    // 1. Hook Fetch
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

        response.clone().text()
            .then(text => processText(url, text))
            .catch(() => { });

        return response;
    };

    // 2. Hook XHR
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    XHR.open = function (method: string, url: string | URL, ...rest: any[]) {
        (this as any).__thattweet_url = url.toString();
        return originalOpen.apply(this, [method, url, ...rest] as any);
    };

    XHR.send = function (body?: any) {
        this.addEventListener('load', function () {
            const url = (this as any).__thattweet_url;
            if (url && (this.responseType === '' || this.responseType === 'text')) {
                processText(url, this.responseText);
            }
        });
        return originalSend.apply(this, [body]);
    };

    console.log('%c[ThatTweet] %cInterceptor Active', 'color: #1d9bf0; font-weight: bold', 'color: gray');
})();
