/**
 * 极简 i18n Hook
 */
export function useTranslation() {
    const t = (key: string, substitutions?: string | string[] | Record<string, any>) => {
        // 降级处理
        if (typeof chrome === 'undefined' || !chrome.i18n) {
            return key;
        }

        // 处理对象形式的变量替换
        let subs: string | string[] | undefined;
        if (substitutions && typeof substitutions === 'object' && !Array.isArray(substitutions)) {
            // chrome.i18n.getMessage 还是更适合顺序数组替换 $1, $2
            // 这里为了向下兼容直接转为字符串或数组，或者如果 message.json 里用了变量名，可能需要手动处理
            // 但标准 chrome.i18n 仅支持 $1, $2 形式。
            // 简单处理：如果是对象且只有一个 count 属性，模拟单变量替换
            if ('count' in substitutions) {
                subs = String(substitutions.count);
            }
        } else {
            subs = substitutions as string | string[] | undefined;
        }

        return chrome.i18n.getMessage(key, subs) || key;
    };

    return { t };
}
