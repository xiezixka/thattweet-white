/**
 * 高级搜索语法解析器
 * 支持 GitHub 风格的搜索修饰符
 * 
 * 示例:
 * - tag:AI - 只匹配有 AI 标签的推文
 * - category:技术 - 只匹配特定分类
 * - score:>80 - 只显示高分推文
 * - from:elonmusk - 只显示特定作者
 * - has:media - 只显示有媒体的推文
 * - is:bookmarked - 只显示收藏的推文
 */

import { Tweet } from '../types/tweet';

export interface ParsedQuery {
    // 纯文本搜索词 (去掉所有修饰符后的部分)
    text: string;
    // 标签过滤 (可多个)
    tags: string[];
    // 分类过滤 (可多个)
    categories: string[];
    // 作者过滤 (可多个)
    authors: string[];
    // 分数过滤
    scoreMin?: number;
    scoreMax?: number;
    // 特殊标记
    hasMedia?: boolean;
    isBookmarked?: boolean;
    // 时间过滤
    since?: number; // timestamp
    until?: number; // timestamp
}

/**
 * 解析搜索查询字符串
 */
export function parseSearchQuery(query: string): ParsedQuery {
    const result: ParsedQuery = {
        text: '',
        tags: [],
        categories: [],
        authors: [],
    };

    if (!query.trim()) return result;

    // 正则表达式匹配所有修饰符
    const modifierRegex = /(\w+):([^\s]+)/g;
    let textParts: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = modifierRegex.exec(query)) !== null) {
        // 收集修饰符之前的文本
        if (match.index > lastIndex) {
            textParts.push(query.slice(lastIndex, match.index).trim());
        }
        lastIndex = match.index + match[0].length;

        const [, key, value] = match;
        const lowerKey = key.toLowerCase();
        const cleanValue = value.replace(/^["']|["']$/g, ''); // 去掉引号

        switch (lowerKey) {
            case 'tag':
            case 'tags':
                result.tags.push(cleanValue.toLowerCase());
                break;
            case 'category':
            case 'cat':
                result.categories.push(cleanValue.toLowerCase());
                break;
            case 'from':
            case 'author':
                result.authors.push(cleanValue.toLowerCase().replace(/^@/, ''));
                break;
            case 'score':
                // 支持 score:>80, score:<50, score:80
                if (cleanValue.startsWith('>')) {
                    result.scoreMin = parseInt(cleanValue.slice(1), 10);
                } else if (cleanValue.startsWith('<')) {
                    result.scoreMax = parseInt(cleanValue.slice(1), 10);
                } else if (cleanValue.includes('-')) {
                    const [min, max] = cleanValue.split('-').map(Number);
                    result.scoreMin = min;
                    result.scoreMax = max;
                } else {
                    const exact = parseInt(cleanValue, 10);
                    result.scoreMin = exact;
                    result.scoreMax = exact;
                }
                break;
            case 'has':
                if (cleanValue === 'media' || cleanValue === 'image' || cleanValue === 'video') {
                    result.hasMedia = true;
                }
                break;
            case 'is':
                if (cleanValue === 'bookmarked' || cleanValue === 'saved' || cleanValue === 'starred') {
                    result.isBookmarked = true;
                }
                break;
            case 'since':
                result.since = parseDateValue(cleanValue);
                break;
            case 'until':
                result.until = parseDateValue(cleanValue);
                break;
        }
    }

    // 收集最后一个修饰符之后的文本
    if (lastIndex < query.length) {
        textParts.push(query.slice(lastIndex).trim());
    }

    result.text = textParts.filter(Boolean).join(' ').trim();
    return result;
}

/**
 * 解析日期值 (支持 today, yesterday, 7d, 30d, 或 ISO 日期)
 */
function parseDateValue(value: string): number | undefined {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    switch (value.toLowerCase()) {
        case 'today':
            return now - day;
        case 'yesterday':
            return now - 2 * day;
        case 'week':
        case '7d':
            return now - 7 * day;
        case 'month':
        case '30d':
            return now - 30 * day;
        default:
            // 尝试解析为天数 (如 "3d")
            const daysMatch = value.match(/^(\d+)d$/i);
            if (daysMatch) {
                return now - parseInt(daysMatch[1], 10) * day;
            }
            // 尝试解析为日期
            const timestamp = Date.parse(value);
            if (!isNaN(timestamp)) return timestamp;
            return undefined;
    }
}

/**
 * 根据解析后的查询过滤推文
 */
export function filterTweetsByQuery<T extends Tweet>(tweets: T[], parsed: ParsedQuery): T[] {
    return tweets.filter(tweet => {
        // 1. 文本搜索 (在正文、摘要、理由中匹配)
        if (parsed.text) {
            const q = parsed.text.toLowerCase();
            const textMatch =
                tweet.text.toLowerCase().includes(q) ||
                (tweet.aiSummary || '').toLowerCase().includes(q) ||
                (tweet.aiReason || '').toLowerCase().includes(q);
            if (!textMatch) return false;
        }

        // 2. 标签过滤
        if (parsed.tags.length > 0) {
            const tweetTags = (tweet.aiTags || []).map(t => t.toLowerCase());
            const hasAllTags = parsed.tags.every(tag =>
                tweetTags.some(t => t.includes(tag))
            );
            if (!hasAllTags) return false;
        }

        // 3. 分类过滤
        if (parsed.categories.length > 0) {
            const category = (tweet.aiCategory || '').toLowerCase();
            const matchCategory = parsed.categories.some(c => category.includes(c));
            if (!matchCategory) return false;
        }

        // 4. 作者过滤
        if (parsed.authors.length > 0) {
            let authorHandle = '';
            let authorName = '';

            const author = tweet.author as any;
            if (typeof author === 'string') {
                authorHandle = author.toLowerCase();
                authorName = author.toLowerCase();
            } else if (author) {
                authorHandle = (author.handle || '').toLowerCase();
                authorName = (author.name || '').toLowerCase();
            }

            const matchAuthor = parsed.authors.some(a =>
                authorHandle.includes(a) || authorName.includes(a)
            );
            if (!matchAuthor) return false;
        }

        // 5. 分数过滤
        if (parsed.scoreMin !== undefined) {
            if ((tweet.aiScore ?? 0) < parsed.scoreMin) return false;
        }
        if (parsed.scoreMax !== undefined) {
            if ((tweet.aiScore ?? 0) > parsed.scoreMax) return false;
        }

        // 6. 媒体过滤
        if (parsed.hasMedia) {
            if (!tweet.media || tweet.media.length === 0) return false;
        }

        // 7. 收藏过滤
        if (parsed.isBookmarked) {
            if (!tweet.isBookmarked) return false;
        }

        // 8. 时间过滤
        if (parsed.since !== undefined) {
            if (tweet.savedAt < parsed.since) return false;
        }
        if (parsed.until !== undefined) {
            if (tweet.savedAt > parsed.until) return false;
        }

        return true;
    });
}

/**
 * 生成搜索语法的帮助提示
 */
export const SEARCH_SYNTAX_HELP = [
    { syntax: 'tag:AI', desc: '搜索包含 AI 标签的推文' },
    { syntax: 'category:技术', desc: '搜索"技术"分类的推文' },
    { syntax: 'score:>80', desc: '搜索评分大于 80 的推文' },
    { syntax: 'from:elonmusk', desc: '搜索来自特定作者的推文' },
    { syntax: 'has:media', desc: '搜索包含图片/视频的推文' },
    { syntax: 'is:bookmarked', desc: '搜索已收藏的推文' },
    { syntax: 'since:7d', desc: '搜索最近 7 天的推文' },
];
