import { TweetRepository } from '../../core/storage/TweetRepository';
import { Tweet, UserCache } from '../../shared/types/tweet';
import { AIJobQueue } from '../../core/ai/AIJobQueue';
import { VisionService } from '../../core/vision/visionService';
import { triggerFullBackup, hasBackupDirectory } from '../../core/backup/backupService';

/**
 * [ThatTweet] Background Service Worker
 */
console.log(`[ThatTweet] Background Script Active v${chrome.runtime.getManifest().version}`);

// ============ Backup Alarm Setup ============
const BACKUP_ALARM_NAME = "thattweet-full-backup";
const BACKUP_INTERVAL_MINUTES = 10;
const QUEUE_ALARM_NAME = 'thattweet-process-queues';

function processQueues() {
    AIJobQueue.processNextBatch().catch(console.error);
    VisionService.processQueue().catch(console.error);
}

function ensureQueueAlarm() {
    chrome.alarms.get(QUEUE_ALARM_NAME, alarm => {
        if (!alarm) {
            chrome.alarms.create(QUEUE_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 1 });
        }
    });
}

// A timer alone cannot wake a suspended Manifest V3 service worker.
ensureQueueAlarm();
chrome.runtime.onStartup.addListener(ensureQueueAlarm);

// Create alarm on install/startup
chrome.runtime.onInstalled.addListener(() => {
    ensureQueueAlarm();
    chrome.alarms.create(BACKUP_ALARM_NAME, {
        delayInMinutes: BACKUP_INTERVAL_MINUTES,
        periodInMinutes: BACKUP_INTERVAL_MINUTES
    });
    console.log(`[ThatTweet] Backup alarm created: every ${BACKUP_INTERVAL_MINUTES} minutes`);
});

// Also ensure alarm exists on startup
chrome.alarms.get(BACKUP_ALARM_NAME, (alarm) => {
    if (!alarm) {
        chrome.alarms.create(BACKUP_ALARM_NAME, {
            delayInMinutes: BACKUP_INTERVAL_MINUTES,
            periodInMinutes: BACKUP_INTERVAL_MINUTES
        });
        console.log(`[ThatTweet] Backup alarm created on startup`);
    }
});

// Handle backup alarm
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === QUEUE_ALARM_NAME) {
        processQueues();
        return;
    }
    if (alarm.name === BACKUP_ALARM_NAME) {
        console.log('[ThatTweet] Backup alarm triggered');
        triggerFullBackup('alarm').then(result => {
            if (result.ok) {
                console.log('[ThatTweet] Scheduled backup completed successfully');
            } else {
                console.log(`[ThatTweet] Scheduled backup skipped: ${result.reason}`);
            }
        }).catch(err => {
            console.error('[ThatTweet] Scheduled backup failed:', err);
        });
    }
});

// ============ Message Listeners ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    // Handle tweet batch save
    if (message.type === 'SAVE_TWEETS_BATCH') {
        if (!Array.isArray(message.payload?.tweets) || !Array.isArray(message.payload?.users)) {
            sendResponse({ success: false, error: 'Invalid tweet batch payload' });
            return false;
        }
        const { tweets, users } = message.payload;
        handleBatchSave(tweets, users).then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            console.error(err);
            sendResponse({ success: false, error: err.message });
        });
        return true; // Keep channel open for async response
    }

    // Handle manual backup trigger from settings page
    if (message.type === 'thattweet-backup-now') {
        console.log('[ThatTweet] Manual backup triggered');
        triggerFullBackup('manual').then(result => {
            sendResponse(result);
        }).catch(err => {
            console.error('[ThatTweet] Manual backup failed:', err);
            sendResponse({ ok: false, usedHandle: false, reason: 'write-error' });
        });
        return true; // Keep channel open for async response
    }

    // Check if backup directory is configured
    if (message.type === 'thattweet-backup-status') {
        hasBackupDirectory().then(status => {
            sendResponse(status);
        }).catch(() => {
            sendResponse({ configured: false });
        });
        return true;
    }

    // Handle manual re-analyze trigger
    if (message.type === 'REANALYZE_TWEET') {
        if (typeof message.payload?.tweetId !== 'string' || !message.payload.tweetId.trim()) {
            sendResponse({ success: false, error: 'Invalid tweet ID' });
            return false;
        }
        const { tweetId } = message.payload;
        handleReanalyze(tweetId).then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            console.error(err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
});

// ============ AI Job Queue Timer ============
// 自动化定时：检查 AI 队列与图片队列
setInterval(processQueues, 10 * 1000);

async function handleBatchSave(tweets: Tweet[], users: UserCache[]) {
    try {
        console.log(`[ThatTweet] Incoming batch: ${tweets.length} items`);
        const userMap = new Map(users.map(u => [u.id, u]));

        for (const tweet of tweets) {
            let author = userMap.get(tweet.authorId);

            // 🔧 关键修复：DOM 抓取模式下 users 为空，需要从推文嵌入字段构造用户
            if (!author && (tweet.author || tweet.authorName)) {
                const authorHandle = typeof tweet.author === 'string' ? tweet.author : (tweet.author?.handle || tweet.authorId);
                const authorName = tweet.authorName || (typeof tweet.author === 'object' ? tweet.author?.name : tweet.author) || 'Unknown';

                author = {
                    id: tweet.authorId,
                    handle: authorHandle,
                    name: authorName,
                    avatar: tweet.authorAvatarUrl || '',
                    updatedAt: Date.now(),
                    followersCount: 0,
                    verified: false
                };
            }

            if (author) {
                await TweetRepository.saveTweet(tweet, author);
            }
        }
        // 存完后立刻触发 AI 和图片处理 (自动批处理流程)
        AIJobQueue.processNextBatch().catch(console.error);
        VisionService.processQueue().catch(console.error);
    } catch (error) {
        console.error('[ThatTweet] Batch save failed:', error);
        throw error; // Re-throw to be caught by the listener
    }
}

async function handleReanalyze(tweetId: string) {
    console.log(`[ThatTweet] Forcing re-analysis for tweet: ${tweetId}`);
    try {
        // 1. 先进行视觉分析 (如果推文有图，强制立即处理)
        await VisionService.forceProcessTweet(tweetId);

        // 2. 然后进行 AI 总结分析 (强制立即处理)
        await AIJobQueue.forceProcessTweet(tweetId);
    } catch (err) {
        console.error(`[ThatTweet] Force re-analysis failed:`, err);
        throw err;
    }
}

// 终极导出方案：同时挂载到 self 和 globalThis
(self as any).AIJobQueue = AIJobQueue;
(globalThis as any).AIJobQueue = AIJobQueue;

console.log('[ThatTweet] AIJobQueue exported to console.');

