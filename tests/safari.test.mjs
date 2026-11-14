import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const exports = {};
    vm.runInNewContext(outputText, { exports, crypto: { randomUUID }, console, ...globals });
    return exports;
}

function backupHarness(storage = {}, tweets = [], users = []) {
    const table = rows => ({
        toArray: async () => rows, get: async id => rows.find(r => r.id === id),
        add: async value => { rows.push(value); },
    });
    const db = { tweets: table(tweets), users: table(users), graphEdges: {}, transaction: async (_mode, _tables, fn) => fn() };
    const modules = {
        '../storage/db': { db },
        '../../features/connections/services/graphService': { GraphService: { processTweet: async () => {} } },
        '../../shared/types/settings': { getSafeAISettings: v => v },
        idb: {},
        './compactBackup': { parseBackup: () => { throw new Error('Unexpected compact backup in this fixture'); } },
    };
    const api = load('../src/core/backup/portableBackup.ts', {
        require: name => { assert.ok(name in modules, name); return modules[name]; },
        chrome: { storage: { local: { get: async () => storage, set: async values => Object.assign(storage, values) } } },
    });
    return { ...api, storage, tweets, users };
}
const session = (id, content) => ({ id, title: '测试聊天', createdAt: 1, updatedAt: 2, messages: [{ id: 'msg', role: 'assistant', content, timestamp: 2 }], noteContent: `笔记:${content}` });

test('portable backup preserves chats, global notes and histories; keys are opt-in', async () => {
    const original = { chat_sessions: [session('s1', '完整消息')], current_session_id: 's1', note_content: '独立笔记',
        fallingPenHistory_chat_s1: [{ id: 'h', content: '旧版本', timestamp: 1 }], aiSettings: { providers: [{ apiKey: 'fake-test-key' }] }, unrelated: 'never export' };
    const h = backupHarness(original, [{ id: 't1' }], [{ id: 'u1' }]);
    const exported = await h.exportPortableBackup();
    assert.equal(exported.workspace.chat_sessions[0].messages[0].content, '完整消息');
    assert.equal(exported.workspace.fallingPenHistory_chat_s1[0].content, '旧版本');
    assert.equal(exported.workspace.note_content, '独立笔记');
    assert.equal(exported.settings, undefined);
    assert.equal(exported.workspace.unrelated, undefined);
    assert.equal((await h.exportPortableBackup(true)).settings.providers[0].apiKey, 'fake-test-key');
    h.validatePortableBackup(JSON.parse(JSON.stringify(exported)));
});

test('invalid workspace, message, history and duplicate IDs are rejected before import', async () => {
    const h = backupHarness();
    const base = { format: 'thattweet-portable', version: 1, tweets: [], users: [], workspace: {} };
    for (const workspace of [{ unknown: 'no' }, { chat_sessions: [session('s', 8)] }, { fallingPenHistory_global: [{ content: 2 }] }, { note_content: {} }]) {
        await assert.rejects(h.importPortableBackup({ ...base, workspace }));
        assert.deepEqual(h.storage, {});
    }
    assert.throws(() => h.validatePortableBackup({ ...base, tweets: [{ id: 'x' }, { id: 'x' }] }), /重复/);
});

test('conflicting session IDs, notes and history versions survive a merge', () => {
    const h = backupHarness();
    const current = { chat_sessions: [session('same', '手机消息')], note_content: '手机笔记', current_session_id: 'same', fallingPenHistory_global: [{ id: 'v1', timestamp: 1, content: '手机旧版' }] };
    const incoming = { chat_sessions: [session('same', '电脑消息')], note_content: '电脑笔记', current_session_id: 'same', fallingPenHistory_chat_same: [{ id: 'v2', timestamp: 2, content: '会话旧版' }], fallingPenHistory_global: [{ id: 'v1', timestamp: 1, content: '电脑旧版' }] };
    const merged = h.mergeWorkspace(current, incoming);
    assert.equal(merged.chat_sessions.length, 3);
    assert.equal(merged.chat_sessions[0].messages[0].content, '手机消息');
    const imported = merged.chat_sessions.find(s => s.messages[0]?.content === '电脑消息');
    assert.notEqual(imported.id, 'same');
    assert.equal(merged[`fallingPenHistory_chat_${imported.id}`][0].content, '会话旧版');
    assert.equal(merged.fallingPenHistory_global.length, 2);
    assert.notEqual(merged.fallingPenHistory_global[0].id, merged.fallingPenHistory_global[1].id);
    assert.equal(merged.note_content, undefined);
    assert.ok(merged.chat_sessions.some(s => s.noteContent === '电脑笔记'));
    assert.equal(current.chat_sessions.length, 1);
    const repeated = h.mergeWorkspace({ ...current, ...merged }, incoming);
    assert.equal(repeated.chat_sessions.length, 3);
});

test('legacy tweet backup import adds missing records without overwriting current annotations', async () => {
    const h = backupHarness({ aiSettings: { providers: [{ id: 'phone' }] } }, [{ id: 'existing', authorId: 'u', note: '保留手机笔记' }], [{ id: 'u', name: 'phone' }]);
    const result = await h.importPortableBackup({ version: 1, tweets: [{ id: 'existing', authorId: 'u', note: '旧内容' }, { id: 'new', authorId: 'u' }], users: [{ id: 'u', name: 'old' }], settings: { providers: [{ id: 'old' }] } });
    assert.equal(result.tweetsAdded, 1);
    assert.equal(h.tweets[0].note, '保留手机笔记');
    assert.equal(h.users[0].name, 'phone');
    assert.equal(h.storage.aiSettings.providers[0].id, 'phone');
});

test('suspended processing tasks retain content and are not automatically rebilled', async () => {
    const now = 2_000_000;
    const tweets = [{ id: 'old', aiStatus: 'processing', aiProcessingStartedAt: now - 700_000, aiSummary: '已有摘要' }, { id: 'active', aiStatus: 'processing', aiProcessingStartedAt: now - 1000 }, { id: 'completed', aiStatus: 'completed' }];
    const db = { transaction: async (_mode, _table, fn) => fn(), tweets: {
        where: key => ({ equals: value => ({ toArray: async () => tweets.filter(t => t[key] === value) }) }),
        update: async (id, values) => Object.assign(tweets.find(t => t.id === id), values),
    } };
    const { recoverInterruptedTasks } = load('../src/core/ai/interruptedTasks.ts', { require: name => name.endsWith('/db') ? { db } : { ProcessStatus: { Processing: 'processing', Failed: 'failed' } } });
    assert.equal(await recoverInterruptedTasks(now), 1);
    assert.equal(tweets[0].aiStatus, 'failed');
    assert.equal(tweets[0].aiSummary, '已有摘要');
    assert.equal(tweets[1].aiStatus, 'processing');
    assert.equal(tweets[2].aiStatus, 'completed');
});

test('Safari asks for only the chosen HTTPS API origin and reports permission refusal', async () => {
    const requests = [];
    const api = load('../src/shared/utils/platform.ts', { __SAFARI_IOS__: true, URL, chrome: { permissions: { request: async value => { requests.push(value); return false; } } } });
    await assert.rejects(api.requestAIHostPermission('http://insecure.invalid'), /HTTPS/);
    assert.equal(requests.length, 0);
    await assert.rejects(api.requestAIHostPermission('https://custom.invalid/v1'), /允许/);
    assert.equal(requests[0].origins[0], 'https://custom.invalid/*');
});
