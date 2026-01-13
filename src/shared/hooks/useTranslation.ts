/**
 * 极简 i18n Hook
 */
export function useTranslation() {
    const t = (key: string, substitutions?: string | string[]) => {
        // 降级处理：如果在 Service Worker 或某些环境下没加载，返回 Key 本身
        if (typeof chrome === 'undefined' || !chrome.i18n) {
            return key;
        }
        return chrome.i18n.getMessage(key, substitutions) || key;
    };

    return { t };
}
