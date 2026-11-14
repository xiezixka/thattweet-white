import messages from '../src/locales/zh_CN/messages.json';
import { version } from '../package.json';

// This mock runs only on localhost. The production extension never imports it.
const listeners = new Set<(changes: unknown, area: string) => void>();
const storageKey = 'thattweet-qa-storage';
const errors: string[] = [];
(window as any).__qaErrors = errors;
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const read = () => JSON.parse(localStorage.getItem(storageKey) || '{}');
const storage = {
    get(keys: string[] | string | null, callback?: (data: any) => void) {
        const all = read();
        const result = keys === null ? all : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, all[key]]));
        if (callback) { queueMicrotask(() => callback(result)); return; }
        return Promise.resolve(result);
    },
    set(values: Record<string, unknown>, callback?: () => void) {
        const old = read();
        localStorage.setItem(storageKey, JSON.stringify({ ...old, ...values }));
        const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { oldValue: old[key], newValue }]));
        queueMicrotask(() => {
            listeners.forEach(fn => fn(changes, 'local'));
            callback?.();
        });
        return Promise.resolve();
    }
};
(window as any).chrome = {
    permissions: { request: async () => true },
    tabs: { create: async () => { location.href = '/qa/preview.html'; } },
    storage: { local: storage, onChanged: { addListener: (fn: any) => listeners.add(fn), removeListener: (fn: any) => listeners.delete(fn) } },
    runtime: {
        getManifest: () => ({ version }),
        getURL: (path: string) => `${location.origin}/${path}`,
        sendMessage: (_message: unknown, callback?: (value: unknown) => void) => { callback?.({ success: true }); return Promise.resolve({ success: true }); },
        openOptionsPage: () => { location.href = '/qa/preview.html'; },
        onMessage: { addListener() {}, removeListener() {} },
    },
    i18n: { getMessage(key: string, substitutions: string | string[] = []) {
        const entry = (messages as Record<string, any>)[key];
        if (!entry) return key;
        const values = Array.isArray(substitutions) ? substitutions : [substitutions];
        return entry.message.replace(/\$(\w+)\$/g, (_: string, name: string) => {
            const content = entry.placeholders?.[name.toLowerCase()]?.content || '';
            return content.replace(/\$(\d+)/g, (_: string, i: string) => values[Number(i) - 1] || '');
        }).replace(/\$(\d+)/g, (_: string, i: string) => values[Number(i) - 1] || '');
    } },
};

const { db } = await import('../src/core/storage/db');
if (await db.tweets.count() === 0) {
    await db.users.bulkPut([
        { id: 'qa-user', name: '主题验收 · 示例账号', handle: 'theme_demo', avatar: '/icon.png', updatedAt: Date.now() },
        { id: 'qa-user-2', name: '本地测试 · 示例账号', handle: 'local_demo', avatar: '/icon.png', updatedAt: Date.now() }
    ]);
    const examples = [
        '白色主题验收：主画布、搜索框和卡片应使用浅色背景，正文与辅助文字保持清晰。此内容为本地测试数据。',
        '设置保存验收：在实验室的系统信息里切换深浅色，刷新后应保留选择。原有字体选项继续可用。',
        '搜索验收：输入“备份”后，只应看到包含这个关键词的测试推文。清空输入恢复完整列表。',
        '备份验收：导出后再导入应保留推文、作者和标签。下载按钮应有实际响应。',
        '媒体验收：这张图是项目原有图标。切换主题不应反转或滤镜处理图片本身。',
        '图谱与统计验收：浅色背景中仍能识别节点、连接线与图表刻度。这些数字仅来自示例数据。'
    ];
    await db.tweets.bulkPut(examples.map((text, i) => ({
        id: `qa-${i}`, authorId: i % 2 ? 'qa-user-2' : 'qa-user', text,
        tweetUrl: `https://x.com/theme_demo/status/qa-${i}`, createdAt: Date.now() - i * 3600000,
        savedAt: Date.now() - i * 1000, source: 'import', isBookmarked: false, isArchived: false,
        tags: ['主题验收', i % 2 ? '测试' : '示例'], favoriteCount: 10 + i * 2, retweetCount: 3 + i,
        replyCount: i, viewCount: 100 + i * 30, aiStatus: 'completed', imageProcessStatus: 'completed',
        aiScore: 40 + i * 10, media: i === 4 ? [{ type: 'image', url: '/icon.png' }] : []
    })) as any);
}
const badge = document.createElement('div');
badge.textContent = '离线验收 · 示例数据 · 扩展 API 模拟';
badge.style.cssText = 'position:fixed;right:10px;bottom:8px;z-index:100000;background:#e8f4ff;color:#075985;padding:4px 8px;border-radius:4px;font:11px sans-serif;pointer-events:none';
document.body.append(badge);
if (location.pathname.endsWith('/popup.html')) await import('../src/pages/popup/index');
else await import('../src/pages/options/index');
