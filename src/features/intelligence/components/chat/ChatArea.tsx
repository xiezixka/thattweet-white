import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Loader2, ChevronDown, Check, Sparkles, PlusCircle, Plus, FilePlus, PanelRightOpen, PanelRightClose, SquarePen, Mic, Play, Tag, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../store/useChatStore';
import { useIntelligenceStore } from '../../store/useIntelligenceStore';
import { cn } from '../../../../shared/utils/cn';
import { TweetCard } from '../../../../shared/components/TweetCard';
import { AISettings, DEFAULT_AI_SETTINGS } from '../../../../shared/types/settings';
import { Tweet } from '../../../../shared/types/tweet';
import { useTranslation } from '../../../../shared/hooks/useTranslation';

export const ChatArea: React.FC = () => {
    const { currentSession, sendMessage, isGenerating, statusMessage, createSession, searchMode, setSearchMode, loadSessions } = useChatStore();
    const { isNoteOpen, toggleNote, insertToNote } = useIntelligenceStore();
    const { t } = useTranslation();



    const [inputValue, setInputValue] = useState('');
    const [attachments, setAttachments] = useState<Tweet[]>([]);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showSearchModeDropdown, setShowSearchModeDropdown] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
    const [selectionInfo, setSelectionInfo] = useState<{ text: string, x: number, y: number } | null>(null);
    const [isListening, setIsListening] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchModeRef = useRef<HTMLDivElement>(null);

    const handleTextSelection = () => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (text && text.length > 0) {
            const range = selection?.getRangeAt(0);
            const rect = range?.getBoundingClientRect();
            if (rect) {
                // Find containing element to ensure it's within a chat bubble
                let node = selection?.anchorNode as any;
                let isInsideAssistantBubble = false;
                while (node && node !== document.body) {
                    if (node.classList?.contains('assistant-bubble')) {
                        isInsideAssistantBubble = true;
                        break;
                    }
                    node = node.parentNode;
                }

                if (isInsideAssistantBubble) {
                    setSelectionInfo({
                        text,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 10
                    });
                } else {
                    setSelectionInfo(null);
                }
            }
        } else {
            setSelectionInfo(null);
        }
    };

    useEffect(() => {
        document.addEventListener('mouseup', handleTextSelection);
        return () => document.removeEventListener('mouseup', handleTextSelection);
    }, []);

    useEffect(() => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['aiSettings', 'availableModels'], (res) => {
                if (res.aiSettings) setAiSettings(res.aiSettings);
                if (res.availableModels) setAvailableModels(res.availableModels);
            });

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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentSession?.messages, isGenerating]);

    const handleSend = () => {
        if (!inputValue.trim() && attachments.length === 0) return;
        if (isGenerating) return;

        sendMessage(inputValue, attachments);
        setInputValue('');
        setAttachments([]);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        try {
            const tweetData = e.dataTransfer.getData('tweet');
            if (tweetData) {
                const tweet = JSON.parse(tweetData) as Tweet;
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
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ aiSettings: newSettings });
        }
        setShowModelDropdown(false);
    };

    const handleVoiceInput = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Your browser does not support voice recognition.");
            return;
        }

        if (isListening) return;

        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInputValue(prev => prev + transcript);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);

        recognition.start();
    };

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
            if (searchModeRef.current && !searchModeRef.current.contains(e.target as Node)) {
                setShowSearchModeDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0d0d0d] relative overflow-hidden">
            {/* Header - ChatGPT Style */}
            <header className="h-14 flex items-center justify-between px-4 z-20">
                <div className="flex items-center gap-2">
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setShowModelDropdown(!showModelDropdown)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-sm font-semibold text-zinc-400 group"
                        >
                            <span>{aiSettings.model || "Select Model"}</span>
                            <ChevronDown size={14} className={cn("transition-transform", showModelDropdown && "rotate-180")} />
                        </button>

                        {showModelDropdown && (
                            <div className="absolute top-full left-0 mt-1 w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in duration-200">
                                <div className="max-h-80 overflow-y-auto no-scrollbar">
                                    {availableModels.length > 0 ? (
                                        availableModels.map(m => (
                                            <button
                                                key={m}
                                                onClick={() => handleModelChange(m)}
                                                className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-white/5 text-zinc-300 transition-colors"
                                            >
                                                <span className="truncate">{m}</span>
                                                {aiSettings.model === m && <Check size={14} className="text-brand shrink-0" />}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-4 py-4 text-xs text-zinc-500 text-center italic">
                                            {t('int_no_models')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="h-4 w-px bg-white/10" />

                    <div className="relative" ref={searchModeRef}>
                        <button
                            onClick={() => setShowSearchModeDropdown(!showSearchModeDropdown)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-sm font-semibold group",
                                searchMode === 'auto' ? "text-yellow-500/80" : searchMode === 'structured' ? "text-emerald-500/80" : "text-blue-500/80"
                            )}
                        >
                            <Sparkles size={14} className={cn(searchMode === 'auto' && "animate-pulse")} />
                            <span className="capitalize">{searchMode}</span>
                            <ChevronDown size={14} className={cn("transition-transform", showSearchModeDropdown && "rotate-180")} />
                        </button>

                        {showSearchModeDropdown && (
                            <div className="absolute top-full left-0 mt-1 w-56 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in duration-200">
                                <button
                                    onClick={() => { setSearchMode('auto'); setShowSearchModeDropdown(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 text-zinc-300 transition-colors"
                                >
                                    <Sparkles size={16} className="text-yellow-500" />
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold">{t('int_mode_auto')}</span>
                                        <span className="text-[10px] text-zinc-500">智能切换 精确/语义</span>
                                    </div>
                                    {searchMode === 'auto' && <Check size={14} className="ml-auto text-brand" />}
                                </button>
                                <button
                                    onClick={() => { setSearchMode('structured'); setShowSearchModeDropdown(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 text-zinc-300 transition-colors"
                                >
                                    <PlusCircle size={16} className="text-emerald-500" />
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold">{t('int_mode_precise')}</span>
                                        <span className="text-[10px] text-zinc-500">仅限作者、分数等精确匹配</span>
                                    </div>
                                    {searchMode === 'structured' && <Check size={14} className="ml-auto text-brand" />}
                                </button>
                                <button
                                    onClick={() => { setSearchMode('rag'); setShowSearchModeDropdown(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 text-zinc-300 transition-colors"
                                >
                                    <Bot size={16} className="text-blue-500" />
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold">{t('int_mode_semantic')}</span>
                                        <span className="text-[10px] text-zinc-500">基于向量的语义相似度搜索</span>
                                    </div>
                                    {searchMode === 'rag' && <Check size={14} className="ml-auto text-brand" />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1">

                    {!isNoteOpen && (
                        <button
                            onClick={toggleNote}
                            className="p-2 text-zinc-400 hover:text-white transition-colors"
                            title={t('int_note_editor')}
                        >
                            <PanelRightOpen size={20} />
                        </button>
                    )}
                </div>
            </header>

            {/* Chat Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-0">
                {!currentSession || currentSession.messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-8 opacity-40">
                        <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center border border-brand/20">
                            <Bot className="text-brand" size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-white uppercase tracking-widest">{t('nav_intelligence')}</h3>
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto w-full py-8 space-y-10">
                        {currentSession.messages.map((msg) => (
                            <div key={msg.id} className={cn(
                                "group flex w-full",
                                msg.role === 'user' ? "justify-end" : "justify-start"
                            )}>
                                <div className={cn(
                                    "flex flex-col space-y-2 min-w-0 max-w-[85%]",
                                    msg.role === 'user' ? "items-end" : "items-start"
                                )}>
                                    <div className="relative w-full">
                                        <div className={cn(
                                            "prose prose-invert prose-brand max-w-none text-[15px] leading-relaxed",
                                            msg.role === 'user'
                                                ? "bg-zinc-800/50 border border-white/5 rounded-2xl px-4 py-3 text-zinc-200"
                                                : "bg-transparent assistant-bubble"
                                        )}>
                                            {msg.role === 'assistant' && !msg.content ? (
                                                <div className="flex flex-col gap-3 py-2">
                                                    <div className="flex items-center gap-3 text-zinc-400">
                                                        <div className="flex gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:-0.3s]" />
                                                            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:-0.15s]" />
                                                            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" />
                                                        </div>
                                                        <span className="text-sm font-medium tracking-tight bg-gradient-to-r from-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                                                            {statusMessage || t('int_thinking')}
                                                        </span>
                                                    </div>

                                                    {isGenerating && (
                                                        <div className="flex flex-col gap-1 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl animate-in fade-in slide-in-from-top-2 duration-500">
                                                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                                                                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                                                Search Path
                                                            </div>
                                                            <div className="text-xs text-zinc-400 flex items-center gap-2">
                                                                <Check size={10} className="text-emerald-500" />
                                                                正在分析 "{inputValue || currentSession?.messages[currentSession.messages.length - 1]?.content.slice(0, 20)}..."
                                                            </div>
                                                            {statusMessage?.includes('检索') && (
                                                                <div className="text-xs text-zinc-400 flex items-center gap-2 animate-in fade-in duration-300">
                                                                    <div className="w-2 h-2 rounded-full border border-zinc-600 border-t-zinc-300 animate-spin" />
                                                                    查找匹配的推文和语境...
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            )}
                                            {msg.isStreaming && msg.content && (
                                                <span className="inline-block w-1.5 h-4 ml-1 bg-brand animate-pulse align-middle" />
                                            )}
                                        </div>

                                        {/* AI Actions */}
                                        {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                                            <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => insertToNote('text', msg.content)}
                                                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-white/10"
                                                >
                                                    <FilePlus size={12} />
                                                    {t('int_add_to_note')}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Citations (Updated Visuals) */}
                                    {msg.citations && msg.citations.length > 0 && !msg.isStreaming && (
                                        <div className="space-y-3 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                            {msg.role === 'assistant' && (
                                                <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="h-px bg-white/5 flex-1" />
                                                    {t('int_sources')}
                                                    <div className="h-px bg-white/5 flex-1" />
                                                </div>
                                            )}
                                            <div className={cn(
                                                "grid gap-3",
                                                msg.role === 'user' ? "flex flex-wrap" : "grid-cols-1 md:grid-cols-2"
                                            )}>
                                                {msg.citations.map((tweet) => {
                                                    const author = (tweet.author as any) || {};
                                                    const hasMedia = tweet.media && tweet.media.length > 0;
                                                    const firstMedia = hasMedia ? tweet.media[0] : null;

                                                    // Media handling
                                                    const previewUrl = firstMedia?.previewUrl || (firstMedia?.type === 'image' ? firstMedia.url : '');
                                                    let thumbnailUrl = previewUrl;
                                                    if (thumbnailUrl && thumbnailUrl.includes('pbs.twimg.com') && !thumbnailUrl.includes('?')) {
                                                        thumbnailUrl += '?format=jpg&name=small';
                                                    }

                                                    // Relevance Score
                                                    const relevance = (tweet as any).relevanceScore || 0;

                                                    if (msg.role === 'user') {
                                                        return (
                                                            <div key={tweet.id} className="flex items-center gap-1.5 bg-white/5 border border-white/5 rounded-full px-2.5 py-1 text-zinc-400 text-[10px]">
                                                                <div className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 border border-white/10">
                                                                    {author.avatar || tweet.authorAvatarUrl ? <img src={author.avatar || tweet.authorAvatarUrl} className="w-full h-full object-cover" /> : <User size={10} />}
                                                                </div>
                                                                <span className="truncate max-w-[120px]">@{author.handle || tweet.authorName || 'User'}</span>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            key={tweet.id}
                                                            onClick={(e) => {
                                                                // Prevent card click if clicking buttons
                                                                window.open(tweet.tweetUrl, '_blank');
                                                            }}
                                                            className="group relative flex flex-col p-3 bg-zinc-900/40 hover:bg-zinc-800/60 rounded-xl border border-white/5 hover:border-white/10 transition-all cursor-pointer overflow-hidden"
                                                        >
                                                            {/* Header */}
                                                            <div className="flex items-center gap-2 mb-2 relative z-10">
                                                                <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800 shrink-0 border border-white/10">
                                                                    {author.avatar || tweet.authorAvatarUrl ? (
                                                                        <img src={author.avatar || tweet.authorAvatarUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold text-[8px] bg-zinc-800">
                                                                            {(author.name || tweet.authorName || 'U')[0]}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-col min-w-0 flex-1 leading-none">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-[11px] font-bold text-zinc-200 truncate max-w-[100px]">
                                                                            {author.name || tweet.authorName || 'Unknown'}
                                                                        </span>
                                                                        <span className="text-[10px] text-zinc-500 truncate">
                                                                            @{author.handle || 'unknown'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                {tweet.savedAt && (
                                                                    <div className="text-[9px] text-zinc-600 font-mono">
                                                                        {new Date(tweet.savedAt).toLocaleDateString()}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Body */}
                                                            <div className={cn(
                                                                "text-[11px] text-zinc-400 leading-relaxed mb-2 break-words relative z-10",
                                                                hasMedia ? "line-clamp-3" : "line-clamp-10"
                                                            )}>
                                                                {tweet.text}
                                                            </div>

                                                            {/* Media */}
                                                            {hasMedia && thumbnailUrl && (
                                                                <div className="aspect-video w-full rounded-lg bg-black/50 overflow-hidden relative mb-2 border border-white/5 z-10 grid place-items-center">
                                                                    <img src={thumbnailUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                                                                    {firstMedia?.type === 'video' && (
                                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                                            <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center border border-white/20">
                                                                                <Play size={10} fill="white" className="ml-0.5 text-white" />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Footer */}
                                                            <div className="flex items-center justify-between mt-auto pt-1 relative z-10">
                                                                <div className="flex items-center gap-1.5 overflow-hidden">
                                                                    {tweet.tags && tweet.tags.slice(0, 2).map((tag, i) => (
                                                                        <span key={i} className="px-1.5 py-0.5 rounded bg-brand/5 text-brand text-[9px] border border-brand/10 truncate max-w-[60px]">
                                                                            #{tag}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <div className="flex items-center gap-3 shrink-0 ml-auto">
                                                                    {tweet.aiScore !== undefined && tweet.aiScore > 0 && (
                                                                        <span className="text-[9px] font-bold italic text-zinc-500">
                                                                            Ask {tweet.aiScore}
                                                                        </span>
                                                                    )}
                                                                    {relevance > 0 && (
                                                                        <span className="text-[9px] font-mono text-emerald-500/80">
                                                                            {relevance}%
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Action Button */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    insertToNote('tweet', tweet);
                                                                }}
                                                                className="absolute top-2 right-2 p-1.5 bg-brand text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110 active:scale-95 z-20"
                                                                title={t('int_add_to_note')}
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isGenerating && statusMessage && (!currentSession?.messages.length || currentSession.messages[currentSession.messages.length - 1].role !== 'assistant') && (
                            <div className="flex items-center gap-2 py-1 text-zinc-500 italic animate-pulse text-[13px] font-medium">
                                <Loader2 size={13} className="animate-spin" />
                                {statusMessage}
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-10" />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="w-full max-w-3xl mx-auto px-4 pb-6 pt-2">
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className={cn(
                        "relative flex flex-col rounded-2xl bg-[#1a1a1a] border border-white/10 focus-within:border-brand/30 focus-within:ring-4 focus-within:ring-brand/5 shadow-2xl transition-all group/input",
                        attachments.length > 0 && "pt-1"
                    )}
                >
                    {/* Attachments */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-white/5 max-h-32 overflow-y-auto no-scrollbar">
                            {attachments.map(tweet => (
                                <div key={tweet.id} className="flex items-center gap-1.5 bg-white/5 rounded-lg pl-1.5 pr-1 py-1 group/item">
                                    <div className="w-4 h-4 rounded-full overflow-hidden border border-white/10 shrink-0">
                                        {(tweet.author as any)?.avatar || tweet.authorAvatarUrl ? <img src={(tweet.author as any)?.avatar || tweet.authorAvatarUrl} className="w-full h-full object-cover" /> : '👤'}
                                    </div>
                                    <span className="text-[11px] font-bold text-zinc-400 truncate max-w-[100px]">
                                        @{(tweet.author as any)?.handle || tweet.authorName || 'User'}
                                    </span>
                                    <button
                                        onClick={() => removeAttachment(tweet.id)}
                                        className="p-0.5 hover:bg-white/10 rounded transition-colors"
                                    >
                                        <Plus size={10} className="rotate-45 text-zinc-500" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-end p-2 px-3 gap-2">
                        <button className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors mb-0.5">
                            <Plus size={18} />
                        </button>
                        <textarea
                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-zinc-200 py-1.5 max-h-40 resize-none no-scrollbar placeholder:text-zinc-600"
                            placeholder={attachments.length > 0 ? t('int_ask_with_attachments') : t('int_chat_placeholder')}
                            rows={1}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <button
                            onClick={handleVoiceInput}
                            className={cn(
                                "p-2 rounded-xl transition-all mb-0.5 text-zinc-500 hover:bg-white/5",
                                isListening && "text-red-500 bg-red-500/10 animate-pulse"
                            )}
                            title="Voice Input"
                        >
                            <Mic size={18} />
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={isGenerating || (!inputValue.trim() && attachments.length === 0)}
                            className={cn(
                                "p-2 rounded-xl transition-all mb-0.5",
                                isGenerating || (!inputValue.trim() && attachments.length === 0)
                                    ? "bg-zinc-800 text-zinc-600"
                                    : "bg-white text-black hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                            )}
                        >
                            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                    </div>
                </div>
            </div>
            {/* Floating Selection Tooltip */}
            {selectionInfo && (
                <div
                    style={{
                        position: 'fixed',
                        left: `${selectionInfo.x}px`,
                        top: `${selectionInfo.y}px`,
                        transform: 'translate(-50%, -100%)',
                    }}
                    className="z-[1000] flex items-center gap-1 p-1 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200"
                >
                    <button
                        onClick={() => {
                            insertToNote('text', selectionInfo.text);
                            setSelectionInfo(null);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/5 text-zinc-200 text-xs font-semibold rounded-lg transition-colors"
                    >
                        <Sparkles size={14} className="text-brand" />
                        插入笔记
                    </button>
                    <div className="w-px h-4 bg-white/10" />
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(selectionInfo.text);
                            setSelectionInfo(null);
                        }}
                        className="px-3 py-1.5 hover:bg-white/5 text-zinc-400 text-xs font-semibold rounded-lg transition-colors"
                    >
                        复制
                    </button>
                    <button
                        onClick={() => setSelectionInfo(null)}
                        className="p-1.5 hover:bg-white/5 text-zinc-500 rounded-lg transition-colors"
                    >
                        <Plus size={14} className="rotate-45" />
                    </button>
                </div>
            )}
        </div>
    );
};
