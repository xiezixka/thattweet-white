import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, User, MessageSquare, Hash } from 'lucide-react';

interface SearchResult {
    id: string;
    type: 'user' | 'tweet' | 'tag';
    label: string;
    subLabel?: string;
    img?: string;
    node: any;
}

interface GraphSearchProps {
    nodes: any[];
    onSelect: (node: any) => void;
}

export const GraphSearch: React.FC<GraphSearchProps> = ({ nodes, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // 搜索结果
    const results = useMemo(() => {
        if (!query.trim() || query.length < 2) return [];

        const q = query.toLowerCase();
        const matched: SearchResult[] = [];

        for (const node of nodes) {
            if (matched.length >= 10) break; // 最多显示10个结果

            const label = (node.label || '').toLowerCase();
            const handleOrId = (node.data?.handle || node.id || '').toLowerCase();
            const text = (node.data?.text || '').toLowerCase();
            const authorHandle = (node.data?.author?.handle || '').toLowerCase();
            const authorName = (node.data?.author?.name || '').toLowerCase();
            const aiSummary = (node.data?.aiSummary || '').toLowerCase();
            const ocrText = (node.data?.ocrText || '').toLowerCase();

            const isMatch = label.includes(q) || handleOrId.includes(q) || text.includes(q)
                || authorHandle.includes(q) || authorName.includes(q)
                || aiSummary.includes(q) || ocrText.includes(q);

            if (isMatch) {
                // 为推文生成更好的显示标签
                let displayLabel = node.label || node.id;
                let displaySubLabel = undefined;

                if (node.type === 'user') {
                    displaySubLabel = `@${node.data?.handle || node.id}`;
                } else if (node.type === 'tweet') {
                    // 推文显示更多内容
                    displayLabel = node.data?.text?.slice(0, 60) || node.label;
                    displaySubLabel = node.data?.author?.handle
                        ? `@${node.data.author.handle}`
                        : undefined;
                } else if (node.type === 'tag') {
                    displaySubLabel = '话题标签';
                }

                matched.push({
                    id: node.id,
                    type: node.type,
                    label: displayLabel,
                    subLabel: displaySubLabel,
                    img: node.img || node.data?.avatar || node.data?.author?.avatar,
                    node
                });
            }
        }

        // 按类型排序：用户优先
        return matched.sort((a, b) => {
            if (a.type === 'user' && b.type !== 'user') return -1;
            if (a.type !== 'user' && b.type === 'user') return 1;
            return 0;
        });
    }, [nodes, query]);

    // Ctrl/Cmd + F 快捷键
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSelect = (result: SearchResult) => {
        onSelect(result.node);
        setIsOpen(false);
        setQuery('');
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'user': return <User className="w-4 h-4 text-blue-400" />;
            case 'tweet': return <MessageSquare className="w-4 h-4 text-emerald-400" />;
            case 'tag': return <Hash className="w-4 h-4 text-amber-400" />;
            default: return null;
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => {
                    setIsOpen(true);
                    setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-900/80 border border-white/10 rounded-xl
                           text-zinc-500 text-sm hover:bg-zinc-800/80 hover:border-white/20 transition-all
                           backdrop-blur-sm"
            >
                <Search className="w-4 h-4" />
                <span>搜索</span>
                <kbd className="ml-2 text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">⌘F</kbd>
            </button>
        );
    }

    return (
        <div className="relative">
            {/* 搜索输入框 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/95 border border-blue-500/30 rounded-xl
                           backdrop-blur-xl shadow-lg shadow-blue-500/5 min-w-[280px]">
                <Search className="w-4 h-4 text-blue-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索用户、推文、话题..."
                    className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-zinc-500"
                />
                <button
                    onClick={() => {
                        setIsOpen(false);
                        setQuery('');
                    }}
                    className="text-zinc-500 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* 搜索结果下拉 */}
            {results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 border border-white/10 rounded-xl
                               backdrop-blur-xl shadow-2xl overflow-hidden z-50">
                    {results.map((result, idx) => (
                        <button
                            key={result.id}
                            onClick={() => handleSelect(result)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all
                                       hover:bg-blue-500/10
                                       ${idx !== results.length - 1 ? 'border-b border-white/5' : ''}`}
                        >
                            {/* 图标或头像 */}
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden
                                           ${result.type === 'user' ? 'bg-blue-500/10' :
                                    result.type === 'tweet' ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                                {result.type === 'user' ? (
                                    <img
                                        src={result.img || `https://unavatar.io/x/${result.node.data?.handle || result.id}?size=40`}
                                        className="w-full h-full rounded-lg object-cover"
                                        onError={(e: any) => {
                                            e.target.style.display = 'none';
                                            e.target.parentNode.innerHTML = `<span class="text-blue-400 font-bold text-lg">${(result.label || '?').charAt(0).toUpperCase()}</span>`;
                                        }}
                                    />
                                ) : result.type === 'tag' ? (
                                    <span className="text-amber-500 font-bold text-lg">#</span>
                                ) : result.type === 'tweet' ? (
                                    result.node.data?.author?.handle ? (
                                        <img
                                            src={`https://unavatar.io/x/${result.node.data.author.handle}?size=40`}
                                            className="w-full h-full rounded-lg object-cover"
                                            onError={(e: any) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        getIcon(result.type)
                                    )
                                ) : (
                                    getIcon(result.type)
                                )}
                            </div>

                            {/* 文字内容 */}
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                    {result.label}
                                </div>
                                {result.subLabel && (
                                    <div className="text-xs text-zinc-500 truncate">
                                        {result.subLabel}
                                    </div>
                                )}
                            </div>

                            {/* 类型标签 */}
                            <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded
                                           ${result.type === 'user' ? 'text-blue-400 bg-blue-500/10' :
                                    result.type === 'tweet' ? 'text-emerald-400 bg-emerald-500/10' :
                                        'text-amber-400 bg-amber-500/10'}`}>
                                {result.type === 'user' ? '用户' : result.type === 'tweet' ? '推文' : '话题'}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* 无结果提示 */}
            {query.length >= 2 && results.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 border border-white/10 rounded-xl
                               backdrop-blur-xl p-4 text-center text-zinc-500 text-sm">
                    未找到匹配结果
                </div>
            )}
        </div>
    );
};
