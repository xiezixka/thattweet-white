import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

function loadTypeScript(path, globals = {}) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        fileName: path,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    });
    const exports = {};
    vm.runInNewContext(outputText, { exports, console, ...globals }, { filename: path });
    return exports;
}

const { DEFAULT_AI_SETTINGS, getSafeAISettings } = loadTypeScript('../src/shared/types/settings.ts');

test('updated Markdown and math dependencies still render formulas', () => {
    const html = renderToStaticMarkup(createElement(ReactMarkdown, {
        remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex], children: '$x^2 + y^2 = z^2$'
    }));
    assert.match(html, /class="katex"/);
    assert.match(html, /<math/);
    assert.doesNotMatch(html, /<script/);
});

test('capture starts before body exists and mounts without replacing the original extension', () => {
    const original = { id: '__root' };
    const nodes = new Map([['__root', original]]);
    const events = {};
    const rendered = [];
    const document = {
        body: null,
        head: { appendChild(node) { nodes.set(node.id, node); } },
        getElementById: id => nodes.get(id),
        createElement: () => ({}),
        addEventListener: (name, callback) => { events[name] = callback; }
    };
    const runtime = { id: 'white-copy', getURL: path => `chrome-extension://white-copy/${path}` };
    const dependencies = {
        'react-dom/client': { createRoot: node => ({ render: value => rendered.push({ node, value }) }) },
        'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
        '../../core/extractor/observer': { DomObserver: class {} },
        './style.css': {}
    };
    loadTypeScript('../src/pages/content/index.tsx', {
        document, chrome: { runtime }, window: { addEventListener() {}, location: { pathname: '/home' } },
        require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }
    });
    assert.equal(rendered.length, 0);
    document.body = { appendChild(node) { nodes.set(node.id, node); } };
    events.DOMContentLoaded();
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].node.id, 'thattweet-capture-white-copy');
    assert.equal(nodes.get('__root'), original);
    events.DOMContentLoaded();
    assert.equal(rendered.length, 1);
});

test('legacy settings receive a white theme and complete workflow defaults', () => {
    const settings = getSafeAISettings({ themeFont: 'Inter', workflowNodes: { perception: { enabled: false } } });
    assert.equal(settings.themeMode, 'light');
    assert.equal(settings.themeFont, 'Inter');
    assert.equal(settings.workflowNodes.perception.enabled, false);
    assert.equal(settings.workflowNodes.perception.providerId, DEFAULT_AI_SETTINGS.workflowNodes.perception.providerId);
    assert.deepEqual(settings.workflowNodes.chat, DEFAULT_AI_SETTINGS.workflowNodes.chat);
    assert.notEqual(settings.workflowNodes.chat, DEFAULT_AI_SETTINGS.workflowNodes.chat);
});

test('malformed appearance and provider settings fall back without mutating defaults', () => {
    assert.equal(getSafeAISettings(null).themeMode, 'light');
    assert.equal(getSafeAISettings('invalid').themeMode, 'light');
    const settings = getSafeAISettings({ themeMode: 'invalid', providers: null });
    assert.equal(settings.themeMode, 'light');
    assert.equal(settings.providers.length, 0);
    assert.equal(getSafeAISettings({ themeMode: 'dark' }).themeMode, 'dark');
    settings.workflowNodes.chat.enabled = !DEFAULT_AI_SETTINGS.workflowNodes.chat.enabled;
    assert.notEqual(settings.workflowNodes.chat.enabled, DEFAULT_AI_SETTINGS.workflowNodes.chat.enabled);
});

function backgroundHarness(alarms = new Map()) {
    const listeners = {};
    const counts = { ai: 0, vision: 0, backup: 0, saved: 0 };
    const event = name => ({ addListener: fn => { listeners[name] = fn; } });
    const services = {
        AIJobQueue: { processNextBatch: async () => { counts.ai++; }, forceProcessTweet: async () => {} },
        VisionService: { processQueue: async () => { counts.vision++; }, forceProcessTweet: async () => {} },
        TweetRepository: { saveTweet: async () => { counts.saved++; } },
        triggerFullBackup: async () => { counts.backup++; return { ok: true }; },
        hasBackupDirectory: async () => ({ configured: false })
    };
    const chrome = {
        runtime: { getManifest: () => ({ version: '4.5.5' }), onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message') },
        alarms: { get: (name, cb) => cb(alarms.get(name)), create: (name, info) => { alarms.set(name, { name, ...info }); }, onAlarm: event('alarm') }
    };
    loadTypeScript('../src/pages/background/index.ts', {
        chrome, self: {}, setInterval: fn => { listeners.interval = fn; },
        require: () => services, console: { log() {}, error() {} }
    });
    return { listeners, counts, alarms };
}

test('queue alarm wakes both queues after worker suspension and survives startup', async () => {
    const first = backgroundHarness();
    assert.equal(first.alarms.get('thattweet-process-queues').periodInMinutes, 1);
    const restarted = backgroundHarness(first.alarms);
    restarted.listeners.alarm({ name: 'thattweet-process-queues' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(restarted.counts.ai, 1);
    assert.equal(restarted.counts.vision, 1);
    assert.equal(restarted.counts.backup, 0);
    restarted.alarms.delete('thattweet-process-queues');
    restarted.listeners.startup();
    assert.ok(restarted.alarms.has('thattweet-process-queues'));
});

test('invalid messages fail safely; a valid batch is saved and acknowledged', async () => {
    const { listeners, counts } = backgroundHarness();
    assert.equal(listeners.message(null, {}, () => {}), false);
    for (const message of [{ type: 'SAVE_TWEETS_BATCH' }, { type: 'REANALYZE_TWEET', payload: { tweetId: '' } }]) {
        let response;
        assert.equal(listeners.message(message, {}, value => { response = value; }), false);
        assert.equal(response.success, false);
        assert.ok(response.error);
    }
    let response;
    const keepsChannelOpen = listeners.message({ type: 'SAVE_TWEETS_BATCH', payload: { tweets: [{ id: 'test', authorId: 'author' }], users: [{ id: 'author' }] } }, {}, value => { response = value; });
    assert.equal(keepsChannelOpen, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(response.success, true);
    assert.equal(counts.saved, 1);
});


test('literal UI translation keys are present in both supported locales', () => {
    const keys = new Set();
    function scan(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
            if (entry.isDirectory()) scan(path);
            else if (entry.name.endsWith('.tsx')) {
                const text = readFileSync(path, 'utf8');
                for (const match of text.matchAll(/\bt\(['"]([^'"]+)['"]/g)) keys.add(match[1]);
            }
        }
    }
    scan(new URL('../src/', import.meta.url));
    for (const locale of ['en', 'zh_CN']) {
        const entries = JSON.parse(readFileSync(new URL(`../src/locales/${locale}/messages.json`, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
        for (const key of keys) assert.ok(entries[key]?.message, `${locale}: missing ${key}`);
    }
});
