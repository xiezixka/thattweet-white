import React from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ChatArea } from './components/chat/ChatArea';
import { NoteEditor } from './components/editor/NoteEditor';
import { useIntelligenceStore } from './store/useIntelligenceStore';
import { cn } from '../../shared/utils/cn';

export const IntelligenceView: React.FC = () => {
    const { isNoteOpen } = useIntelligenceStore();

    return (
        <div className="h-full bg-[#0d0d0d] text-zinc-200 flex overflow-hidden">
            {/* 1. Left Sidebar (History) */}
            <Sidebar />

            {/* 2. Main Workspace */}
            <div className="flex-1 flex relative min-w-0">
                {/* 2a. Chat Area */}
                <ChatArea />

                {/* 2b. Note Editor (Right Side) */}
                <div
                    className={cn(
                        "border-l border-white/5 bg-[#121212] transition-all duration-300 ease-in-out overflow-hidden flex flex-col",
                        isNoteOpen ? "w-[450px] opacity-100" : "w-0 opacity-0"
                    )}
                >
                    <NoteEditor />
                </div>
            </div>
        </div>
    );
};
