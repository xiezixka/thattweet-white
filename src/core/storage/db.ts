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
    }
}

export const db = new ThatTweetDB();
