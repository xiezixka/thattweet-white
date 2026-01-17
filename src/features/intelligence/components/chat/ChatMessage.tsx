import React, { useState } from 'react';
import { User, FilePlus, Brain, ChevronDown, Check, Sparkles, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TweetCard } from '../../../../shared/components/TweetCard';
import { cn } from '../../../../shared/utils/cn';
import { ChatMessage as MessageType } from '../../store/useChatStore';

interface ChatMessageProps {
    msg: MessageType;
    isGenerating: boolean;
    statusMessage: string | null;
    insertToNote: (type: 'text' | 'tweet', content: any) => void;
    t: (key: string) => string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ msg, isGenerating, statusMessage, insertToNote, t }) => {
    // Default collapsed if it has content, expanded if specifically looking at it or user preference?
    // Let's default to collapsed to "not occupy too much space"
    const [isThinkingOpen, setIsThinkingOpen] = useState(false);

    // Parse <think> tags if present (for DeepSeek R1 style models)
    const thinkMatch = msg.content?.match(/<think>([\s\S]*?)<\/think>/);
    const thinkContent = thinkMatch ? thinkMatch[1] : null;
    const displayContent = msg.content?.replace(/<think>[\s\S]*?<\/think>/, '').trim() || msg.content;

    const hasCitations = msg.citations && msg.citations.length > 0;
    const hasThinking = Boolean(thinkContent || hasCitations);

    // If we are currently streaming this message (is last and generating) and have no content yet, show status
    const isThinkingProcess = msg.role === 'assistant' && !msg.content && isGenerating;

    if (msg.role === 'user') {
        return (
            <div className="group flex w-full justify-end">
                <div className="flex flex-col space-y-2 min-w-0 items-end max-w-[85%] ml-auto">
                    <div className="relative w-full">
                        <div className="prose prose-invert prose-brand max-w-none text-[15px] leading-relaxed bg-zinc-800/50 border border-white/5 rounded-2xl px-4 py-3 text-zinc-200">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="group flex w-full justify-start">
            <div className="flex flex-col space-y-2 min-w-0 items-start max-w-full w-full">

                {/* Visual "Thinking" Block (Collapsible) */}
                {(hasThinking || isThinkingProcess) && (
                    <div className="w-full mb-2">
                        <button
                            onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                            disabled={isThinkingProcess}
                            className="flex items-center gap-2.5 py-2 px-1 w-full text-left group/think opacity-70 hover:opacity-100 transition-opacity"
                        >
                            {/* Circle Icon */}
                            <div className="relative flex items-center justify-center">
                                {isThinkingProcess ? (
                                    <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-zinc-600 border-t-zinc-300 animate-spin" />
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-zinc-600 group-hover/think:border-zinc-400 flex items-center justify-center">
                                        {isThinkingOpen && <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />}
                                    </div>
                                )}
                            </div>

                            {/* Text */}
                            <div className="text-[13px] font-medium text-zinc-400 flex items-center gap-2">
                                <span>{isThinkingProcess ? (statusMessage || "Thinking...") : "Deep Thinking"}</span>
                                {!isThinkingProcess && hasCitations && (
                                    <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded-md">
                                        {msg.citations?.length} Sources
                                    </span>
                                )}
                            </div>

                            {!isThinkingProcess && (
                                <ChevronDown
                                    size={12}
                                    className={cn("text-zinc-600 ml-auto transition-transform duration-300", isThinkingOpen && "rotate-180")}
                                />
                            )}
                        </button>

                        {/* Expanded Content */}
                        <div className={cn(
                            "grid transition-all duration-300 ease-in-out overflow-hidden",
                            isThinkingOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
                        )}>
                            <div className="min-h-0">
                                {/* Inner Thinking Text (DeepSeek R1 style) */}
                                {thinkContent && (
                                    <div className="px-4 py-3 mb-4 rounded-xl bg-zinc-900/50 border border-white/5 text-zinc-400 text-sm font-mono leading-relaxed whitespace-pre-wrap">
                                        {thinkContent}
                                    </div>
                                )}

                                {/* Citations Carousel */}
                                {hasCitations && (
                                    <div className="w-full min-w-0 overflow-hidden -mx-6">
                                        <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-2 px-6 mb-3">
                                            <div className="h-px bg-white/5 flex-1" />
                                            {t('int_sources')}
                                            <div className="h-px bg-white/5 flex-1" />
                                        </div>
                                        <div className="flex overflow-x-auto pb-6 gap-4 scroll-smooth touch-pan-x px-6 no-scrollbar overscroll-x-contain">
                                            {msg.citations?.map((tweet) => (
                                                <div key={tweet.id} className="relative group/citation shrink-0 w-[280px] md:w-[320px]">
                                                    <TweetCard
                                                        tweet={{
                                                            ...tweet,
                                                            aiScore: (tweet as any).relevanceScore
                                                        }}
                                                        author={(tweet.author as any) || {}}
                                                        mode="citation"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Response Content */}
                {displayContent && (
                    <div className="relative w-full">
                        <div className="prose prose-invert prose-brand max-w-none text-[15px] leading-relaxed bg-transparent assistant-bubble text-zinc-200">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {displayContent}
                            </ReactMarkdown>
                        </div>

                        {!msg.isStreaming && (
                            <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => insertToNote('text', displayContent)}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-white/10"
                                >
                                    <FilePlus size={12} />
                                    {t('int_add_to_note')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
