import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Loader2, ChevronDown, Check, Sparkles, PlusCircle, Plus, FilePlus, PanelRightOpen, PanelRightClose, SquarePen, Mic, Play, Tag, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../store/useChatStore';
import { useIntelligenceStore } from '../../store/useIntelligenceStore';
import { cn } from '../../../../shared/utils/cn';
import { ChatMessage } from './ChatMessage';
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
    const inputRef = useRef<HTMLTextAreaElement>(null);

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
            // 获取设置和模型
            chrome.storage.local.get<{ aiSettings?: AISettings; availableModels?: string[] }>(['aiSettings', 'availableModels'], (res) => {
                if (res.aiSettings) setAiSettings(res.aiSettings);

                // 智能合并可用模型：1. 存储在 availableModels 里的 2. settings 各个 provider 缓存里的
                const modelsFromProviders = res.aiSettings?.providers?.flatMap((p: any) => p.cachedModels || []) || [];
                const combinedModels = Array.from(new Set([...(res.availableModels || []), ...modelsFromProviders]));
                if (combinedModels.length > 0) setAvailableModels(combinedModels);
            });

            const handleStorage = (changes: any, area: string) => {
                if (area === 'local') {
                    if (changes.aiSettings) {
                        const newSettings = changes.aiSettings.newValue;
                        setAiSettings(newSettings);
                        // 同时刷新模型列表
                        const modelsFromProviders = newSettings?.providers?.flatMap((p: any) => p.cachedModels || []) || [];
                        setAvailableModels(prev => Array.from(new Set([...prev, ...modelsFromProviders])));
                    }
                    if (changes.availableModels) setAvailableModels(prev => Array.from(new Set([...prev, ...changes.availableModels.newValue])));
                }
            };
            chrome.storage.onChanged.addListener(handleStorage);
            return () => chrome.storage.onChanged.removeListener(handleStorage);
        }
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentSession?.messages, isGenerating]);

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [inputValue]);

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
        const newSettings = { ...aiSettings };
        if (!newSettings.workflowNodes) {
            newSettings.workflowNodes = (DEFAULT_AI_SETTINGS as any).workflowNodes;
        }

        // 更新工作流节点中的模型
        newSettings.workflowNodes.chat = {
            ...newSettings.workflowNodes.chat,
            model: model
        };

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
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors text-sm font-semibold text-zinc-400 group max-w-[200px]"
                        >
                            <span className="truncate">{aiSettings.workflowNodes?.chat?.model || "Select Model"}</span>
                            <ChevronDown size={14} className={cn("transition-transform shrink-0", showModelDropdown && "rotate-180")} />
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
                                                {aiSettings.workflowNodes?.chat?.model === m && <Check size={14} className="text-brand shrink-0" />}
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
                            <span>{t(`int_mode_${searchMode === 'rag' ? 'semantic' : searchMode}`)}</span>
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
                                        <span className="text-[10px] text-zinc-500">{t('int_mode_auto_desc')}</span>
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
                                        <span className="text-[10px] text-zinc-500">{t('int_mode_precise_desc')}</span>
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
                                        <span className="text-[10px] text-zinc-500">{t('int_mode_semantic_desc')}</span>
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
                    <div className="max-w-5xl mx-auto w-full py-8 space-y-10 px-6">
                        {currentSession.messages.map((msg) => (
                            <ChatMessage
                                key={msg.id}
                                msg={msg}
                                isGenerating={isGenerating}
                                statusMessage={statusMessage}
                                insertToNote={insertToNote}
                                t={t}
                            />
                        ))}
                        {isGenerating && statusMessage && (!currentSession?.messages.length || currentSession.messages[currentSession.messages.length - 1].role !== 'assistant') && (
                            <div className="flex items-center gap-2 py-1 text-zinc-500 italic animate-pulse text-[13px] font-medium">
                                <Loader2 size={13} className="animate-spin" />
                                {statusMessage}
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-10" />
                    </div>
                )
                }
            </div >

            {/* Input Area - ChatGPT Premium Style */}
            < div className="w-full max-w-5xl mx-auto px-6 pb-8 pt-2" >
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className={cn(
                        "relative flex flex-col rounded-[26px] bg-[#212121] border border-white/[0.08] shadow-2xl transition-all duration-300 group/input focus-within:border-zinc-500/50 focus-within:bg-[#262626]",
                        attachments.length > 0 && "pt-1"
                    )}
                >
                    {/* Attachments */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-white/[0.03] max-h-32 overflow-y-auto no-scrollbar">
                            {attachments.map(tweet => (
                                <div key={tweet.id} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl pl-2 pr-1.5 py-1.5 group/item transition-colors">
                                    <div className="w-5 h-5 rounded-full overflow-hidden border border-white/10 shrink-0">
                                        {(tweet.author as any)?.avatar || tweet.authorAvatarUrl ? <img src={(tweet.author as any)?.avatar || tweet.authorAvatarUrl} className="w-full h-full object-cover" /> : '👤'}
                                    </div>
                                    <span className="text-[12px] font-bold text-zinc-300 truncate max-w-[120px]">
                                        @{(tweet.author as any)?.handle || tweet.authorName || 'User'}
                                    </span>
                                    <button
                                        onClick={() => removeAttachment(tweet.id)}
                                        className="p-1 hover:bg-white/10 rounded-full transition-colors"
                                    >
                                        <Plus size={12} className="rotate-45 text-zinc-500 group-hover/item:text-zinc-300" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-end p-2 px-3 gap-2">
                        <button className="flex items-center justify-center w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all mb-1 shrink-0">
                            <Plus size={20} strokeWidth={2.5} />
                        </button>

                        <textarea
                            ref={inputRef}
                            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[15px] leading-relaxed text-zinc-100 py-2.5 px-1 max-h-60 resize-none no-scrollbar placeholder:text-zinc-600 font-medium"
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

                        <div className="flex items-center gap-1 mb-1 shrink-0">
                            <button
                                onClick={handleVoiceInput}
                                className={cn(
                                    "w-8 h-8 flex items-center justify-center rounded-full transition-all text-zinc-400 hover:text-white hover:bg-white/10",
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
                                    "w-8 h-8 flex items-center justify-center rounded-full transition-all duration-300",
                                    isGenerating || (!inputValue.trim() && attachments.length === 0)
                                        ? "bg-zinc-700/50 text-zinc-500"
                                        : "bg-white text-black hover:scale-105 active:scale-95 shadow-lg"
                                )}
                            >
                                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} strokeWidth={2.5} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div >
            {/* Floating Selection Tooltip */}
            {
                selectionInfo && (
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
                )
            }
        </div >
    );
};
