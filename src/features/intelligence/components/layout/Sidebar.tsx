import React from 'react';
import { MessageSquare, Plus, Search, Trash2, Library, Loader2, Sparkles, Filter } from 'lucide-react';
import { cn } from '../../../../shared/utils/cn';
import { useChatStore } from '../../store/useChatStore';
import { useSearchStore } from '../../store/useSearchStore';

export const Sidebar: React.FC = () => {
    const { sessions, currentSessionId, createSession, switchSession, deleteSession } = useChatStore();
    const { query, results, isSearching, activeTab, setQuery, setActiveTab, performSearch } = useSearchStore();

    // Real-time search with debounce
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                performSearch();
                setActiveTab('library'); // 搜索时自动切换到库
            } else {
                setActiveTab('chats'); // 清空搜索时切回会话
            }
        }, 150); // 缩短延迟到 150ms，感觉更实时
        return () => clearTimeout(timer);
    }, [query, performSearch, setActiveTab]);

    // 格式化时间
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

    return (
        <aside className="w-[280px] bg-zinc-950 flex flex-col border-r border-white/5 h-full shrink-0 relative z-30">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-950/50 backdrop-blur-md">
                <span className="font-bold text-zinc-100 text-xs tracking-[0.2em] uppercase opacity-70">Intelligence</span>
                <button
                    onClick={() => createSession()}
                    className="p-1.5 hover:bg-brand/10 rounded-lg text-zinc-400 hover:text-brand transition-all active:scale-90"
                    title="New Chat"
                >
                    <Plus size={16} />
                </button>
            </div>

            {/* Global Search Bar */}
            <div className="p-4">
                <div className="relative group">
                    <div className="absolute left-3 top-2.5 flex items-center gap-2 pointer-events-none">
                        {isSearching ? <Loader2 size={13} className="animate-spin text-brand" /> : <Search className="text-zinc-600 group-focus-within:text-brand transition-colors" size={13} />}
                    </div>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search chats or library..."
                        className="w-full bg-white/[0.03] border border-white/5 rounded-xl py-2.5 pl-9 pr-3 text-xs text-zinc-300 focus:outline-none focus:border-brand/40 focus:bg-white/[0.05] transition-all placeholder:text-zinc-600 shadow-inner"
                    />
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="px-4 pb-2 flex gap-1">
                <button
                    onClick={() => setActiveTab('chats')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
                        activeTab === 'chats' ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                    )}
                >
                    <MessageSquare size={13} />
                    Chats
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
                        activeTab === 'library' || results.length > 0 ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                    )}
                >
                    <Library size={13} />
                    Library {results.length > 0 && `(${results.length})`}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-white/5">
                {activeTab === 'chats' ? (
                    // 1. Session List
                    sessions.length > 0 ? (
                        sessions.map(session => (
                            <div
                                key={session.id}
                                onClick={() => switchSession(session.id)}
                                className={cn(
                                    "group flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                                    currentSessionId === session.id
                                        ? "bg-brand/5 border-brand/20 shadow-lg shadow-brand/5"
                                        : "border-transparent hover:bg-white/[0.03] hover:border-white/5 opacity-60 hover:opacity-100"
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                                    currentSessionId === session.id ? "bg-brand text-white" : "bg-zinc-900 text-zinc-500 group-hover:text-zinc-300"
                                )}>
                                    <MessageSquare size={14} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={cn("text-sm font-medium truncate", currentSessionId === session.id ? "text-white" : "text-zinc-300")}>
                                        {session.title}
                                    </div>
                                    <div className="text-zinc-600 text-[10px] mt-0.5 tracking-tight font-medium uppercase font-mono">
                                        {formatTime(session.updatedAt)}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-500 hover:text-red-400 transition-all hover:bg-red-500/10 rounded-lg"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="h-40 flex flex-col items-center justify-center text-zinc-600 space-y-2 opacity-50">
                            <Plus size={24} />
                            <span className="text-xs">No sessions. Create one!</span>
                        </div>
                    )
                ) : (
                    // 2. Library Search Results
                    results.length > 0 ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                                <span>Search Results</span>
                                <Filter size={10} />
                            </div>
                            {results.map(res => (
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
                                            {res.tweet.authorAvatarUrl ? <img src={res.tweet.authorAvatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px]">👤</div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold text-zinc-200 truncate leading-none">
                                                {res.tweet.authorName || res.tweet.author}
                                            </div>
                                            <div className="text-[9px] text-zinc-500 truncate mt-0.5">
                                                {res.method === 'structured' ? '精确匹配' : '语义相关'}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed group-hover:text-zinc-200 transition-colors">
                                        {res.tweet.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-30">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center">
                                <Search size={20} className="text-zinc-600" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-white mb-1">Search Your Library</h4>
                                <p className="text-[10px] text-zinc-500 leading-normal">
                                    Type something and press Enter to search through your {sessions.length * 10}+ saved tweets.
                                </p>
                            </div>
                        </div>
                    )
                )}
            </div>

            {/* User / Footer */}
            <div className="p-4 border-t border-white/5 text-[10px] text-zinc-600 font-mono tracking-tighter flex items-center justify-between">
                <span className="opacity-50 hover:opacity-100 transition-opacity">v3.0.1 INTELLIGENCE</span>
                <div className="flex items-center gap-1 text-zinc-700">
                    <Sparkles size={10} className="text-brand" />
                    <span>LOCAL-AGI</span>
                </div>
            </div>
        </aside>
    );
};
