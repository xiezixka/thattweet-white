import { openDB } from 'idb';
import { db } from '../storage/db';
import { GraphService } from '../../features/connections/services/graphService';
import type { ChatSession } from '../../features/intelligence/store/useChatStore';
import { getSafeAISettings } from '../../shared/types/settings';
import { parseBackup } from './compactBackup';

const workspaceKey = (key: string) => ['chat_sessions', 'current_session_id', 'note_content', 'note_dual_pane', 'note_width'].includes(key) || key.startsWith('fallingPenHistory_');

export async function exportPortableBackup(includeSettings = false) {
    const [tweets, users, storage] = await Promise.all([
        db.tweets.toArray(), db.users.toArray(), chrome.storage.local.get(null),
    ]);
    return {
        format: 'thattweet-portable', version: 1, exportedAt: Date.now(), tweets, users,
        workspace: Object.fromEntries(Object.entries(storage).filter(([key]) => workspaceKey(key))),
        ...(includeSettings ? { settings: storage.aiSettings } : {}),
    };
}

// Validate the entire workspace before any writes; unsupported keys never reach storage.
export function validatePortableBackup(data: any) {
    if (!data || !Array.isArray(data.tweets) || !Array.isArray(data.users)) throw new Error('备份缺少推文或作者列表。');
    for (const [rows, name] of [[data.tweets, '推文'], [data.users, '作者']] as const) {
        const ids = new Set<string>();
        for (const row of rows) {
            if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error(`${name} ID 缺失或重复。`);
            ids.add(row.id);
        }
    }
    if (data.workspace !== undefined && (data.format !== 'thattweet-portable' || data.version !== 1 || !data.workspace || Array.isArray(data.workspace) || typeof data.workspace !== 'object')) throw new Error('不支持的聊天和笔记备份格式。');
    const workspace: Record<string, any> = {};
    for (const [key, value] of Object.entries(data.workspace || {})) {
        if (!workspaceKey(key)) throw new Error('备份含有不支持的存储字段。');
        if (key === 'chat_sessions') {
            if (!Array.isArray(value)) throw new Error('聊天列表格式无效。');
            const ids = new Set<string>();
            for (const session of value) {
                if (!session || typeof session.id !== 'string' || !session.id || ids.has(session.id) || typeof session.title !== 'string' ||
                    !Number.isFinite(session.createdAt) || !Number.isFinite(session.updatedAt) || !Array.isArray(session.messages) ||
                    (session.noteContent !== undefined && typeof session.noteContent !== 'string')) throw new Error('聊天会话格式无效。');
                ids.add(session.id);
                for (const msg of session.messages) {
                    if (!msg || typeof msg.id !== 'string' || !['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string' || !Number.isFinite(msg.timestamp)) throw new Error('聊天消息格式无效。');
                }
            }
        } else if (key.startsWith('fallingPenHistory_')) {
            if (!Array.isArray(value) || value.some(v => !v || typeof v.id !== 'string' || typeof v.content !== 'string' || !Number.isFinite(v.timestamp))) throw new Error('笔记历史格式无效。');
        } else if (key === 'note_content' && typeof value !== 'string') throw new Error('笔记内容格式无效。');
        else if (key === 'note_dual_pane' && typeof value !== 'boolean') throw new Error('笔记布局格式无效。');
        else if (key === 'note_width' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('笔记宽度格式无效。');
        else if (key === 'current_session_id' && value !== null && typeof value !== 'string') throw new Error('当前会话格式无效。');
        workspace[key] = value;
    }
    return { ...data, workspace };
}

export function mergeWorkspace(current: Record<string, any>, incoming: Record<string, any>) {
    const sessions: ChatSession[] = [...(current.chat_sessions || [])];
    const mapping = new Map<string, string>();
    for (const imported of incoming.chat_sessions || []) {
        const { id: _id, ...content } = imported;
        const identical = sessions.find(({ id: _existingId, ...existing }) => JSON.stringify(existing) === JSON.stringify(content));
        if (identical) { mapping.set(imported.id, identical.id); continue; }
        const previous = sessions.find(s => s.id === imported.id);
        if (previous && JSON.stringify(previous) === JSON.stringify(imported)) { mapping.set(imported.id, imported.id); continue; }
        const id = previous ? crypto.randomUUID() : imported.id;
        mapping.set(imported.id, id);
        sessions.push({ ...imported, id });
    }
    const result: Record<string, any> = { chat_sessions: sessions };
    for (const [key, values] of Object.entries(incoming)) {
        if (key.startsWith('fallingPenHistory_')) {
            const sessionId = key.slice('fallingPenHistory_chat_'.length);
            const target = key.startsWith('fallingPenHistory_chat_') && mapping.has(sessionId)
                ? `fallingPenHistory_chat_${mapping.get(sessionId)}` : key;
            const merged = [...(current[target] || [])];
            for (const item of values as any[]) {
                if (!merged.some(v => v.timestamp === item.timestamp && v.content === item.content)) merged.push({ ...item, id: merged.some(v => v.id === item.id) ? crypto.randomUUID() : item.id });
            }
            result[target] = merged;
        }
    }
    if (incoming.note_content && current.note_content && incoming.note_content !== current.note_content && !sessions.some(s => s.messages.length === 0 && s.noteContent === incoming.note_content)) {
        sessions.push({ id: crypto.randomUUID(), title: '导入的独立笔记', createdAt: Date.now(), updatedAt: Date.now(), messages: [], noteContent: incoming.note_content });
    } else if (!current.note_content && incoming.note_content !== undefined) result.note_content = incoming.note_content;
    for (const key of ['note_dual_pane', 'note_width']) if (current[key] === undefined && incoming[key] !== undefined) result[key] = incoming[key];
    if (!current.current_session_id) result.current_session_id = mapping.get(incoming.current_session_id) || sessions[0]?.id || null;
    return result;
}

export async function importPortableBackup(raw: unknown) {
    const legacy = raw as { v?: number } | null;
    const data = validatePortableBackup(legacy?.v === 2 ? { ...parseBackup(raw), version: 1 } : raw);
    const current = await chrome.storage.local.get<Record<string, any>>(null);
    const merged = mergeWorkspace(current, data.workspace);
    let tweetsAdded = 0;
    // Add missing IDs only: current bookmarks, annotations and analysis are never overwritten.
    await db.transaction('rw', [db.users, db.tweets, db.graphEdges], async () => {
        for (const user of data.users) if (!await db.users.get(user.id)) await db.users.add(user);
        for (const tweet of data.tweets) {
            if (typeof tweet.authorId !== 'string' || !await db.users.get(tweet.authorId)) throw new Error('备份中有推文缺少作者，已撤销本次推文导入。');
            if (!await db.tweets.get(tweet.id)) {
                await db.tweets.add(tweet);
                await GraphService.processTweet(tweet);
                tweetsAdded++;
            }
        }
    });
    // Cross-store operations cannot be one transaction. If storage fails, existing
    // content remains intact and a retry adds only missing IDs.
    if (data.settings && !current.aiSettings?.providers?.length) merged.aiSettings = getSafeAISettings(data.settings);
    await chrome.storage.local.set(merged);
    return { tweetsAdded, sessions: merged.chat_sessions.length };
}

export async function saveLocalCheckpoint() {
    const backup = await exportPortableBackup(false);
    const store = await openDB('ThatTweetSafariCheckpoint', 1, { upgrade(database) { database.createObjectStore('backups'); } });
    try { await store.put('backups', backup, 'latest'); } finally { store.close(); }
    return backup.exportedAt;
}

export async function readLocalCheckpoint() {
    const store = await openDB('ThatTweetSafariCheckpoint', 1, { upgrade(database) { database.createObjectStore('backups'); } });
    try { return await store.get('backups', 'latest'); } finally { store.close(); }
}
