/**
 * Embedding Sync Manager - 后台向量同步管理器
 * 
 * 功能：
 * - 监听新推文添加事件
 * - 定时批量同步缺失的 embeddings
 * - 提供手动触发同步的接口
 */

import { db } from '../../../core/storage/db';
import { embeddingService, SyncProgress } from './embeddingService';
import { AISettings, getSafeAISettings } from '../../../shared/types/settings';

// 同步状态存储 key
const SYNC_STATE_KEY = 'embedding_sync_state';

interface SyncState {
    lastSyncAt: number;
    isRunning: boolean;
    lastResult?: {
        success: number;
        failed: number;
        timestamp: number;
    };
}

async function getSettings(): Promise<AISettings> {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(['aiSettings'], (res) => {
                resolve(getSafeAISettings(res.aiSettings));
            });
        } else {
            resolve({} as AISettings);
        }
    });
}

async function getSyncState(): Promise<SyncState> {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get([SYNC_STATE_KEY], (res) => {
                resolve(res[SYNC_STATE_KEY] || { lastSyncAt: 0, isRunning: false });
            });
        } else {
            resolve({ lastSyncAt: 0, isRunning: false });
        }
    });
}

async function setSyncState(state: Partial<SyncState>): Promise<void> {
    const current = await getSyncState();
    const newState = { ...current, ...state };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [SYNC_STATE_KEY]: newState });
    }
}

// 全局进度回调
let globalProgressCallback: ((progress: SyncProgress) => void) | null = null;

export const embeddingSyncManager = {
    /**
     * 注册进度回调
     */
    onProgress(callback: (progress: SyncProgress) => void): void {
        globalProgressCallback = callback;
    },

    /**
     * 取消进度回调
     */
    offProgress(): void {
        globalProgressCallback = null;
    },

    /**
     * 获取同步状态
     */
    async getState(): Promise<SyncState> {
        return getSyncState();
    },

    /**
     * 手动触发完整同步
     */
    async syncNow(): Promise<{ success: number; failed: number }> {
        const settings = await getSettings();

        if (!settings.ragEnabled) {
            console.log('[EmbeddingSyncManager] RAG is disabled, skipping sync');
            return { success: 0, failed: 0 };
        }

        const state = await getSyncState();
        if (state.isRunning) {
            console.log('[EmbeddingSyncManager] Sync already running, skipping');
            return { success: 0, failed: 0 };
        }

        await setSyncState({ isRunning: true });

        try {
            const result = await embeddingService.syncAll((progress) => {
                globalProgressCallback?.(progress);
            });

            await setSyncState({
                isRunning: false,
                lastSyncAt: Date.now(),
                lastResult: {
                    success: result.success,
                    failed: result.failed,
                    timestamp: Date.now()
                }
            });

            return result;
        } catch (error) {
            console.error('[EmbeddingSyncManager] Sync failed:', error);
            await setSyncState({ isRunning: false });
            throw error;
        }
    },

    /**
     * 增量同步 (只处理最近添加的推文)
     * 适合在新推文保存后调用
     */
    async syncRecent(limit: number = 20): Promise<{ success: number; failed: number }> {
        const settings = await getSettings();

        if (!settings.ragEnabled) {
            return { success: 0, failed: 0 };
        }

        const state = await getSyncState();
        if (state.isRunning) {
            return { success: 0, failed: 0 };
        }

        await setSyncState({ isRunning: true });

        try {
            const modelId = settings.embeddingModel || 'BAAI/bge-m3';
            const tweets = await embeddingService.getTweetsNeedingEmbedding(modelId, limit);

            if (tweets.length === 0) {
                await setSyncState({ isRunning: false });
                return { success: 0, failed: 0 };
            }

            const results = await embeddingService.generateEmbeddings(tweets);
            const savedCount = await embeddingService.saveEmbeddings(results, modelId);
            const failedCount = results.filter(r => !r.success).length;

            await setSyncState({
                isRunning: false,
                lastSyncAt: Date.now()
            });

            return { success: savedCount, failed: failedCount };
        } catch (error) {
            console.error('[EmbeddingSyncManager] Recent sync failed:', error);
            await setSyncState({ isRunning: false });
            return { success: 0, failed: 0 };
        }
    },

    /**
     * 定时自动同步 (每 5 分钟检查一次)
     * 在 Service Worker 或后台脚本中调用
     */
    startAutoSync(intervalMs: number = 5 * 60 * 1000): void {
        console.log('[EmbeddingSyncManager] Starting auto sync with interval:', intervalMs);

        const runSync = async () => {
            try {
                const settings = await getSettings();
                if (!settings.ragEnabled) {
                    return;
                }

                const state = await getSyncState();

                // 如果距离上次同步不足 2 分钟，跳过
                if (Date.now() - state.lastSyncAt < 2 * 60 * 1000) {
                    return;
                }

                await this.syncRecent(50);
            } catch (error) {
                console.error('[EmbeddingSyncManager] Auto sync error:', error);
            }
        };

        // 立即执行一次
        runSync();

        // 设置定时器
        setInterval(runSync, intervalMs);
    },

    /**
     * 监听推文变化 (使用 Dexie hooks)
     */
    setupTweetListener(): void {
        // 使用 liveQuery 效果不好，改用防抖批量处理
        let pendingTweetIds: string[] = [];
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const processPending = async () => {
            if (pendingTweetIds.length === 0) return;

            const ids = [...pendingTweetIds];
            pendingTweetIds = [];

            console.log(`[EmbeddingSyncManager] Processing ${ids.length} new tweets`);

            try {
                await this.syncRecent(ids.length + 10);
            } catch (error) {
                console.error('[EmbeddingSyncManager] Failed to process new tweets:', error);
            }
        };

        // Note: 这个函数需要在推文保存逻辑中手动调用
        // 因为 Dexie hooks 在 Service Worker 中不总是可靠
        (this as any).notifyTweetSaved = (tweetId: string) => {
            pendingTweetIds.push(tweetId);

            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(processPending, 5000); // 5 秒后批量处理
        };
    },

    /**
     * 获取统计信息
     */
    async getStats(): Promise<{
        totalEmbeddings: number;
        totalTweets: number;
        coveragePercent: number;
        modelId: string;
        syncState: SyncState;
    }> {
        const [embedStats, syncState] = await Promise.all([
            embeddingService.getStats(),
            this.getState()
        ]);

        return {
            ...embedStats,
            syncState
        };
    },

    /**
     * 清空所有 embeddings
     */
    async clearAll(): Promise<void> {
        await embeddingService.clearAll();
        await setSyncState({
            lastSyncAt: 0,
            isRunning: false,
            lastResult: undefined
        });
    }
};
