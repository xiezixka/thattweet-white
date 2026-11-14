import React from 'react';
import { MessageSquare, Plus, Search, Trash2, Library, Loader2, Sparkles, Filter, SquarePen } from 'lucide-react';
import { cn } from '../../../../shared/utils/cn';
import { useChatStore } from '../../store/useChatStore';
import { useSearchStore } from '../../store/useSearchStore';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import { useTweets } from '../../../../shared/hooks/useTweets';
import { Tweet } from '../../../../shared/types/tweet';

export const Sidebar: React.FC<{ onSelectChat?: () => void; onAttachTweet?: (tweet: Tweet) => void }> = ({ onSelectChat, onAttachTweet }) => {
    const { sessions, currentSessionId, createSession, switchSession, deleteSession } = useChatStore();
    const { query, results, isSearching, activeTab, setQuery, setActiveTab, performSearch } = useSearchStore();
    const { tweets, loading: tweetsLoading } = useTweets();
    const { t } = useTranslation();

    const displayLibrary = query.trim() === '' ? tweets.map(t => ({ tweet: t })) : results;

    // Real-time search with debounce
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                performSearch();
                setActiveTab('library');
            } else {
                setActiveTab('chats');
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [query, performSearch, setActiveTab]);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - timestamp;
        if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (diff < 172800000) return 'Yesterday';
        return date.toLocaleDateString();
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    };

    const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

    // Reset delete confirmation after 3s
    React.useEffect(() => {
        if (deleteConfirmId) {
            const timer = setTimeout(() => setDeleteConfirmId(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [deleteConfirmId]);

    const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (deleteConfirmId === sessionId) {
            deleteSession(sessionId);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(sessionId);
        }
    };

    return (
        <aside className="w-[280px] bg-[#0d0d0d] flex flex-col h-full shrink-0 relative z-30 border-r border-white/5">
            {/* Header / New Chat */}
            <div className="p-4" title={t('int_new_chat')}>
                <button
                    onClick={() => { createSession(); onSelectChat?.(); }}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-white/5 text-zinc-100 transition-all border border-white/5 group"
                >
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                            <Plus size={14} className="text-white" />
                        </div>
                        <span className="text-sm font-medium">{t('int_new_chat')}</span>
                    </div>
                    <SquarePen size={16} className="text-zinc-600 group-hover:text-zinc-400" />
                </button>
            </div>

            {/* Global Search Bar */}
            <div className="px-4 mb-4">
                <div className="relative group">
                    <div className="absolute left-3 top-2.5 flex items-center gap-2 pointer-events-none">
                        {isSearching ? <Loader2 size={13} className="animate-spin text-brand" /> : <Search className="text-zinc-600 group-focus-within:text-brand transition-colors" size={13} />}
                    </div>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder={t('int_search_library_placeholder')}
                        className="w-full bg-white/[0.03] border border-white/5 rounded-xl py-2 px-9 text-xs text-zinc-300 focus:outline-none focus:border-brand/40 transition-all placeholder:text-zinc-600"
                    />
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="px-4 pb-2 flex gap-1">
                <button
                    onClick={() => setActiveTab('chats')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
                        activeTab === 'chats' ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    {t('nav_intelligence')}
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
                        activeTab === 'library' || results.length > 0 ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    {t('popup_captured')} {tweets.length > 0 && `(${tweets.length})`}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                {activeTab === 'chats' ? (
                    sessions.length > 0 ? (
                        sessions.map(session => (
                            <div
                                key={session.id}
                                onClick={() => { switchSession(session.id); onSelectChat?.(); }}
                                className={cn(
                                    "group flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                                    currentSessionId === session.id
                                        ? "bg-white/5 border-white/10"
                                        : "border-transparent hover:bg-white/[0.03] opacity-60 hover:opacity-100"
                                )}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className={cn("text-[13px] font-medium truncate", currentSessionId === session.id ? "text-white" : "text-zinc-300")}>
                                        {session.title}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    className={cn(
                                        "opacity-0 group-hover:opacity-100 p-1 transition-all rounded-md flex items-center gap-1",
                                        deleteConfirmId === session.id
                                            ? "bg-red-500 text-white px-2 scale-105"
                                            : "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                    )}
                                >
                                    {deleteConfirmId === session.id ? (
                                        <>
                                            <Trash2 size={12} />
                                            <span className="text-[10px] font-bold">SHAN</span>
                                        </>
                                    ) : (
                                        <Trash2 size={12} />
                                    )}
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="h-40 flex flex-col items-center justify-center text-zinc-600 space-y-2 opacity-30">
                            <span className="text-xs italic">No history</span>
                        </div>
                    )
                ) : (
                    displayLibrary.length > 0 ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                                <span>{query.trim() === '' ? t('popup_recent') : t('int_sources')}</span>
                                <Filter size={10} />
                            </div>
                            {displayLibrary.map(res => (
                                <div
                                    key={res.tweet.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('tweet', JSON.stringify(res.tweet));
                                    }}
                                    className="group p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-brand/30 hover:bg-brand/5 transition-all cursor-grab active:cursor-grabbing"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-5 h-5 rounded-full bg-zinc-800 border border-white/10 overflow-hidden shrink-0">
                                            {(res.tweet.author as any)?.avatar ? <img src={(res.tweet.author as any).avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px]">👤</div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold text-zinc-200 truncate leading-none">
                                                {(res.tweet.author as any)?.name || (res.tweet.author as any)?.handle || 'Unknown'}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed group-hover:text-zinc-200 transition-colors">
                                        {res.tweet.text}
                                    </p>
                                    {onAttachTweet && <button type="button" className="mt-3 px-3 py-2 text-sm text-brand border border-brand/30 rounded-lg" onClick={() => onAttachTweet(res.tweet)}>附加到聊天</button>}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-30">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center">
                                <Search size={20} className="text-zinc-600" />
                            </div>
                            <h4 className="text-xs font-bold text-white mb-1">{t('int_search_library_placeholder')}</h4>
                        </div>
                    )
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 flex items-center justify-between opacity-30 hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-mono text-zinc-500">v3.0.2 INTELLIGENCE</span>
                <Sparkles size={12} className="text-brand" />
            </div>
        </aside>
    );
};
