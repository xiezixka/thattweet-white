import { createRoot } from 'react-dom/client';
import './style.css'

/**
 * 注入拦截器脚本到网页环境 (MAIN World)
 */
function injectInterceptor() {
  if (document.getElementById('thattweet-interceptor')) return;
  const script = document.createElement('script');
  script.id = 'thattweet-interceptor';
  // 手动指定构建好的文件路径，避开 CRXJS 的 loader 魔法（解决 getURL undefined 报错）
  script.src = chrome.runtime.getURL('assets/injected.js');
  script.type = 'module';
  (document.head || document.documentElement).appendChild(script);
}

import { DomObserver } from '../../core/extractor/observer';
import { Tweet } from '../../shared/types/tweet';

function shouldSaveTweet(tweet: Tweet): boolean {
  const path = window.location.pathname;

  // 1. 白名单：主页 (Home) 和 搜索页 (Search)
  // 允许保存这些页面上的所有内容 (Feed流)
  if (path === '/' || path === '/home' || path.startsWith('/search')) {
    return true;
  }

  // 2. 详情页 (Status)：只保存当前 URL 指定的主推文，屏蔽下方的回复 (Replies)
  const match = path.match(/\/status\/(\d+)/);
  if (match) {
    const mainTweetId = match[1];
    return tweet.id === mainTweetId;
  }

  // 3. 避免在系统页面抓取 (Notification, Messages, Settings, Bookmarks, Explore)
  const systemPages = ['/notifications', '/messages', '/settings', '/explore', '/i/', '/bookmarks', '/compose/'];
  if (systemPages.some(p => path.startsWith(p))) {
    return false;
  }

  // 4. 其他页面 (默认视为用户主页 Profile, 列表 List 等) -> 允许抓取
  return true;
}

// 初始化 DOM 观察者 (作为兜底)
const domObserver = new DomObserver(shouldSaveTweet);

/**
 * 监听来自拦截器的自定义事件
 */
window.addEventListener('thattweet-tweet-data', (event: any) => {
  if (!Array.isArray(event.detail?.tweets) || !Array.isArray(event.detail?.users)) return;
  const { tweets, users } = event.detail;

  // Filter tweets based on current page context (Enable saving replies!)
  const tweetsToSave = (tweets as Tweet[]).filter(tweet => shouldSaveTweet(tweet));

  if (tweetsToSave.length === 0) return;

  // 1. 告诉 DOM 观察者：这些推文 API 已经抓到了，你别管了
  if (tweetsToSave && Array.isArray(tweetsToSave)) {
    domObserver.markAsProcessed(tweetsToSave.map((t: any) => t.id));
  }

  // 2. 将数据发送到 Background 进一步处理 (持久化、AI 等)
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({
      type: 'SAVE_TWEETS_BATCH',
      payload: { tweets: tweetsToSave, users }
    }).catch(err => {
      // 这里的错误通常可以忽略，或者是由于 context invalidated 引起的
      if (err.message?.includes('Extension context invalidated')) {
        console.log('[ThatTweet] Context invalidated, stopping events.');
        return;
      }
      console.warn('[ThatTweet] Failed to send tweets to background:', err);
    });
  }
});

// 初始化注入
injectInterceptor();

// 简单的 UI 提示
const div = document.createElement('div');
div.id = '__root';
document.body.appendChild(div);

const rootContainer = document.querySelector('#__root');
if (rootContainer) {
  const root = createRoot(rootContainer);
  root.render(
    <div className='fixed bottom-4 right-4 p-2 bg-blue-500/80 backdrop-blur text-white rounded-lg shadow-xl z-[9999] text-xs pointer-events-none'>
      ThatTweet Capture <span className='font-bold text-green-300'>Hybrid</span>
    </div>
  );
}
