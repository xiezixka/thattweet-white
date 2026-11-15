import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { all } from "lowlight";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { remarkAlert } from "remark-github-blockquote-alert";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import 'katex/dist/katex.min.css';
import { diffLines } from 'diff';
import { useChatStore } from "../../store/useChatStore";
import { downloadFile } from '../../../../shared/utils/platform';
import {
    Pen,
    Layout,
    Phone,
    Settings,
    Trash2,
    Copy,
    Check,
    PanelRightClose,
    FileText,
    MoreHorizontal,
    Bold,
    Italic,
    Heading1,
    Heading2,
    Heading3,
    Code,
    Plus,
    X,
    Clock,
    Save,
    ExternalLink,
    ChevronRight,
    Search,
    Type,
    FileCode,
    Languages,
    History,
    Anchor
} from 'lucide-react';

import { useIntelligenceStore } from '../../store/useIntelligenceStore';
import { cn } from '../../../../shared/utils/cn';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import { MARVEL_DEVICES_CSS } from "./styles/DeviceStyles";

// --- Constants & Styles ---

const REFERENCE_HEADING_TEXT = "参考链接";

const DEFAULT_CSS = `.wechat-body { 
    font-family: -apple-system-font, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', Arial, sans-serif; 
    line-height: 1.8; 
    color: #e0e0e0; 
    font-size: 15px; 
    padding: 35px 25px;
    overflow-x: hidden;
    background-color: #0f0f0f;
    background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1.2px, transparent 1.2px);
    background-size: 24px 24px;
    min-height: 100%;
}

.wechat-body a { color: #10b981; text-decoration: none; border-bottom: 1.5px dashed rgba(16, 185, 129, 0.4); transition: all 0.2s; }
.wechat-body a:hover { border-bottom-color: #10b981; }

.wechat-body h1 { 
    text-align: center; color: #ffffff; font-size: 26px; font-weight: 800; margin: 2.2em 0 1.6em; position: relative; padding-bottom: 12px;
}
.wechat-body h1::after {
    content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 45px; height: 4px; background: #10b981; border-radius: 4px;
}

.wechat-body h2 { 
    font-size: 20px; font-weight: 700; color: #ffffff; margin: 2em 0 1.2em; padding-left: 15px; border-left: 6px solid #10b981; line-height: 1.4;
}

.wechat-body h3 { font-size: 18px; font-weight: 700; color: #f0f0f0; margin: 1.5em 0 1em; display: flex; align-items: center; }
.wechat-body h3::before { content: ''; display: inline-block; width: 6px; height: 6px; background: #10b981; border-radius: 50%; margin-right: 10px; opacity: 0.8; }

.wechat-body ul, .wechat-body ol { padding-left: 24px; margin: 1em 0; }
.wechat-body li { margin: 0.5em 0; }
.wechat-body li > ul, .wechat-body li > ol { margin: 0.5em 0; padding-left: 20px; }

.wechat-body blockquote { 
    margin: 1.8em 0; padding: 24px; background: rgba(255, 255, 255, 0.03); border-radius: 16px; color: #a0a0a0; font-size: 14.5px; position: relative; border-left: 4px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.wechat-body pre { 
    background: #1a1a1a; color: #d1d5db; padding: 20px; border-radius: 12px; font-size: 13.5px; margin: 1.8em 0; overflow-x: auto; border: 1px solid rgba(255,255,255,0.05);
}

.wechat-body code { color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 3px 8px; border-radius: 6px; }

.wechat-body pre code { background: transparent; padding: 0; color: inherit; }
.wechat-body .hljs-comment { color: #8b949e; font-style: italic; }
.wechat-body .hljs-keyword { color: #ff7b72; }
.wechat-body .hljs-string { color: #a5d6ff; }
.wechat-body .hljs-title { color: #d2a8ff; }
.wechat-body .hljs-variable { color: #79c0ff; }

.wechat-body img { display: block; max-width: 100%; border-radius: 12px; margin: 2em auto; border: 1px solid rgba(255,255,255,0.1); }
.wechat-body table:not(.katex *) { width: 100%; border-collapse: collapse; margin: 1.5em 0; color: #e0e0e0; }
.wechat-body table:not(.katex *) th, .wechat-body table:not(.katex *) td { border: 1px solid #333; padding: 12px; text-align: left; }

/* GitHub Alert Styles */
.wechat-body .markdown-alert { padding: 16px 20px; margin: 1.5em 0; border-radius: 12px; border-left: 4px solid; }
.wechat-body .markdown-alert-note { background: rgba(56, 139, 253, 0.1); border-left-color: #388bfd; }
.wechat-body .markdown-alert-tip { background: rgba(35, 134, 54, 0.1); border-left-color: #31ad4d; }
.wechat-body .markdown-alert-important { background: rgba(137, 87, 229, 0.1); border-left-color: #8957e5; }
.wechat-body .markdown-alert-warning { background: rgba(210, 153, 34, 0.1); border-left-color: #d29922; }
.wechat-body .markdown-alert-caution { background: rgba(218, 54, 51, 0.1); border-left-color: #da3633; }

/* Phone Emulator specific */
.mobile-content {
    height: 100%; width: 100%; overflow-y: auto; overflow-x: hidden;
    padding: 55px 18px 20px !important; position: relative; border-radius: 35px;
}
.mock-status-bar {
    position: absolute; top: 12px; left: 0; width: 100%; padding: 0 22px;
    display: flex; justify-content: space-between; z-index: 10; color: #fff;
    font-size: 13px; font-weight: 600; pointer-events: none;
}
.mock-status-bar .right-icons { display: flex; gap: 6px; }
`;

