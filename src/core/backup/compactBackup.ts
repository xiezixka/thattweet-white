/**
 * [ThatTweet] Compact Backup Format
 * 
 * 优化备份文件体积：导出时省略可推导字段，导入时重新拼接
 * 
 * 省略/简化规则:
 * 1. Avatar URL → 只保留文件名部分 (例: 4IFUGOl2_bigger.jpg)
 * 2. Tweet URL → 完全省略 (可从 author + id 推导)
 * 3. Media URL → 只保留路径部分
 * 4. previewUrl → 省略 (通常与 url 相同)
 * 5. 默认值字段 → 省略 (favoriteCount=0, isBookmarked=false 等)
 * 6. Tweet 中的作者冗余信息 → 可从 users 表查找
 */

import { Tweet, UserCache, MediaItem, ProcessStatus, CaptureSource } from '../../shared/types/tweet';

// =============== 常量 ===============
const AVATAR_URL_PREFIX = 'https://pbs.twimg.com/profile_images/';
const MEDIA_URL_PREFIX = 'https://pbs.twimg.com/media/';
const TWEET_URL_PREFIX = 'https://x.com/';

// =============== 紧凑类型定义 ===============

/** 紧凑版 Media */
interface CompactMedia {
    t: 'i' | 'v' | 'g';  // type: image/video/gif
    u: string;           // url (只保留路径部分)
}

/** 紧凑版 Tweet (省略可推导字段) */
interface CompactTweet {
    id: string;
    aid: string;         // authorId

    // 核心内容
    text: string;
    at: number;          // createdAt (统一为 number)
    src: string;         // source

    // 保存信息
    sAt: number;         // savedAt

    // 可选字段 (只在非默认值时存在)
    bm?: boolean;        // isBookmarked (默认 false)
    arc?: boolean;       // isArchived (默认 false)
    tags?: string[];     // tags (默认 [])
    note?: string;

    // 互动统计 (只在非0时存在)
    fav?: number;        // favoriteCount
    rt?: number;         // retweetCount
    re?: number;         // replyCount
    view?: number;       // viewCount

    // 媒体 (只在非空时存在)
    m?: CompactMedia[];

    // 关联上下文
    convId?: string;     // conversationId
    rToId?: string;      // replyToId
    rToU?: string;       // replyToUser

    // AI 数据 (只在非默认时存在)
    aiS?: number;        // aiScore
    aiSum?: string;      // aiSummary
    aiR?: string;        // aiReason
    aiT?: string[];      // aiTags
    aiC?: string;        // aiCategory
    aiSt?: string;       // aiStatus (默认 pending)
    aiAt?: number;       // aiProcessedAt

    // 图像数据
    ocr?: string;        // ocrText
    vd?: string;         // visionDescription
    imgSt?: string;      // imageProcessStatus (默认 pending)
    imgAt?: number;      // imageProcessedAt

    // 原始数据 (压缩后)
    raw?: string;        // rawZip
}

/** 紧凑版 User */
interface CompactUser {
    id: string;
    h: string;           // handle
    n: string;           // name
    av: string;          // avatar (只保留文件名)
    desc?: string;       // description
    fc?: number;         // followersCount
    v?: boolean;         // verified (默认 false)
    upAt: number;        // updatedAt
}

/** 紧凑备份文件格式 */
export interface CompactBackup {
    v: 2;                 // version = 2 表示紧凑格式
    ts: number;           // exportDate
    src: 'alarm' | 'manual';
    t: CompactTweet[];    // tweets
    u: CompactUser[];     // users
    s?: any;              // settings
}

/** 完整备份格式 (v1 兼容) */
export interface FullBackupV1 {
    version: 1;
    exportDate: number;
    exportedAt: string;
    source: 'alarm' | 'manual';
    tweets: Tweet[];
    users: UserCache[];
    settings: any;
    tweetCount: number;
}

// =============== 工具函数 ===============

/** 从完整 avatar URL 提取文件名 */
function extractAvatarFilename(url: string): string {
    // https://pbs.twimg.com/profile_images/1234567890/abc_bigger.jpg → abc_bigger.jpg
    if (!url) return '';
    const match = url.match(/\/([^/]+_\w+\.\w+)$/);
    return match ? match[1] : url;
}

/** 从文件名还原完整 avatar URL */
function restoreAvatarUrl(filename: string, userId: string): string {
    if (!filename) return '';
    // 如果已经是完整 URL，直接返回
    if (filename.startsWith('http')) return filename;
    return `${AVATAR_URL_PREFIX}${userId}/${filename}`;
}

