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

    const minWidth = dualPane ? 1100 : 500;

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !containerRef.current) return;

        // Calculate width from the right side
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;

        // Constraints
        if (newWidth > minWidth && newWidth < containerRect.width * 0.85) {
            setNoteWidth(newWidth);
        }
    }, [isDragging, setNoteWidth, minWidth]);

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
        <div ref={containerRef} className="h-full bg-[#0d0d0d] text-zinc-200 flex overflow-hidden no-scrollbar select-none">
            {/* 1. Left Sidebar (History) */}
            <Sidebar />

            {/* 2. Main Workspace */}
            <div className="flex-1 flex relative min-w-0">
                {/* 2a. Chat Area */}
                <ChatArea />

                {/* Resizer Handle */}
                {isNoteOpen && (
                    <div
                        onMouseDown={handleMouseDown}
                        className={cn(
                            "absolute top-0 bottom-0 w-1.5 z-50 cursor-col-resize transition-colors group",
                            isDragging ? "bg-brand/50" : "bg-transparent hover:bg-brand/30"
                        )}
                        style={{ left: `calc(100% - ${noteWidth}px)`, transform: 'translateX(-50%)' }}
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
                        "h-full border-l border-white/5 bg-[#0d0d0d] overflow-hidden flex flex-col shrink-0",
                        isNoteOpen ? "opacity-100" : "w-0 opacity-0 pointer-events-none"
                    )}
                    style={{
                        width: isNoteOpen ? `${noteWidth}px` : 0,
                        transition: isDragging ? 'none' : 'width 0.3s ease-in-out, opacity 0.3s ease-in-out'
                    }}
                >
                    <NoteEditor />
                </div>
            </div>
        </div>
    );
};
