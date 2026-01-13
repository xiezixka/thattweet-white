import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Loader2, ChevronDown, Check, Sparkles, PlusCircle, Plus, FilePlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../store/useChatStore';
import { useIntelligenceStore } from '../../store/useIntelligenceStore';
import { cn } from '../../../../shared/utils/cn';
import { TweetCard } from '../../../../shared/components/TweetCard';
import { AISettings, DEFAULT_AI_SETTINGS } from '../../../../shared/types/settings';
import { Tweet } from '../../../../shared/types/tweet';

export const ChatArea: React.FC = () => {
    const { currentSession, sendMessage, isGenerating, statusMessage } = useChatStore();
    const { insertToNote } = useIntelligenceStore();
    const [inputValue, setInputValue] = useState('');
    const [attachments, setAttachments] = useState<Tweet[]>([]);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Initial load
    useEffect(() => {
        // @ts-ignore
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['aiSettings', 'availableModels'], (res) => {
                if (res.aiSettings) setAiSettings(res.aiSettings);
                if (res.availableModels) setAvailableModels(res.availableModels);
            });

            // Listen for model changes
            const handleStorage = (changes: any, area: string) => {
                if (area === 'local') {
                    if (changes.aiSettings) setAiSettings(changes.aiSettings.newValue);
                    if (changes.availableModels) setAvailableModels(changes.availableModels.newValue);
                }
            };
            chrome.storage.onChanged.addListener(handleStorage);
            return () => chrome.storage.onChanged.removeListener(handleStorage);
        }
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [currentSession?.messages, isGenerating]);

    const handleSend = () => {
        if (!inputValue.trim() && attachments.length === 0) return;
        if (isGenerating) return;

        sendMessage(inputValue, attachments); // 把附件也带过去
        setInputValue('');
        setAttachments([]); // 清空附件
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        try {
            const tweetData = e.dataTransfer.getData('tweet');
            if (tweetData) {
                const tweet = JSON.parse(tweetData) as Tweet;
                // 避免重复添加
                if (!attachments.find(a => a.id === tweet.id)) {
                    setAttachments(prev => [...prev, tweet]);
                }
            }
        } catch (err) {
            console.error('Failed to parse dropped tweet:', err);
        }
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const handleModelChange = (model: string) => {
        const newSettings = { ...aiSettings, model };
        setAiSettings(newSettings);
        // @ts-ignore
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ aiSettings: newSettings });
        }
        setShowModelDropdown(false);
    };

    // Close dropdown on click outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden">
            {/* Header with Model Switcher (ChatGPT Style) */}
            <header className="h-14 border-b border-white/5 flex items-center px-4 bg-zinc-950/80 backdrop-blur-md z-20">
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-sm font-semibold text-zinc-200 group"
                    >
                        <span className="text-zinc-400 group-hover:text-brand transition-colors">
                            {aiSettings.model?.includes('gpt') ? <Sparkles size={16} /> : <Bot size={16} />}
                        </span>
                        {aiSettings.model || "Select Model"}
                        <ChevronDown size={14} className={cn("text-zinc-500 transition-transform", showModelDropdown && "rotate-180")} />
                    </button>

                    {showModelDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-72 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl py-2 overflow-hidden z-50 animate-in fade-in zoom-in duration-200">
                            <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Available Models</div>
                            <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                {availableModels.length > 0 ? (
                                    availableModels.map(m => (
                                        <button
                                            key={m}
                                            onClick={() => handleModelChange(m)}
                                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/5 text-zinc-300 transition-colors"
                                        >
                                            <span className="truncate">{m}</span>
                                            {aiSettings.model === m && <Check size={14} className="text-brand shrink-0" />}
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-4 py-4 text-xs text-zinc-500 text-center italic">
                                        No models loaded. Please go to Settings to verify your API Key.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right side actions - New Chat */}
                <div className="ml-auto">
                    <button className="p-2 text-zinc-400 hover:text-white transition-colors" title="New Thread">
                        <PlusCircle size={20} />
                    </button>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth scrollbar-thin scrollbar-thumb-white/10">
                {!currentSession || currentSession.messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-8 opacity-40">
                        <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center border border-brand/20">
                            <Sparkles className="text-brand" size={32} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white"> intelligence suite </h3>
                            <p className="text-sm text-zinc-400 max-w-xs mx-auto mt-2">
                                问我关于你保存的推文的任何问题，我会基于你的本地知识库进行回答。
                            </p>
                        </div>
                    </div>
                ) : (
                    currentSession.messages.map((msg) => (
                        <div key={msg.id} className={cn(
                            "group flex gap-4 max-w-4xl mx-auto w-full",
                            msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                        )}>
                            <div className={cn(
                                "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border",
                                msg.role === 'user'
                                    ? "bg-brand/10 border-brand/20 text-brand"
                                    : "bg-zinc-800 border-white/10 text-zinc-400"
                            )}>
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>

                            <div className={cn(
                                "flex flex-col space-y-2 max-w-[85%]",
                                msg.role === 'user' ? "items-end" : "items-start"
                            )}>
                                <div className={cn(
                                    "relative group/msg px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-full",
                                    msg.role === 'user'
                                        ? "bg-brand text-white shadow-md shadow-brand/10 border border-brand/20"
                                        : "bg-zinc-900/50 text-zinc-200 border border-white/5"
                                )}>
                                    {msg.role === 'assistant' ? (
                                        <>
                                            <div className="prose prose-invert prose-brand max-w-none prose-sm prose-p:leading-relaxed">
                                                {msg.content ? (
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                ) : (
                                                    <div className="flex items-center gap-2 py-1 text-zinc-500 italic animate-pulse text-[13px]">
                                                        <Loader2 size={12} className="animate-spin" />
                                                        {statusMessage || '思考中...'}
                                                    </div>
                                                )}
                                                {msg.isStreaming && msg.content && (
                                                    <span className="inline-block w-1.5 h-4 ml-1 bg-brand animate-pulse align-middle" />
                                                )}
                                            </div>
                                            {/* Action Bar for AI Messages */}
                                            {!msg.isStreaming && msg.content && (
                                                <div className="absolute top-0 -right-10 opacity-0 group-hover/msg:opacity-100 transition-all">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            insertToNote('text', msg.content);
                                                        }}
                                                        className="p-1.5 bg-zinc-900 border border-white/10 rounded-lg text-zinc-400 hover:text-brand hover:border-brand/40 transition-all shadow-xl"
                                                        title="Add to Note"
                                                    >
                                                        <FilePlus size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                                    )}
                                </div>

                                {/* Citations Display */}
                                {msg.citations && msg.citations.length > 0 && (
                                    <div className={cn("w-full mt-1.5", msg.role === 'user' ? "flex flex-wrap gap-1.5 justify-end" : "space-y-3")}>
                                        {msg.role === 'assistant' && (
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1 mt-4">
                                                <span className="w-4 h-[1px] bg-zinc-800"></span>
                                                Sources
                                            </div>
                                        )}

                                        {msg.role === 'user' ? (
                                            /* User side: Compact Pills */
                                            msg.citations.map((tweet) => (
                                                <div
                                                    key={tweet.id}
                                                    className="flex items-center gap-1.5 bg-brand-hover/20 border border-white/5 rounded-full pl-1 px-2.5 py-1 text-zinc-300 text-[10px] font-medium"
                                                >
                                                    <div className="w-3.5 h-3.5 rounded-full bg-zinc-800 overflow-hidden border border-white/10 shrink-0">
                                                        {tweet.authorAvatarUrl ? <img src={tweet.authorAvatarUrl} className="w-full h-full object-cover" /> : '👤'}
                                                    </div>
                                                    <span className="truncate max-w-[100px]">
                                                        @{tweet.authorName || (typeof tweet.author === 'string' ? tweet.author : (tweet.author as any)?.handle) || 'User'}
                                                    </span>
                                                </div>
                                            ))
                                        ) : (
                                            /* Assistant side: Full Fidelity TweetCards with Note Action */
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                                                {msg.citations.map((tweet) => (
                                                    <div
                                                        key={tweet.id}
                                                        className="relative group/card"
                                                    >
                                                        <div
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('tweet', JSON.stringify(tweet));
                                                                e.dataTransfer.effectAllowed = 'copy';
                                                            }}
                                                            className="transform transition-all active:scale-95 cursor-grab active:cursor-grabbing border border-white/5 hover:border-brand/30 bg-zinc-900/40 rounded-2xl overflow-hidden shadow-2xl"
                                                        >
                                                            <TweetCard tweet={tweet} author={tweet.author as any} />
                                                        </div>
                                                        <button
                                                            onClick={() => insertToNote('tweet', tweet)}
                                                            className="absolute top-2 right-2 p-1.5 bg-brand text-white rounded-lg opacity-0 group-hover/card:opacity-100 transition-all shadow-lg hover:scale-110 active:scale-90"
                                                            title="Add to Note"
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}

                {/* Minimal Status Tracking (Only show if not already in a message) */}
                {isGenerating && statusMessage && (!currentSession?.messages.length || currentSession.messages[currentSession.messages.length - 1].role !== 'assistant') && (
                    <div className="flex gap-4 max-w-4xl mx-auto w-full animate-in fade-in duration-300">
                        <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-zinc-800 border border-white/10 text-zinc-400">
                            <Bot size={16} />
                        </div>
                        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900/50 border border-white/5 rounded-2xl">
                            <Loader2 className="animate-spin text-brand" size={12} />
                            <span className="text-[11px] font-medium text-zinc-400 tracking-wide">
                                {statusMessage}
                            </span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Wrapper */}
            <div className="p-4 bg-zinc-950 border-t border-white/5">
                <div
                    className="max-w-4xl mx-auto relative group bg-zinc-900 border border-white/10 rounded-2xl transition-all focus-within:border-brand/40"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                >
                    {/* Attachments Area */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 pb-0">
                            {attachments.map(tweet => (
                                <div
                                    key={tweet.id}
                                    className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-lg pl-1.5 pr-1 py-1 group/pill hover:bg-white/10 transition-colors"
                                >
                                    <div className="w-4 h-4 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-[8px] border border-white/10 shrink-0">
                                        {tweet.authorAvatarUrl ? <img src={tweet.authorAvatarUrl} className="w-full h-full object-cover" /> : '👤'}
                                    </div>
                                    <span className="text-[11px] font-bold text-zinc-400 truncate max-w-[100px]">
                                        @{tweet.authorName || (typeof tweet.author === 'string' ? tweet.author : (tweet.author as any)?.handle) || 'User'}
                                    </span>
                                    <button
                                        onClick={() => removeAttachment(tweet.id)}
                                        className="p-0.5 hover:bg-red-500/20 hover:text-red-400 rounded text-zinc-600 transition-all"
                                    >
                                        <Plus className="rotate-45" size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <textarea
                        rows={1}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={attachments.length > 0 ? "Ask about these tweets..." : "Message intelligence or drop tweets here..."}
                        className="w-full bg-transparent p-4 pr-12 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-all resize-none overflow-hidden max-h-40 min-h-[56px]"
                    />
                    <button
                        onClick={handleSend}
                        disabled={(!inputValue.trim() && attachments.length === 0) || isGenerating}
                        className="absolute right-3 bottom-3 w-8 h-8 flex items-center justify-center bg-brand text-white rounded-xl shadow-lg shadow-brand/20 disabled:opacity-50 disabled:bg-zinc-700 transition-all active:scale-90"
                    >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
                <p className="text-[10px] text-center text-zinc-600 mt-2">
                    ThatTweet Intelligence may hallucinate. Consider checking important information.
                </p>
            </div>
        </div>
    );
};