type HastNode = {
    type: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
    value?: string;
};

const rehypeLinkReferences = () => {
    return (tree: HastNode) => {
        if (!tree || !Array.isArray(tree.children)) return;
        const references: { href: string; title: string; index: number }[] = [];
        const indexByHref = new Map<string, number>();
        const isExternal = (href: string) => /^https?:\/\//i.test(href);
        const getText = (node?: HastNode): string => {
            if (!node) return "";
            if (node.type === "text") return node.value || "";
            if (!Array.isArray(node.children)) return "";
            return node.children.map(getText).join("");
        };
        const visit = (node: HastNode) => {
            if (!node.children) return;
            for (const child of node.children) {
                if (child.type === "element" && child.tagName === "a") {
                    const href = child.properties?.href;
                    if (typeof href === "string" && isExternal(href)) {
                        let index = indexByHref.get(href);
                        if (!index) {
                            index = references.length + 1;
                            indexByHref.set(href, index);
                            const title = getText(child).trim() || href;
                            references.push({ href, title, index });
                        }
                        child.children = child.children || [];
                        child.children.push({
                            type: "element", tagName: "sup", properties: {},
                            children: [{ type: "text", value: `[${index}]` }]
                        });
                    }
                }
                visit(child);
            }
        };
        visit(tree);
        if (references.length === 0) return;
        const listItems: HastNode[] = references.map((ref) => {
            const children: HastNode[] = [];
            if (ref.title && ref.title !== ref.href) children.push({ type: "text", value: `${ref.title}: ` });
            children.push({
                type: "element", tagName: "a", properties: { href: ref.href },
                children: [{ type: "text", value: ref.href }]
            });
            return { type: "element", tagName: "li", properties: {}, children };
        });
        tree.children.push(
            { type: "element", tagName: "h2", properties: {}, children: [{ type: "text", value: REFERENCE_HEADING_TEXT }] },
            { type: "element", tagName: "ol", properties: {}, children: listItems }
        );
    };
};

const REHYPE_HIGHLIGHT_OPTIONS = { detect: true, languages: all };

// --- Persistence ---

async function openIDB() {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("falling-pen-db", 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains("handles")) req.result.createObjectStore("handles");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getStoredHandle() {
    const db = await openIDB();
    return new Promise<FileSystemFileHandle | null>((resolve) => {
        const tx = db.transaction("handles", "readonly");
        const req = tx.objectStore("handles").get("last-file-handle");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    });
}

async function setStoredHandle(handle: FileSystemFileHandle) {
    const db = await openIDB();
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, "last-file-handle");
}

async function clearStoredHandle() {
    const db = await openIDB();
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").delete("last-file-handle");
}

// --- Main ---

interface HistoryItem { id: string; timestamp: number; content: string; }

