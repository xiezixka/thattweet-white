import { useEffect, useState } from 'react';

export type PreparedFile = { url: string; name: string };

// Async preparation never starts a download. The visible anchor gets a fresh
// user click, even when generating a large backup takes several seconds.
export function usePreparedDownload() {
    const [file, setFile] = useState<PreparedFile | null>(null);
    useEffect(() => () => {
        if (file) setTimeout(() => URL.revokeObjectURL(file.url), 60_000);
    }, [file]);
    return {
        file,
        clear: () => setFile(null),
        prepare: (content: string, name: string, type = 'application/json') => {
            setFile({ url: URL.createObjectURL(new Blob([content], { type })), name });
        },
    };
}

export function PreparedDownloadLink({ file }: { file: PreparedFile | null }) {
    if (!file) return null;
    return <div className="space-y-2">
        <a href={file.url} download={file.name} className="inline-flex min-h-11 items-center px-4 py-3 rounded-lg bg-brand/10 text-brand text-sm font-medium">保存备份文件</a>
        <p className="text-xs text-zinc-500 break-all">{file.name} · 点击保存后，请在下载列表或「文件」中确认。</p>
    </div>;
}
