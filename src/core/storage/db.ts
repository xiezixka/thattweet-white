import Dexie, { type Table } from 'dexie';
import { Tweet, UserCache } from '../../shared/types/tweet';

/**
 * 向量嵌入存储记录
 * 使用 uint8 量化压缩存储，节省约 75% 空间
 */
export interface EmbeddingRecord {
    tweetId: string;           // 主键，关联 tweets 表
    vector: Uint8Array;        // 量化后的向量 (uint8)
    vectorMin: number;         // 反量化参数: 最小值
    vectorMax: number;         // 反量化参数: 最大值
    textHash: string;          // 原文哈希，用于检测是否需要更新
    modelId: string;           // 生成该向量的模型 ID
    createdAt: number;         // 创建时间戳
    updatedAt: number;         // 更新时间戳
}

export class ThatTweetDB extends Dexie {
    tweets!: Table<Tweet>;
    users!: Table<UserCache>;
    embeddings!: Table<EmbeddingRecord>;

    graphEdges!: Table<GraphEdge>;
    tagMappings!: Table<TagMapping>;

    constructor() {
        super('ThatTweetDB');

        // Version 1: 基础表
        this.version(1).stores({
            tweets: 'id, authorId, savedAt, aiStatus, imageProcessStatus, isBookmarked, *tags',
            users: 'id, handle, name'
        });

        // Version 2: 添加向量嵌入表
        this.version(2).stores({
            tweets: 'id, authorId, savedAt, aiStatus, imageProcessStatus, isBookmarked, *tags',
            users: 'id, handle, name',
            embeddings: 'tweetId, modelId, updatedAt'
        });

        // Version 4: 添加 aiScore 索引用于爆火预测
        this.version(4).stores({
            tweets: 'id, authorId, savedAt, aiStatus, aiScore, imageProcessStatus, isBookmarked, *tags',
            users: 'id, handle, name',
            embeddings: 'tweetId, modelId, updatedAt',
            graphEdges: '++id, source, target, type, [source+target+type], createdAt',
            tagMappings: 'originalTag, updatedAt'
        });
    }
}

export interface GraphEdge {
    id?: number;
    source: string;       // 起点ID (tweetId, userId, tag)
    target: string;       // 终点ID
    type: 'reply' | 'quote' | 'retweet' | 'author' | 'tag' | 'mention' | 'similarity' | 'social';
    weight: number;       // 边的权重/引力
    createdAt: number;    // 创建时间，用于计算时间衰减
}

export interface TagMapping {
    originalTag: string;  // 原始标签 (主键)
    mappedTag: string;    // 归一化后的标准标签
    confidence: number;   // AI 置信度
    updatedAt: number;
}

export const db = new ThatTweetDB();