/** 从完整 media URL 提取路径部分 */
function extractMediaPath(url: string): string {
    // https://pbs.twimg.com/media/G-lm604bUAAC1Qv?format=jpg&name=small → G-lm604bUAAC1Qv?format=jpg&name=small
    if (!url) return '';
    if (url.startsWith(MEDIA_URL_PREFIX)) {
        return url.substring(MEDIA_URL_PREFIX.length);
    }
    return url;
}

/** 还原完整 media URL */
function restoreMediaUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${MEDIA_URL_PREFIX}${path}`;
}

/** 从 author handle 和 tweet id 生成 tweet URL */
function generateTweetUrl(author: string, tweetId: string): string {
    return `${TWEET_URL_PREFIX}${author}/status/${tweetId}`;
}

/** 类型缩写转换 */
function mediaTypeToCompact(type: string): 'i' | 'v' | 'g' {
    if (type === 'video') return 'v';
    if (type === 'gif') return 'g';
    return 'i';
}

function compactToMediaType(t: 'i' | 'v' | 'g'): 'image' | 'video' | 'gif' {
    if (t === 'v') return 'video';
    if (t === 'g') return 'gif';
    return 'image';
}

// =============== 导出：压缩 ===============

/** 将完整 Tweet 转换为紧凑格式 */
function compressTweet(tweet: Tweet): CompactTweet {
    const compact: CompactTweet = {
        id: tweet.id,
        aid: tweet.authorId,
        text: tweet.text,
        at: typeof tweet.createdAt === 'number' ? tweet.createdAt : new Date(tweet.createdAt).getTime(),
        src: tweet.source,
        sAt: tweet.savedAt,
    };

    // 可选布尔字段 (只在 true 时存在)
    if (tweet.isBookmarked) compact.bm = true;
    if (tweet.isArchived) compact.arc = true;

    // 数组字段 (只在非空时存在)
    if (tweet.tags && tweet.tags.length > 0) compact.tags = tweet.tags;
    if (tweet.note) compact.note = tweet.note;

    // 计数字段 (只在非0时存在)
    if (tweet.favoriteCount) compact.fav = tweet.favoriteCount;
    if (tweet.retweetCount) compact.rt = tweet.retweetCount;
    if (tweet.replyCount) compact.re = tweet.replyCount;
    if (tweet.viewCount) compact.view = tweet.viewCount;

    // 媒体 (压缩后)
    if (tweet.media && tweet.media.length > 0) {
        compact.m = tweet.media.map(m => ({
            t: mediaTypeToCompact(m.type),
            u: extractMediaPath(m.url),
        }));
    }

    // 关联上下文
    if (tweet.conversationId) compact.convId = tweet.conversationId;
    if (tweet.replyToId) compact.rToId = tweet.replyToId;
    if (tweet.replyToUser) compact.rToU = tweet.replyToUser;

    // AI 数据 (只在非默认时存在)
    if (tweet.aiScore !== undefined && tweet.aiScore !== null) compact.aiS = tweet.aiScore;
    if (tweet.aiSummary) compact.aiSum = tweet.aiSummary;
    if (tweet.aiReason) compact.aiR = tweet.aiReason;
    if (tweet.aiTags && tweet.aiTags.length > 0) compact.aiT = tweet.aiTags;
    if (tweet.aiCategory) compact.aiC = tweet.aiCategory;
    if (tweet.aiStatus !== ProcessStatus.Pending) compact.aiSt = tweet.aiStatus;
    if (tweet.aiProcessedAt) compact.aiAt = tweet.aiProcessedAt;

    // 图像数据
    if (tweet.ocrText) compact.ocr = tweet.ocrText;
    if (tweet.visionDescription) compact.vd = tweet.visionDescription;
    if (tweet.imageProcessStatus !== ProcessStatus.Pending) compact.imgSt = tweet.imageProcessStatus;
    if (tweet.imageProcessedAt) compact.imgAt = tweet.imageProcessedAt;

    // 原始数据
    if (tweet.rawZip) compact.raw = tweet.rawZip;

    return compact;
}

/** 将完整 User 转换为紧凑格式 */
function compressUser(user: UserCache): CompactUser {
    const compact: CompactUser = {
        id: user.id,
        h: user.handle,
        n: user.name,
        av: extractAvatarFilename(user.avatar),
        upAt: user.updatedAt,
    };

    if (user.description) compact.desc = user.description;
    if (user.followersCount) compact.fc = user.followersCount;
    if (user.verified) compact.v = true;

    return compact;
}

/** 压缩完整备份为紧凑格式 */
export function compressBackup(tweets: Tweet[], users: UserCache[], settings: any, source: 'alarm' | 'manual'): CompactBackup {
    return {
        v: 2,
        ts: Date.now(),
        src: source,
        t: tweets.map(compressTweet),
        u: users.map(compressUser),
        s: settings && Object.keys(settings).length > 0 ? settings : undefined,
    };
}

// =============== 导入：解压 ===============

/** 将紧凑 Tweet 还原为完整格式 */
function decompressTweet(compact: CompactTweet, usersMap: Map<string, CompactUser>): Tweet {
    const user = usersMap.get(compact.aid);
    const author = user?.h || '';

    const tweet: Tweet = {
        id: compact.id,
        authorId: compact.aid,

        // 还原冗余作者信息 (兼容旧版)
        author: author,
        authorName: user?.n,
        authorAvatarUrl: user ? restoreAvatarUrl(user.av, user.id) : undefined,

        text: compact.text,
        tweetUrl: generateTweetUrl(author, compact.id),
        createdAt: compact.at,
        source: compact.src as CaptureSource,

        savedAt: compact.sAt,
        isBookmarked: compact.bm || false,
        isArchived: compact.arc || false,
        tags: compact.tags || [],
        note: compact.note,

        favoriteCount: compact.fav || 0,
        retweetCount: compact.rt || 0,
        replyCount: compact.re || 0,
        viewCount: compact.view || 0,

        media: compact.m ? compact.m.map(m => ({
            type: compactToMediaType(m.t),
            url: restoreMediaUrl(m.u),
            previewUrl: restoreMediaUrl(m.u),
        })) : [],

        conversationId: compact.convId,
        replyToId: compact.rToId,
        replyToUser: compact.rToU,

        aiScore: compact.aiS,
        aiSummary: compact.aiSum,
        aiReason: compact.aiR,
        aiTags: compact.aiT,
        aiCategory: compact.aiC,
        aiStatus: (compact.aiSt as ProcessStatus) || ProcessStatus.Pending,
        aiProcessedAt: compact.aiAt,

        ocrText: compact.ocr,
        visionDescription: compact.vd,
        imageProcessStatus: (compact.imgSt as ProcessStatus) || ProcessStatus.Pending,
        imageProcessedAt: compact.imgAt,

        rawZip: compact.raw,
    };

    return tweet;
}

/** 将紧凑 User 还原为完整格式 */
function decompressUser(compact: CompactUser): UserCache {
    return {
        id: compact.id,
        handle: compact.h,
        name: compact.n,
        avatar: restoreAvatarUrl(compact.av, compact.id),
        description: compact.desc,
        followersCount: compact.fc,
        verified: compact.v || false,
        updatedAt: compact.upAt,
    };
}

/** 解压紧凑备份为完整格式 */
export function decompressBackup(compact: CompactBackup): { tweets: Tweet[]; users: UserCache[]; settings: any } {
    // 先构建 users map 供 tweet 查找
    const usersMap = new Map<string, CompactUser>();
    for (const u of compact.u) {
        usersMap.set(u.id, u);
    }

    return {
        tweets: compact.t.map(t => decompressTweet(t, usersMap)),
        users: compact.u.map(decompressUser),
        settings: compact.s || {},
    };
}

// =============== 格式检测与兼容 ===============

/** 检测备份文件版本 */
export function detectBackupVersion(data: any): 1 | 2 | null {
    if (!data || typeof data !== 'object') return null;

    // v2: 使用 v 字段
    if (data.v === 2) return 2;

    // v1: 使用 version 字段
    if (data.version === 1) return 1;

    // 兼容旧格式 (无 version 字段但有 tweets 数组)
    if (Array.isArray(data.tweets)) return 1;

    return null;
}

/** 解析任意版本的备份文件 */
export function parseBackup(data: any): { tweets: Tweet[]; users: UserCache[]; settings: any } | null {
    const version = detectBackupVersion(data);

    if (version === 2) {
        return decompressBackup(data as CompactBackup);
    }

    if (version === 1) {
        // v1 格式直接使用
        const v1 = data as FullBackupV1;
        return {
            tweets: v1.tweets || [],
            users: v1.users || [],
            settings: v1.settings || {},
        };
    }

    return null;
}
