import React, { useRef, useState } from 'react';
import { exportPortableBackup, importPortableBackup, readLocalCheckpoint, saveLocalCheckpoint } from '../../core/backup/portableBackup';
import { PreparedDownloadLink, usePreparedDownload } from '../../shared/components/PreparedDownload';
import { useSettingsStore } from '../../shared/store/useSettingsStore';

export function SafariBackupPanel() {
    const settings = useSettingsStore(s => s.settings);
    const updateSettings = useSettingsStore(s => s.updateSettings);
    const [includeSettings, setIncludeSettings] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [imported, setImported] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const download = usePreparedDownload();
    const run = async (action: () => Promise<string>) => {
        download.clear();
        setBusy(true); setStatus('正在处理…');
        try { setStatus(await action()); } catch (error) { setStatus(`未完成：${error instanceof Error ? error.message : String(error)}。请保留原文件后重试。`); }
        finally { setBusy(false); }
    };
    const prepare = (data: unknown, prefix: string) => download.prepare(JSON.stringify(data), `${prefix}-${new Date().toISOString().slice(0, 10)}.json`);
    return <section className="space-y-4" aria-label="iPhone 数据备份">
        <p className="text-sm text-zinc-400 leading-relaxed">手机数据单独保存在 Safari 中。导出文件包含推文、作者、聊天、会话笔记与笔记历史；不会自动同步或改动电脑数据。</p>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={includeSettings} onChange={e => { setIncludeSettings(e.target.checked); download.clear(); }} />包含 AI 配置和 API Key（请私密保存）</label>
        <div className="flex flex-wrap gap-3">
            <button disabled={busy} className="px-4 py-3 rounded-lg bg-brand/10 text-brand" onClick={() => run(async () => { prepare(await exportPortableBackup(includeSettings), 'ThatTweet-iPhone'); return '备份已生成，请点击「保存备份文件」。'; })}>生成完整备份</button>
            <button disabled={busy} className="px-4 py-3 rounded-lg bg-white/5" onClick={() => input.current?.click()}>从文件导入</button>
            <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={e => {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                run(async () => {
                    const data = JSON.parse(await file.text());
                    await saveLocalCheckpoint();
                    const result = await importPortableBackup(data);
                    setImported(true);
                    return `新增 ${result.tweetsAdded} 条推文；现有 ${result.sessions} 个会话。已有记录保留，同 ID 的不同聊天另存副本。请重新加载后核对内容。`;
                });
            }} />
        </div>
        <label className="flex items-start gap-3 text-sm leading-relaxed"><input className="mt-1" type="checkbox" checked={settings.autoBackupEnabled} onChange={e => updateSettings({ autoBackupEnabled: e.target.checked })} />定期保留本机恢复快照（iOS 可能暂停后台；卸载或清除数据时快照也会丢失，请另外导出文件）</label>
        <button disabled={busy} className="px-4 py-3 rounded-lg border border-white/10 text-sm" onClick={() => run(async () => {
            const data = await readLocalCheckpoint(); if (!data) return '还没有本机快照。';
            prepare(data, 'ThatTweet-iPhone-checkpoint'); return '快照已生成，请点击「保存备份文件」。';
        })}>导出最近恢复快照</button>
        {status && <p role="status" className="text-sm text-zinc-300 leading-relaxed">{status}</p>}
        <PreparedDownloadLink file={download.file} />
        {imported && <button className="px-4 py-3 rounded-lg bg-brand/10 text-brand" onClick={() => location.reload()}>重新加载并核对</button>}
    </section>;
}
