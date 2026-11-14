declare const __SAFARI_IOS__: boolean;

// Build-time flag: desktop builds remain independent of the iPhone package.
export const isSafariIOS = typeof __SAFARI_IOS__ !== 'undefined' && __SAFARI_IOS__;

export function downloadFile(content: string, name: string, type = 'text/plain') {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // WebKit may start the download after the click handler has returned.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openDashboard() {
    if (isSafariIOS) return chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/options/index.html') });
    return chrome.runtime.openOptionsPage();
}

export async function requestAIHostPermission(baseUrl: string) {
    if (!isSafariIOS) return;
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:') throw new Error('iPhone 版的 AI 接口需要 HTTPS 地址。');
    const allowed = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (!allowed) throw new Error('尚未允许访问这个 AI 服务，请重新保存服务商并授权。');
}
