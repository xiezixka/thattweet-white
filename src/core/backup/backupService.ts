/**
 * [ThatTweet] Backup Service
 * Handles automated and manual backup to user-selected directory
 */

import { db } from '../storage/db';
import { openDB, IDBPDatabase } from 'idb';

// Type augmentation for File System Access API (not fully in standard TS defs)
declare global {
    interface FileSystemDirectoryHandle {
        queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
        requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    }
}

// ============ Constants ============
const BACKUP_DB_NAME = 'ThatTweetBackupDB';
const BACKUP_DB_VERSION = 1;
const BACKUP_STORE_NAME = 'backup_meta';
const BACKUP_FILENAME = 'ThatTweet-backup.json';
const BACKUP_VERSION = 1;

// ============ Types ============
export interface BackupResult {
    ok: boolean;
    usedHandle: boolean;
    reason?: 'no-change' | 'no-handle' | 'no-permission' | 'write-error';
    timestamp?: number;
}

export interface FullBackup {
    version: number;
    exportDate: number;
    exportedAt: string;
    source: 'alarm' | 'manual';
    tweets: any[];
    users: any[];
    settings: any;
    tweetCount: number;
}

// ============ IndexedDB for Handle Storage ============
let backupDb: IDBPDatabase | null = null;

async function getBackupDb() {
    if (!backupDb) {
        backupDb = await openDB(BACKUP_DB_NAME, BACKUP_DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
                    db.createObjectStore(BACKUP_STORE_NAME);
                }
            },
        });
    }
    return backupDb;
}

/**
 * Store the directory handle in IndexedDB
 */
export async function setStoredBackupHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await getBackupDb();
    await db.put(BACKUP_STORE_NAME, handle, 'directoryHandle');
}

/**
 * Retrieve the stored directory handle from IndexedDB
 */
export async function getStoredBackupHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
        const db = await getBackupDb();
        const handle = await db.get(BACKUP_STORE_NAME, 'directoryHandle');
        return handle || null;
    } catch {
        return null;
    }
}

/**
 * Store the last backup hash
 */
export async function setStoredBackupHash(hash: string): Promise<void> {
    const db = await getBackupDb();
    await db.put(BACKUP_STORE_NAME, hash, 'lastBackupHash');
}

/**
 * Retrieve the last backup hash
 */
export async function getStoredBackupHash(): Promise<string | null> {
    try {
        const db = await getBackupDb();
        const hash = await db.get(BACKUP_STORE_NAME, 'lastBackupHash');
        return hash || null;
    } catch {
        return null;
    }
}

// ============ Hash Computation ============
async function computeHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============ Permission Handling ============
async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        // Check if we already have permission
        const permissionStatus = await handle.queryPermission({ mode: 'readwrite' });
        if (permissionStatus === 'granted') return true;

        // Request permission if needed
        const requestResult = await handle.requestPermission({ mode: 'readwrite' });
        return requestResult === 'granted';
    } catch {
        return false;
    }
}

// ============ Full Backup Export ============
/**
 * Export all data from IndexedDB to a structured backup object
 */
export async function exportFullBackup(source: 'alarm' | 'manual'): Promise<FullBackup> {
    // Fetch all tweets
    const tweets = await db.tweets.toArray();
    const users = await db.users.toArray();

    // Fetch settings from chrome.storage.local
    const storageData = await new Promise<Record<string, any>>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(null, (data) => resolve(data));
        } else {
            resolve({});
        }
    });

    return {
        version: BACKUP_VERSION,
        exportDate: Date.now(),
        exportedAt: new Date().toISOString(),
        source,
        tweets,
        users,
        settings: storageData.aiSettings || {},
        tweetCount: tweets.length,
    };
}

// ============ Trigger Backup ============
/**
 * Main backup function - exports data and writes to file
 */
export async function triggerFullBackup(source: 'alarm' | 'manual'): Promise<BackupResult> {
    try {
        // 1. Export all data
        const backup = await exportFullBackup(source);
        const json = JSON.stringify(backup, null, 2);

        // 2. Compute hash for deduplication
        const hash = await computeHash(json);
        const previousHash = await getStoredBackupHash();

        // 3. Skip if no changes
        if (previousHash === hash) {
            console.log('[ThatTweet Backup] No changes detected, skipping backup');
            return { ok: false, usedHandle: true, reason: 'no-change' };
        }

        // 4. Get stored directory handle
        const handle = await getStoredBackupHandle();
        if (!handle) {
            console.warn('[ThatTweet Backup] No backup directory selected');
            return { ok: false, usedHandle: false, reason: 'no-handle' };
        }

        // 5. Ensure write permission
        const hasPermission = await ensureWritePermission(handle);
        if (!hasPermission) {
            console.warn('[ThatTweet Backup] Write permission denied');
            return { ok: false, usedHandle: true, reason: 'no-permission' };
        }

        // 6. Write to file
        try {
            const fileHandle = await handle.getFileHandle(BACKUP_FILENAME, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();

            // 7. Store the new hash
            await setStoredBackupHash(hash);

            console.log(`[ThatTweet Backup] Successfully backed up ${backup.tweetCount} tweets`);
            return { ok: true, usedHandle: true, timestamp: Date.now() };
        } catch (writeError) {
            console.error('[ThatTweet Backup] Write error:', writeError);
            return { ok: false, usedHandle: true, reason: 'write-error' };
        }
    } catch (error) {
        console.error('[ThatTweet Backup] Backup failed:', error);
        return { ok: false, usedHandle: false, reason: 'write-error' };
    }
}

/**
 * Select backup directory using File System Access API
 * This must be called from a user gesture (click handler)
 */
export async function selectBackupDirectory(): Promise<{ success: boolean; name?: string }> {
    try {
        // @ts-ignore - showDirectoryPicker may not be in all TypeScript definitions
        const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await setStoredBackupHandle(handle);
        return { success: true, name: handle.name };
    } catch (error) {
        // User cancelled or API not supported
        console.warn('[ThatTweet Backup] Directory selection cancelled or failed:', error);
        return { success: false };
    }
}

/**
 * Check if a backup directory is configured
 */
export async function hasBackupDirectory(): Promise<{ configured: boolean; name?: string }> {
    try {
        const handle = await getStoredBackupHandle();
        if (handle) {
            return { configured: true, name: handle.name };
        }
        return { configured: false };
    } catch {
        return { configured: false };
    }
}
