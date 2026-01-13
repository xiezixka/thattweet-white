import { createRoot } from 'react-dom/client';
import './style.css'
/**
 * 注入拦截器脚本到网页环境 (MAIN World)
 */
function injectInterceptor() {
  if (document.getElementById('thattweet-interceptor')) return;
  const script = document.createElement('script');
  script.id = 'thattweet-interceptor';
  // 手动指定构建好的文件路径，避开 CRXJS 的 loader 魔法
  script.src = chrome.runtime.getURL('assets/injected.js');
  script.type = 'module';
  (document.head || document.documentElement).appendChild(script);
}

/**
 * 监听来自拦截器的自定义事件
 */
window.addEventListener('thattweet-tweet-data', (event: any) => {
  const { tweets, users } = event.detail;

  // 将数据发送到 Background 进一步处理 (持久化、AI 等)
  chrome.runtime.sendMessage({
    type: 'SAVE_TWEETS_BATCH',
    payload: { tweets, users }
  }).catch(err => {
    console.warn('[ThatTweet] Failed to send tweets to background:', err);
  });
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
      ThatTweet Interceptor <span className='font-bold text-green-300'>Active</span>
    </div>
  );
}
