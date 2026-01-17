import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ChatArea } from './components/chat/ChatArea';
import { NoteEditor } from './components/editor/NoteEditor';
import { useIntelligenceStore } from './store/useIntelligenceStore';
import { useChatStore } from './store/useChatStore';
import { cn } from '../../shared/utils/cn';

export const IntelligenceView: React.FC = () => {
    const { isNoteOpen, noteWidth, setNoteWidth, dualPane, loadNote } = useIntelligenceStore();
    const { loadSessions } = useChatStore();
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadNote();
        loadSessions();
    }, []);

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

    return (
        <div ref={containerRef} className="h-full bg-[#0d0d0d] text-zinc-200 flex overflow-hidden no-scrollbar">
            {/* 1. Left Sidebar (History) */}
            <Sidebar />

            {/* 2. Main Workspace */}
            <div className="flex-1 flex relative min-w-0 bg-[#0d0d0d]">
                {/* 2a. Chat Area */}
                <div className="flex-1 flex flex-col min-w-[900px] relative z-0">
                    <ChatArea />
                </div>

                {/* Resizer Handle */}
                {isNoteOpen && (
                    <div
                        onMouseDown={handleMouseDown}
                        className={cn(
                            "absolute top-0 bottom-0 w-1 z-50 cursor-col-resize transition-colors group",
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
                        "h-full border-l border-white/5 bg-[#0d0d0d] overflow-hidden flex flex-col shrink-0 relative z-10",
                        !isNoteOpen && "hidden"
                    )}
                    style={{
                        width: isNoteOpen ? `${noteWidth}px` : 0,
                        transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <NoteEditor />
                </div>
            </div>
        </div>
    );
};
