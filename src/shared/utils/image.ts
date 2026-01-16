export const normalizeTwitterImage = (url: string | undefined, type: 'avatar' | 'media' = 'media'): string => {
    if (!url) return '';
    if (url.startsWith('blob:')) return '';

    let processed = url.replace('http:', 'https:');

    // 处理 Twitter 媒体服务器图片
    if (processed.includes('pbs.twimg.com')) {
        // 头像处理: _normal -> _bigger or _200x200
        if (type === 'avatar' && processed.includes('_normal.')) {
            return processed.replace('_normal.', '_400x400.');
        }

        // 媒体图处理: 加 format 参数
        if (type === 'media' && !processed.includes('/profile_images/')) {
            if (!processed.includes('?')) {
                processed += '?format=jpg&name=large';
            }
        }
    }

    return processed;
};
