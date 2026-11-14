import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ChatArea } from './components/chat/ChatArea';
import { NoteEditor } from './components/editor/NoteEditor';
import { useIntelligenceStore } from './store/useIntelligenceStore';
import { useChatStore } from './store/useChatStore';
import { cn } from '../../shared/utils/cn';
import { Tweet } from '../../shared/types/tweet';
import { useSearchStore } from './store/useSearchStore';

export const IntelligenceView: React.FC = () => {
    const { isNoteOpen, noteWidth, setNoteWidth, dualPane, loadNote } = useIntelligenceStore();
    const { loadSessions } = useChatStore();
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [panel, setPanel] = useState<'history' | 'chat' | 'note'>('chat');
    const [citation, setCitation] = useState<Tweet | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await loadSessions();
            await loadNote();
            const session = useChatStore.getState().currentSession;
            if (session?.noteContent !== undefined) useIntelligenceStore.getState().setNoteContent(session.noteContent);
            if (window.matchMedia('(max-width: 1023px)').matches) useIntelligenceStore.getState().setNoteOpen(false);
            if (!cancelled) setReady(true);
        })().catch(error => { if (!cancelled) setLoadError(String(error)); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => { if (isNoteOpen) setPanel('note'); else setPanel('chat'); }, [isNoteOpen]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const sidebarWidth = 280;
    const minChatWidth = 900;
    const minNoteWidth = dualPane ? 500 : 380;

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const workspaceWidth = containerRect.width - sidebarWidth;

        // Calculate potential note width from the right
        let newNoteWidth = containerRect.right - e.clientX;

        // Constraint 1: Note shouldn't be too small
        if (newNoteWidth < minNoteWidth) newNoteWidth = minNoteWidth;

        // Constraint 2: Chat area must have a minimum width
        const maxNoteWidth = workspaceWidth - minChatWidth;
        if (newNoteWidth > maxNoteWidth) newNoteWidth = maxNoteWidth;

        setNoteWidth(newNoteWidth);
    }, [isDragging, setNoteWidth, dualPane]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    if (loadError) return <p role="alert" className="p-6">聊天和笔记加载失败，请重新打开页面：{loadError}</p>;
    if (!ready) return <p role="status" className="p-6">正在读取聊天和笔记…</p>;
    return (
        <div ref={containerRef} data-mobile-panel={panel} className="intelligence-workspace h-full bg-[#0d0d0d] text-zinc-200 flex overflow-hidden no-scrollbar">
            <nav className="intelligence-tabs" aria-label="聊天与笔记工作区">
                {(['history', 'chat', 'note'] as const).map((name, i) => <button key={name} type="button" aria-pressed={panel === name} onClick={() => {
                    setPanel(name);
                    if (name !== 'history') useIntelligenceStore.getState().setNoteOpen(name === 'note');
                }}>{['历史与资料', '聊天', '笔记'][i]}</button>)}
            </nav>
            {/* 1. Left Sidebar (History) */}
            <div className="intelligence-history"><Sidebar onSelectChat={() => setPanel('chat')} onAttachTweet={tweet => { setCitation(tweet); setPanel('chat'); }} /></div>

            {/* 2. Main Workspace */}
            <div className="intelligence-main flex-1 flex relative min-w-0 bg-[#0d0d0d]">
                {/* 2a. Chat Area */}
                <div className="intelligence-chat flex-1 flex flex-col min-w-[900px] relative z-0">
                    <ChatArea citationToAttach={citation} onCitationAttached={() => setCitation(null)} onOpenLibrary={() => { useSearchStore.getState().setActiveTab('library'); setPanel('history'); }} />
                </div>

                {/* Resizer Handle */}
                {isNoteOpen && (
                    <div
                        onMouseDown={handleMouseDown}
                        className={cn(
                            "intelligence-resizer absolute top-0 bottom-0 w-1 z-50 cursor-col-resize transition-colors group",
                            isDragging ? "bg-brand/50" : "bg-transparent hover:bg-brand/30"
                        )}
                        style={{ right: `${noteWidth}px`, transform: 'translateX(50%)' }}
                    >
                        <div className={cn(
                            "absolute inset-y-0 left-1/2 w-[1px] -translate-x-1/2 transition-colors",
                            isDragging ? "bg-brand" : "bg-white/5 group-hover:bg-brand/50"
                        )} />
                    </div>
                )}

                {/* 2b. Note Editor (Right Side) */}
                <div
                    className={cn(
                        "intelligence-note h-full border-l border-white/5 bg-[#0d0d0d] overflow-hidden flex flex-col shrink-0 relative z-10",
                        !isNoteOpen && "hidden"
                    )}
                    style={{
                        width: isNoteOpen ? `${noteWidth}px` : 0,
                        transition: 'none'
                    }}
                >
                    <NoteEditor />
                </div>
            </div>
        </div>
    );
};
