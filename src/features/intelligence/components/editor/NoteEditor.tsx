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
    const { t } = useTranslation();

    const [splitRatio, setSplitRatio] = useState(0.5);
    const [previewMode, setPreviewMode] = useState<"page" | "mobile">("page");
    const [customCss, setCustomCss] = useState(DEFAULT_CSS);
    const [isEditingStyle, setIsEditingStyle] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [currentTime, setCurrentTime] = useState("");
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [isResizingSplit, setIsResizingSplit] = useState(false);

    // File Handle
    const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
    const [fileName, setFileName] = useState("");
    const [saveStatus, setSaveStatus] = useState<"saved" | "dirty" | "error" | "readonly" | "idle">("idle");

    const editorRef = useRef<HTMLTextAreaElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const mobilePreviewRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef(content);
    const lastSavedContentRef = useRef(content);
    const isScrollingRef = useRef<boolean>(false);

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
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['fallingPenHistory'], (res) => { if (res.fallingPenHistory) setHistory(res.fallingPenHistory); });
        }
    }, []);

    useEffect(() => {
        saveNote();
    }, [content, dualPane]);

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

    const handleSaveFile = async (manual = false) => {
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
            lastSavedContentRef.current = contentRef.current;
            setSaveStatus("saved");
        } catch (e) { setSaveStatus("error"); }
    };

    const handleOpenFile = async () => {
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
                text = `\n\n> **[Tweet from ${name} (@${handle})]**\n> ${(item as any).text}\n> \n> [View on Twitter](${tweetUrl})\n\n`;
            } else {
                text = `\n\n> ${item}\n\n`;
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
        <div className="h-full flex flex-col bg-[#0d0d0d] overflow-hidden no-scrollbar">
            <style>{MARVEL_DEVICES_CSS}</style>
            <style>{customCss}</style>

            <header className="h-14 flex items-center justify-between px-4 bg-[#0d0d0d] border-b border-white/5 z-20 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-brand to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-brand/20">
                        <Pen size={18} />
                    </div>
                    <div>
                        <div className="text-sm font-black text-zinc-100 uppercase tracking-wider">{t('int_note_title')}</div>
                        <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em]">{fileName || "落笔 · PREMIUM EDITOR"}</div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 mr-1">
                        <HeaderActionBtn onClick={() => setDualPane(!dualPane)} title="Toggle Layout" active={dualPane}><Layout size={14} /></HeaderActionBtn>
                        <HeaderActionBtn onClick={() => setPreviewMode(prev => prev === 'page' ? 'mobile' : 'page')} title="Preview Mode" active={previewMode === 'mobile'}><Phone size={14} /></HeaderActionBtn>
                    </div>
                    <HeaderActionBtn onClick={() => setIsEditingStyle(!isEditingStyle)} title="Edit Styles" active={isEditingStyle}><Settings size={16} /></HeaderActionBtn>
                    <HeaderActionBtn onClick={() => setShowHistory(!showHistory)} title="History" active={showHistory}><History size={16} /></HeaderActionBtn>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                        {fileHandle ? <HeaderActionBtn onClick={handleDisconnect} title="Disconnect"><X size={14} /></HeaderActionBtn> : <HeaderActionBtn onClick={handleOpenFile} title="Open MD"><Plus size={14} /></HeaderActionBtn>}
                        <HeaderActionBtn onClick={() => handleSaveFile(true)} title="Save" active={saveStatus === 'dirty'}><Save size={14} /></HeaderActionBtn>
                    </div>
                    <HeaderActionBtn onClick={() => { navigator.clipboard.writeText(content); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 2000); }} title="Copy">
                        {copySuccess ? <Check size={12} className="text-brand" /> : <Copy size={12} />}
                    </HeaderActionBtn>
                    <button onClick={toggleNote} className="p-2 text-zinc-500 hover:text-white transition-colors ml-1"><PanelRightClose size={20} /></button>
                </div>
            </header>

            <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
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

                <div
                    className={cn("flex flex-col relative bg-[#0f0f0f]", !dualPane ? "flex-1 max-w-4xl mx-auto min-w-[500px]" : "shrink-0 min-w-[500px]")}
                    style={dualPane ? { width: `${splitRatio * 100}%` } : {}}
                >
                    <div className="absolute top-4 right-6 flex items-center gap-3 z-10">
                        <div className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition-colors", saveStatus === 'saved' ? "text-brand border-brand/20 bg-brand/5" : "text-amber-500 border-amber-500/20 bg-amber-500/5")}>{saveStatus}</div>
                        <div className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full">{content.length} chars</div>
                    </div>
                    <div className="absolute left-3 top-10 bottom-10 w-4 flex flex-col gap-1.5 z-10 opacity-20 hover:opacity-100 transition-opacity">
                        {outlineItems.map((item, i) => (
                            <button key={i} className="flex justify-end w-full group" onClick={() => { if (editorRef.current) editorRef.current.scrollTop = editorRef.current.scrollHeight * (item.lineIndex / content.split('\n').length); }}>
                                <div className={cn("h-1 rounded-full transition-all group-hover:bg-brand", item.level === 1 ? "w-4 bg-zinc-600" : item.level === 2 ? "w-3 bg-zinc-700" : "w-1.5 bg-zinc-800")} />
                            </button>
                        ))}
                    </div>
                    <textarea
                        ref={editorRef}
                        value={content}
                        onChange={(e) => onChange(e.target.value)}
                        onScroll={() => handleSyncScroll('editor')}
                        className="flex-1 w-full bg-transparent text-zinc-300 p-12 pl-16 resize-none outline-none font-sans text-[17px] leading-[1.8] no-scrollbar placeholder:text-zinc-900 focus:ring-0"
                        placeholder="# Start writing..."
                        spellCheck={false}
                    />
                </div>

                {dualPane && (
                    <div onMouseDown={onMouseDownResizer} className={cn("w-[2px] shrink-0 z-40 cursor-col-resize relative", isResizingSplit ? "bg-brand" : "bg-white/5 hover:bg-brand/30")} />
                )}

                {dualPane && (
                    <div className="flex-1 bg-[#0c0c0c] overflow-hidden flex justify-center p-0 border-l border-white/5 min-w-[500px]">
                        <div
                            ref={previewContainerRef}
                            onScroll={() => handleSyncScroll('preview')}
                            className={cn("w-full h-full flex justify-center transition-all", previewMode === 'mobile' ? "items-center bg-[#080808]" : "items-stretch overflow-y-auto no-scrollbar")}
                        >
                            {previewMode === 'mobile' ? (
                                <div className="scale-[0.85] origin-center flex justify-center">
                                    <div className="marvel-device iphone-x">
                                        <div className="notch"><div className="camera"></div><div className="speaker"></div></div>
                                        <div className="screen">
                                            <div
                                                ref={mobilePreviewRef}
                                                onScroll={() => handleSyncScroll('preview')}
                                                className="wechat-body mobile-content no-scrollbar"
                                            >
                                                <div className="mock-status-bar">
                                                    <span>{currentTime}</span>
                                                    <div className="right-icons">
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l-12-18h24z" /></svg>
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h-14v12h14v-12zM22 10h-2v4h2v-4z" /></svg>
                                                    </div>
                                                </div>
                                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkAlert]} rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false }], [rehypeHighlight, REHYPE_HIGHLIGHT_OPTIONS], rehypeLinkReferences]}>
                                                    {content || "*Preview content...*"}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ width: "100%", maxWidth: "800px", minHeight: "100%", background: "#0f0f0f", boxShadow: "-10px 0 30px rgba(0,0,0,0.2)" }}>
                                    <div className="wechat-body no-scrollbar">
                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkAlert]} rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false }], [rehypeHighlight, REHYPE_HIGHLIGHT_OPTIONS], rehypeLinkReferences]}>
                                            {content || "*Preview content...*"}
                                        </ReactMarkdown>
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