export const NoteEditor: React.FC = () => {
    const {
        isNoteOpen, toggleNote, noteContent: content, setNoteContent: onChange,
        pendingInsert, clearPendingInsert, dualPane, setDualPane, loadNote, saveNote
    } = useIntelligenceStore();
    const { currentSessionId, currentSession, updateSessionNote } = useChatStore();
    const { t } = useTranslation();

    const [splitRatio, setSplitRatio] = useState(0.5);
    const [previewMode, setPreviewMode] = useState<"page" | "mobile">("page");
    const [customCss, setCustomCss] = useState(DEFAULT_CSS);
    const [isEditingStyle, setIsEditingStyle] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [currentTime, setCurrentTime] = useState("");
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
    const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
    const [isResizingSplit, setIsResizingSplit] = useState(false);

    // File Handle
    const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
    const [fileName, setFileName] = useState("");
    const [saveStatus, setSaveStatus] = useState<"saved" | "dirty" | "error" | "readonly" | "idle">("idle");

    const editorRef = useRef<HTMLTextAreaElement>(null);
    const importFileRef = useRef<HTMLInputElement>(null);
    const [fileError, setFileError] = useState('');
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const mobilePreviewRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef(content);
    const lastSavedContentRef = useRef(content);
    const isScrollingRef = useRef<boolean>(false);

    // Context-aware history key
    const historyKey = useMemo(() => {
        if (fileHandle) return `fallingPenHistory_file_${fileName}`;
        if (currentSessionId) return `fallingPenHistory_chat_${currentSessionId}`;
        return 'fallingPenHistory_global';
    }, [fileHandle, fileName, currentSessionId]);

    useEffect(() => { contentRef.current = content; }, [content]);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTime(`${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
        };
        updateTime();
        const timer = setInterval(updateTime, 1000 * 60);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get<Record<string, HistoryItem[] | undefined>>([historyKey], (res) => {
                setHistory(Array.isArray(res[historyKey]) ? res[historyKey]! : []);
            });
        }
    }, [historyKey]);

    // Sync note content to current chat session
    useEffect(() => {
        if (currentSessionId && content !== currentSession?.noteContent) {
            updateSessionNote(currentSessionId, content);
        }
    }, [content, currentSessionId]);

    // Switch note content when session changes (if session has its own note)
    const lastSessionIdRef = useRef(currentSessionId);
    useEffect(() => {
        if (currentSessionId !== lastSessionIdRef.current) {
            if (currentSessionId && currentSession) {
                onChange(currentSession.noteContent || "");
                lastSavedContentRef.current = currentSession.noteContent || "";
            }
            lastSessionIdRef.current = currentSessionId;
            setSelectedHistoryId(null);
        }
    }, [currentSessionId, currentSession]);

    useEffect(() => {
        saveNote();
    }, [content, dualPane]);

    const saveVersion = useCallback((newContent: string) => {
        if (!newContent.trim() || newContent === lastSavedContentRef.current) return;

        const newItem: HistoryItem = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            content: newContent
        };

        setHistory(prev => {
            const next = [newItem, ...prev].slice(0, 50); // Keep last 50 versions
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({ [historyKey]: next });
            }
            return next;
        });
    }, [historyKey]);

    const handleSaveFile = async (manual = false) => {
        if (typeof (window as any).showSaveFilePicker !== 'function') {
            if (manual) {
                downloadFile(contentRef.current, 'ThatTweet-note.md', 'text/markdown');
                saveVersion(contentRef.current);
                // A download request is not evidence the file was saved.
                setFileError('已发起导出，请在 Safari 下载列表或「文件」中确认。笔记继续保存在本机。');
            }
            return;
        }
        let handle = fileHandle;
        if (!handle) {
            if (!manual) return;
            try {
                handle = await (window as any).showSaveFilePicker({ types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }] });
                if (!handle) return;
                setFileHandle(handle); setFileName(handle.name); setStoredHandle(handle);
            } catch (e) { return; }
        }
        try {
            const writable = await handle.createWritable();
            await writable.write(contentRef.current);
            await writable.close();
            saveVersion(contentRef.current);
            lastSavedContentRef.current = contentRef.current;
            setSaveStatus("saved");
        } catch (e) { setSaveStatus("error"); }
    };

    // Shortcuts: Ctrl+S and Ctrl+Z
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSaveFile(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fileHandle]);

    // Auto-save history snapshot even if no file is connected
    useEffect(() => {
        const timer = setTimeout(() => {
            if (content.trim() && content !== lastSavedContentRef.current) {
                saveVersion(content);
                lastSavedContentRef.current = content;
            }
        }, 30000); // Auto-save history every 30s of inactivity
        return () => clearTimeout(timer);
    }, [content]);

    const insertText = (before: string, after: string = "") => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const val = el.value;
        const text = before + val.substring(start, end) + after;
        document.execCommand('insertText', false, text);
        if (end > start) {
            setTimeout(() => { el.setSelectionRange(start + before.length, start + before.length + (end - start)); }, 0);
        }
    };

    const ensurePermission = async (handle: FileSystemFileHandle) => {
        const h = handle as any;
        if (!h.queryPermission) return true;
        const state = await h.queryPermission({ mode: "readwrite" });
        if (state === "granted") return true;
        const res = await h.requestPermission({ mode: "readwrite" });
        return res === "granted";
    };

    useEffect(() => {
        getStoredHandle().then(async (h) => {
            if (h) {
                try {
                    const ok = await ensurePermission(h);
                    if (ok) {
                        const file = await h.getFile();
                        const text = await file.text();
                        setFileHandle(h);
                        setFileName(file.name);
                        onChange(text);
                        lastSavedContentRef.current = text;
                        setSaveStatus("saved");
                    }
                } catch (e) { clearStoredHandle(); }
            }
        });
    }, []);

    const handleOpenFile = async () => {
        if (typeof (window as any).showOpenFilePicker !== 'function') {
            importFileRef.current?.click();
            return;
        }
        try {
            const [h] = await (window as any).showOpenFilePicker({ types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }] });
            if (!h) return;
            const file = await h.getFile();
            const text = await file.text();
            setFileHandle(h); setFileName(file.name); setStoredHandle(h);
            onChange(text); lastSavedContentRef.current = text; setSaveStatus("saved");
        } catch (e) { }
    };

    const handleDisconnect = () => { setFileHandle(null); setFileName(""); setSaveStatus("idle"); clearStoredHandle(); };

    useEffect(() => {
        if (!fileHandle) { setSaveStatus("idle"); return; }
        if (content === lastSavedContentRef.current) { setSaveStatus("saved"); return; }
        setSaveStatus("dirty");
        const timer = setTimeout(() => handleSaveFile(), 2000);
        return () => clearTimeout(timer);
    }, [content, fileHandle]);

    const handleSyncScroll = (source: 'editor' | 'preview') => {
        if (!dualPane || isScrollingRef.current) return;
        const editor = editorRef.current;
        const preview = previewMode === 'mobile' ? mobilePreviewRef.current : previewContainerRef.current;
        if (!editor || !preview) return;

        isScrollingRef.current = true;
        if (source === 'editor') {
            const ratio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
            preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
        } else {
            const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
            editor.scrollTop = ratio * (editor.scrollHeight - editor.clientHeight);
        }

        // Use a small timeout to unlock scrolling
        setTimeout(() => {
            isScrollingRef.current = false;
        }, 50);
    };

    useEffect(() => {
        if (pendingInsert) {
            const { type, content: item } = pendingInsert;
            let text = "";
            if (type === 'tweet') {
                const handle = (item as any).author?.handle || (item as any).author || "user";
                const name = (item as any).author?.name || (item as any).authorName || handle;
                const tweetUrl = (item as any).url || `https://twitter.com/${handle}/status/${(item as any).id}`;
                const body = (item as any).text || "";
                const quotedBody = body.split('\n').map((line: string) => `> ${line}`).join('\n');

                text = `\n\n> **[Tweet from ${name} (@${handle})]**\n${quotedBody}\n> \n> [View on Twitter](${tweetUrl})\n\n`;
            } else {
                const quotedBody = String(item).split('\n').map((line: string) => `> ${line}`).join('\n');
                text = `\n\n${quotedBody}\n\n`;
            }
            insertText(text);
            clearPendingInsert();
        }
    }, [pendingInsert]);

    const onMouseDownResizer = (e: React.MouseEvent) => { e.preventDefault(); setIsResizingSplit(true); };
    useEffect(() => {
        const move = (e: MouseEvent) => {
            if (!isResizingSplit || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            if (rect.width * ratio > 500 && rect.width * (1 - ratio) > 500) setSplitRatio(ratio);
        };
        const up = () => setIsResizingSplit(false);
        if (isResizingSplit) {
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
            document.body.style.cursor = 'col-resize';
        } else {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
            document.body.style.cursor = 'default';
        }
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [isResizingSplit]);

    const outlineItems = useMemo(() => {
        return content.split('\n').map((line, i) => {
            const m = line.match(/^\s*(#{1,6})\s+(.*)$/);
            if (m) return { level: m[1].length, text: m[2].trim(), lineIndex: i };
            return null;
        }).filter(Boolean) as { level: number, text: string, lineIndex: number }[];
    }, [content]);

    return (
        <div className="note-editor h-full flex flex-col bg-[#0d0d0d] overflow-hidden no-scrollbar">
            <input ref={importFileRef} type="file" accept=".md,.txt,text/markdown,text/plain" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                try {
                    const text = await file.text();
                    if (contentRef.current.trim() && contentRef.current !== text && !confirm('导入将替换当前编辑内容。请先导出当前笔记；是否继续？')) return;
                    saveVersion(contentRef.current);
                    onChange(text); setFileError('已导入并保存在本机，导出后可保存到「文件」。');
                } catch (error) { setFileError(`导入失败：${String(error)}`); }
            }} />
            {fileError && <p role="status" className="px-4 py-2 text-sm text-zinc-400">{fileError}</p>}
            <style>{MARVEL_DEVICES_CSS}</style>
            <style>{customCss}</style>

            <div className="note-mobile-toolbar">
                <div className="note-mode-switch" aria-label="笔记显示方式">
                    <button type="button" aria-pressed={mobileView === 'edit'} onClick={() => setMobileView('edit')}>编辑</button>
                    <button type="button" aria-pressed={mobileView === 'preview'} onClick={() => setMobileView('preview')}>预览</button>
                </div>
                <button type="button" className="note-tools-toggle" aria-expanded={mobileToolsOpen} onClick={() => setMobileToolsOpen(!mobileToolsOpen)}><MoreHorizontal size={18} />更多</button>
                {mobileToolsOpen && <div className="note-mobile-tools">
                    <button onClick={() => { setMobileToolsOpen(false); setShowHistory(true); }}><History size={18} />笔记历史</button>
                    <button onClick={() => { setMobileToolsOpen(false); handleOpenFile(); }}><Plus size={18} />导入文件</button>
                    <button onClick={() => { setMobileToolsOpen(false); handleSaveFile(true); }}><Save size={18} />导出 Markdown</button>
                    <button onClick={() => { setMobileToolsOpen(false); navigator.clipboard.writeText(content).then(() => setFileError('已复制笔记内容。')).catch(() => setFileError('复制未成功，请在编辑区选择文本后复制。')); }}><Copy size={18} />复制内容</button>
                    <button onClick={() => { setMobileToolsOpen(false); setIsEditingStyle(true); }}><Settings size={18} />预览样式</button>
                    {fileHandle && <button onClick={() => { setMobileToolsOpen(false); handleDisconnect(); }}><X size={18} />断开文件</button>}
                    <button className="note-tools-close" onClick={() => setMobileToolsOpen(false)}>收起工具</button>
                </div>}
            </div>

            <header className="note-desktop-toolbar h-14 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 z-20 shrink-0">
                <div className="flex flex-col">
                    <div className="text-[11px] font-black text-white/90 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        {t('int_note_title')}
                    </div>
                    <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.1em] ml-3.5">{fileName || "Falling Pen · Draft"}</div>
                </div>

                <div className="flex items-center gap-1">
                    <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/5 mr-1 backdrop-blur-md">
                        <HeaderActionBtn onClick={() => setDualPane(!dualPane)} title="Toggle Layout" active={dualPane}><Layout size={13} /></HeaderActionBtn>
                        <HeaderActionBtn onClick={() => setPreviewMode(prev => prev === 'page' ? 'mobile' : 'page')} title="Preview Mode" active={previewMode === 'mobile'}><Phone size={13} /></HeaderActionBtn>
                    </div>

                    <div className="flex gap-0.5">
                        <HeaderActionBtn onClick={() => setIsEditingStyle(!isEditingStyle)} title="Edit Styles" active={isEditingStyle}><Settings size={14} /></HeaderActionBtn>
                        <HeaderActionBtn onClick={() => setShowHistory(!showHistory)} title="History" active={showHistory}><History size={14} /></HeaderActionBtn>
                    </div>

                    <div className="w-[1px] h-3 bg-white/10 mx-2" />

                    <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/5 mr-1 backdrop-blur-md">
                        {fileHandle ? <HeaderActionBtn onClick={handleDisconnect} title="Disconnect"><X size={13} /></HeaderActionBtn> : <HeaderActionBtn onClick={handleOpenFile} title="Open MD"><Plus size={13} /></HeaderActionBtn>}
                        <HeaderActionBtn onClick={() => handleSaveFile(true)} title="Save" active={saveStatus === 'dirty'}><Save size={13} /></HeaderActionBtn>
                    </div>

                    <HeaderActionBtn onClick={() => { navigator.clipboard.writeText(content); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }} title="Copy">
                        {copySuccess ? <Check size={12} className="text-brand" /> : <Copy size={12} />}
                    </HeaderActionBtn>

                    <button onClick={toggleNote} className="ml-2 p-2 text-zinc-600 hover:text-zinc-200 transition-all hover:bg-white/5 rounded-lg active:scale-95">
                        <PanelRightClose size={18} />
                    </button>
                </div>
            </header>

            <div ref={containerRef} data-mobile-mode={mobileView} className="note-surface flex-1 flex overflow-hidden relative">
                {showHistory && (
                    <div className="absolute inset-x-0 top-0 h-[80%] bg-[#0f0f0f]/95 backdrop-blur-3xl border-b border-white/10 z-30 flex flex-col animate-in slide-in-from-top overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-3 bg-white/[0.02] border-b border-white/5">
                            <div className="flex items-center gap-4">
                                <span className="text-[11px] uppercase font-black text-zinc-400 tracking-[0.2em] flex items-center gap-2">
                                    <Clock size={12} className="text-brand" />
                                    {selectedHistoryId ? "Comparison View" : "History Timeline"}
                                </span>
                                {selectedHistoryId && (
                                    <button
                                        onClick={() => setSelectedHistoryId(null)}
                                        className="text-[10px] text-zinc-500 hover:text-white flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/5 transition-colors"
                                    >
                                        <ChevronRight size={10} className="rotate-180" /> Back to List
                                    </button>
                                )}
                            </div>
                            <button onClick={() => { setShowHistory(false); setSelectedHistoryId(null); }} className="text-[10px] font-black uppercase text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1 rounded-lg transition-all">Close</button>
                        </div>

                        <div className="flex-1 overflow-hidden flex">
                            {selectedHistoryId ? (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-6 font-mono text-[13px] no-scrollbar space-y-0.5 bg-black/20">
                                        {(() => {
                                            const item = history.find(h => h.id === selectedHistoryId);
                                            if (!item) return null;
                                            const diff = diffLines(content, item.content);
                                            return diff.map((part, i) => (
                                                <div key={i} className={cn(
                                                    "relative pl-6 pr-4 py-0.5 border-l-2",
                                                    part.added ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-300/90" :
                                                        part.removed ? "bg-rose-500/10 border-rose-500/50 text-rose-300/90 line-through opacity-50" :
                                                            "border-transparent text-zinc-500"
                                                )}>
                                                    <span className="absolute left-1.5 opacity-40 font-bold select-none text-[10px]">
                                                        {part.added ? "+" : part.removed ? "-" : " "}
                                                    </span>
                                                    {part.value.split('\n').map((line, li) => (
                                                        line || (li < part.value.split('\n').length - 1 ? "" : null)
                                                    ) !== null && (
                                                            <div key={li}>{line}</div>
                                                        ))}
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                    <div className="p-4 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3 backdrop-blur-xl">
                                        <div className="flex items-center gap-6 mr-auto px-4 text-[10px] text-zinc-500">
                                            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> New Content</div>
                                            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Deleted from Current</div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedHistoryId(null)}
                                            className="px-4 py-2 rounded-xl text-[11px] font-bold text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                                        >
                                            Discard Changes
                                        </button>
                                        <button
                                            onClick={() => {
                                                const item = history.find(h => h.id === selectedHistoryId);
                                                if (item) {
                                                    onChange(item.content);
                                                    setShowHistory(false);
                                                    setSelectedHistoryId(null);
                                                }
                                            }}
                                            className="px-6 py-2 rounded-xl text-[11px] font-bold text-white bg-brand shadow-lg shadow-brand/20 hover:scale-105 transition-all"
                                        >
                                            Restore Complete Version
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto p-8 flex flex-col no-scrollbar">
                                    <div className="max-w-2xl mx-auto w-full relative">
                                        <div className="absolute left-[27px] top-6 bottom-6 w-[2px] bg-gradient-to-b from-brand/50 via-zinc-800 to-zinc-800/20" />
                                        <div className="space-y-6">
                                            {history.length > 0 ? (
                                                history.map((item, idx) => (
                                                    <div key={item.id} onClick={() => setSelectedHistoryId(item.id)} className="group relative flex items-start gap-8 cursor-pointer pl-4">
                                                        <div className="relative z-10 flex-shrink-0 mt-1.5">
                                                            <div className={cn("w-[26px] h-[26px] rounded-full border-2 bg-[#0f0f0f] flex items-center justify-center transition-all duration-500", idx === 0 ? "border-brand shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "border-zinc-700 group-hover:border-zinc-400")}>
                                                                <div className={cn("w-2 h-2 rounded-full transition-all duration-500", idx === 0 ? "bg-brand scale-110" : "bg-zinc-800 group-hover:bg-zinc-500")} />
                                                            </div>
                                                            {idx === 0 && <div className="absolute -inset-1 rounded-full bg-brand/20 animate-ping opacity-20" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl p-4 transition-all duration-300 group-hover:translate-x-1 group-hover:border-white/10 shadow-xl">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-[12px] font-mono font-bold text-zinc-100 italic">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                                    <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{new Date(item.timestamp).toLocaleDateString()}</span>
                                                                </div>
                                                                <div className="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-black text-zinc-500 uppercase tracking-tighter group-hover:text-brand transition-colors">{idx === 0 ? "Latest Draft" : `v.${history.length - idx}`}</div>
                                                            </div>
                                                            <div className="text-[12px] text-zinc-500 font-mono line-clamp-2 leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity">{item.content || "Empty revision"}</div>
                                                            <div className="mt-3 flex items-center justify-between">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-700"><FileText size={10} />{item.content.length} chars</div>
                                                                    <div className="w-px h-2 bg-white/5" />
                                                                    <div className="text-[10px] text-zinc-800 font-bold italic">Auto-snapshot</div>
                                                                </div>
                                                                <span className="text-[10px] font-black uppercase text-brand opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all">Inspect Diff →</span>
                                                            </div>
                                                        </div>
                                                        <div className="absolute left-[38px] top-[14px] w-6 h-[1px] bg-white/5 group-hover:bg-brand/20 transition-colors pointer-events-none" />
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="h-48 flex flex-col items-center justify-center text-zinc-600 space-y-3">
                                                    <Clock size={32} className="opacity-20" />
                                                    <div className="italic text-xs font-bold tracking-widest uppercase opacity-40">Timeline is empty</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isEditingStyle && (
                    <div className="absolute inset-x-0 top-0 h-64 bg-zinc-900 border-b border-white/10 z-30 flex flex-col animate-in slide-in-from-top">
                        <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-white/5">
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">CSS Theme Editor</span>
                            <div className="flex gap-4">
                                <button onClick={() => setCustomCss(DEFAULT_CSS)} className="text-[10px] text-brand hover:underline">Reset</button>
                                <button onClick={() => setIsEditingStyle(false)} className="text-[10px] text-white bg-brand px-2 py-0.5 rounded">Done</button>
                            </div>
                        </div>
                        <textarea value={customCss} onChange={(e) => setCustomCss(e.target.value)} className="flex-1 bg-black/50 text-zinc-400 p-4 font-mono text-xs outline-none no-scrollbar" />
                    </div>
                )}

                <div className={cn("note-edit-pane flex flex-col relative bg-[#0f0f0f]", !dualPane ? "flex-1 max-w-4xl mx-auto min-w-[500px]" : "shrink-0 min-w-[500px]")} style={dualPane ? { width: `${splitRatio * 100}%` } : {}}>
                    <div className="note-editor-status absolute top-4 right-6 flex items-center gap-3 z-10">
                        <div className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition-colors", saveStatus === 'saved' ? "text-brand border-brand/20 bg-brand/5" : "text-amber-500 border-amber-500/20 bg-amber-500/5")}>{saveStatus}</div>
                        <div className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full">{content.length} chars</div>
                    </div>
                    <div className="absolute left-3 top-10 bottom-10 w-4 flex flex-col gap-1.5 z-40 opacity-20 hover:opacity-100 transition-all duration-500">
                        {outlineItems.map((item, i) => (
                            <button key={i} className="flex items-center group relative h-1" onClick={() => {
                                const editor = editorRef.current;
                                if (editor) {
                                    const lines = content.split('\n');
                                    const ratio = item.lineIndex / lines.length;
                                    const targetScroll = editor.scrollHeight * ratio;
                                    editor.scrollTo({ top: targetScroll - 40, behavior: 'smooth' });
                                }
                            }}>
                                <div className={cn("h-1 rounded-full transition-all duration-300 group-hover:bg-brand group-hover:shadow-[0_0_12px_rgba(16,185,129,0.5)]", item.level === 1 ? "w-4 bg-zinc-600" : item.level === 2 ? "w-3 bg-zinc-700" : "w-1.5 bg-zinc-800")} />
                                <span className="absolute left-full ml-3 opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap text-[10px] font-black text-brand bg-[#0d0d0d]/90 px-2 py-1 rounded-lg border border-brand/20 backdrop-blur-xl pointer-events-none transform -translate-x-2 group-hover:translate-x-0 shadow-2xl shadow-brand/20">{item.text}</span>
                            </button>
                        ))}
                    </div>
                    <textarea aria-label="笔记正文" ref={editorRef} value={content} onChange={(e) => onChange(e.target.value)} onScroll={() => handleSyncScroll('editor')} className="flex-1 w-full bg-transparent text-zinc-300 p-12 pl-16 resize-none outline-none font-sans text-[17px] leading-[1.8] no-scrollbar placeholder:text-zinc-900 focus:ring-0" placeholder="写下笔记…" spellCheck={false} />
                </div>

                {dualPane && <div onMouseDown={onMouseDownResizer} className={cn("w-[2px] shrink-0 z-40 cursor-col-resize relative", isResizingSplit ? "bg-brand" : "bg-white/5 hover:bg-brand/30")} />}

                {(dualPane || mobileView === 'preview') && (
                    <div className="note-preview-pane flex-1 bg-[#0c0c0c] overflow-hidden flex justify-center p-0 border-l border-white/5 min-w-[500px]">
                        <div ref={previewContainerRef} onScroll={() => handleSyncScroll('preview')} className={cn("w-full h-full flex justify-center transition-all", previewMode === 'mobile' ? "items-center bg-[#080808]" : "items-stretch overflow-y-auto no-scrollbar")}>
                            {previewMode === 'mobile' ? (
                                <div className="scale-[0.85] origin-center flex justify-center">
                                    <div className="marvel-device iphone-x">
                                        <div className="notch"><div className="camera"></div><div className="speaker"></div></div>
                                        <div className="screen">
                                            <div ref={mobilePreviewRef} onScroll={() => handleSyncScroll('preview')} className="wechat-body mobile-content no-scrollbar">
                                                <div className="mock-status-bar"><span>{currentTime}</span><div className="right-icons"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l-12-18h24z" /></svg><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h-14v12h14v-12zM22 10h-2v4h2v-4z" /></svg></div></div>
                                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkAlert]} rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false }], [rehypeHighlight, REHYPE_HIGHLIGHT_OPTIONS], rehypeLinkReferences]}>{content || "*Preview content...*"}</ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ width: "100%", maxWidth: "800px", minHeight: "100%", background: "#0f0f0f", boxShadow: "-10px 0 30px rgba(0,0,0,0.2)" }}>
                                    <div className="wechat-body no-scrollbar">
                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkAlert]} rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false }], [rehypeHighlight, REHYPE_HIGHLIGHT_OPTIONS], rehypeLinkReferences]}>{content || "*Preview content...*"}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <footer className="h-4 bg-[#0d0d0d] px-6 border-t border-white/5 flex items-center justify-between text-[8px] text-zinc-700 font-black uppercase tracking-[0.3em]">
                <div>Ready to publish</div>
                <div>Advanced Writing Engine v2.0</div>
            </footer>
        </div>
    );
};

const HeaderActionBtn: React.FC<{ children: React.ReactNode; onClick: () => void; title: string; active?: boolean }> = ({ children, onClick, title, active }) => (
    <button onClick={onClick} title={title} className={cn("p-2 rounded-lg transition-all active:scale-90", active ? "bg-brand text-white shadow-lg shadow-brand/20" : "text-zinc-500 hover:text-white hover:bg-white/5")}>{children}</button>
);
