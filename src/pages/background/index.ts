import { TweetRepository } from '../../core/storage/TweetRepository';
import { Tweet, UserCache } from '../../shared/types/tweet';
import { AIJobQueue } from '../../core/ai/AIJobQueue';
import { triggerFullBackup, hasBackupDirectory } from '../../core/backup/backupService';

/**
 * [ThatTweet] Background Service Worker
 */
console.log('%c[ThatTweet] Background Script Active v1.0.2', 'color: #1d9bf0; font-weight: bold');

// ============ Backup Alarm Setup ============
const BACKUP_ALARM_NAME = "thattweet-full-backup";
const BACKUP_INTERVAL_MINUTES = 10;

// Create alarm on install/startup
chrome.runtime.onInstalled.addListener(() => {
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
    // Handle tweet batch save
    if (message.type === 'SAVE_TWEETS_BATCH') {
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
});

// ============ AI Job Queue Timer ============
// 自动化定时：每隔 10 秒检查一次 AI 队列（测试阶段设短一点）
setInterval(() => {
    AIJobQueue.processNextBatch().catch(console.error);
}, 10 * 1000);

async function handleBatchSave(tweets: Tweet[], users: UserCache[]) {
    try {
        console.log(`[ThatTweet] Incoming batch: ${tweets.length} items`);
        const userMap = new Map(users.map(u => [u.id, u]));

        for (const tweet of tweets) {
            let author = userMap.get(tweet.authorId);

            // 🔧 关键修复：DOM 抓取模式下 users 为空，需要从推文嵌入字段构造用户
            if (!author && (tweet.author || tweet.authorName)) {
                author = {
                    id: tweet.authorId,
                    handle: tweet.author || tweet.authorId,
                    name: tweet.authorName || tweet.author || 'Unknown',
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
        // 存完后立刻触发 AI
        AIJobQueue.processNextBatch().catch(console.error);
    } catch (error) {
        console.error('[ThatTweet] Batch save failed:', error);
        throw error; // Re-throw to be caught by the listener
    }
}

// 终极导出方案：同时挂载到 self 和 globalThis
(self as any).AIJobQueue = AIJobQueue;
(globalThis as any).AIJobQueue = AIJobQueue;

console.log('[ThatTweet] AIJobQueue exported to console.');

