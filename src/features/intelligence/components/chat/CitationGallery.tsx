import React, { useState, useMemo } from 'react';
import { Tweet, UserCache } from '../../../../shared/types/tweet';
import { Search, Filter, Hash, User, X, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../../../shared/utils/cn';
import { useUIStore } from '../../../../shared/store/useUIStore';
import { normalizeTwitterImage } from '../../../../shared/utils/image';

interface CitationGalleryProps {
    citations: Tweet[];
    isOpen: boolean;
    onToggle: () => void;
}

export const CitationGallery: React.FC<CitationGalleryProps> = ({ citations, isOpen, onToggle }) => {
    const { openLightbox } = useUIStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // 1. 提取所有包含媒体的引用
    const mediaTweets = useMemo(() => {
        return citations.filter(t => t.media && t.media.length > 0);
    }, [citations]);

    // 如果没有媒体内容，直接不渲染
    if (mediaTweets.length === 0) return null;

    // 2. 提取筛选选项 (作者和标签)
    const filters = useMemo(() => {
        const authors = new Map<string, UserCache>();
        const tags = new Set<string>();

        mediaTweets.forEach(t => {
            if (t.author) {
                // 处理 author 可能是对象也可能是 id 字符串的情况 (如果是对象)
                const authorData = typeof t.author === 'object' ? t.author : { id: t.authorId, name: t.authorName || 'User', handle: t.author as string, avatar: t.authorAvatarUrl || '' } as UserCache;
                authors.set(authorData.id || t.authorId, authorData);
            }
            // 收集标签 (包括手动标签和AI标签)
            t.tags?.forEach(tag => tags.add(tag));
            t.aiTags?.forEach(tag => tags.add(tag));
        });

        return {
            authors: Array.from(authors.values()),
            tags: Array.from(tags)
        };
    }, [mediaTweets]);

    // 3. 执行过滤
    const filteredTweets = useMemo(() => {
        return mediaTweets.filter(t => {
            // 搜索过滤
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const textMatch = t.text.toLowerCase().includes(query);
                const authorMatch = (t.authorName || '').toLowerCase().includes(query) || (t.author as any)?.handle?.toLowerCase().includes(query);
                if (!textMatch && !authorMatch) return false;
            }

            // 作者过滤
            if (selectedAuthor) {
                const authorId = typeof t.author === 'object' ? t.author.id : t.authorId;
                if (authorId !== selectedAuthor) return false;
            }

            // 标签过滤
            if (selectedTag) {
                const allTags = [...(t.tags || []), ...(t.aiTags || [])];
                if (!allTags.includes(selectedTag)) return false;
            }

            return true;
        });
    }, [mediaTweets, searchQuery, selectedAuthor, selectedTag]);

    // 4. Flatten data for global lightbox navigation
    const flatGalleryItems = useMemo(() => {
        return filteredTweets.flatMap(t =>
            (t.media || []).map((media, originalIndex) => ({
                media,
                originalIndex,
                tweet: t,
                analysis: t.mediaAnalysis?.[originalIndex]
            }))
        );
    }, [filteredTweets]);

    const allMediaForLightbox = useMemo(() => flatGalleryItems.map(i => i.media), [flatGalleryItems]);
    const allAnalysisForLightbox = useMemo(() => flatGalleryItems.map(i => i.analysis || {}), [flatGalleryItems]);

    return (
        <div className="w-full mb-4">
            {/* Toggle Header */}
            <button
                onClick={onToggle}
                className={cn(
                    "flex items-center gap-2 px-3 py-2 w-full text-left rounded-xl transition-all border",
                    isOpen
                        ? "bg-zinc-800/100 border-white/10 mb-2"
                        : "bg-zinc-800/50 border-white/5 hover:bg-zinc-800 hover:border-white/10"
                )}
            >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-brand/10 text-brand">
                    <ImageIcon size={14} />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-200">媒体画廊</span>
                    {!isOpen && <span className="text-[10px] text-zinc-500">{mediaTweets.length} 个可视内容</span>}
                </div>

                {isOpen ? <ChevronUp size={16} className="ml-auto text-zinc-500" /> : <ChevronDown size={16} className="ml-auto text-zinc-500" />}
            </button>

            {/* Gallery Content */}
            {isOpen && (
                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 animate-in slide-in-from-top-2 duration-200">
                    {/* Toolbar */}
                    <div className="flex flex-col gap-3 mb-4">
                        {/* Search & Top Filters */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="搜索视觉内容..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 placeholder:text-zinc-600"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            {/* Filter Count Badges */}
                            {(selectedAuthor || selectedTag) && (
                                <button
                                    onClick={() => { setSelectedAuthor(null); setSelectedTag(null); }}
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] hover:bg-red-500/20 transition-colors"
                                >
                                    <X size={10} />
                                    清除筛选
                                </button>
                            )}
                        </div>

                        {/* Author Filters (Horizontal Scroll) */}
                        {filters.authors.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0 mr-1">来源:</span>
                                {filters.authors.map(author => (
                                    <button
                                        key={author.id}
                                        onClick={() => setSelectedAuthor(selectedAuthor === author.id ? null : author.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border transition-all shrink-0",
                                            selectedAuthor === author.id
                                                ? "bg-brand/20 border-brand/30 text-zinc-100"
                                                : "bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10"
                                        )}
                                    >
                                        <div className="w-5 h-5 rounded-full overflow-hidden">
                                            <img
                                                src={normalizeTwitterImage(author.avatar, 'avatar')}
                                                alt={author.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => e.currentTarget.src = 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}
                                            />
                                        </div>
                                        <span className="text-[10px] font-medium max-w-[80px] truncate">{author.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Tag Filters */}
                        {filters.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto no-scrollbar">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0 mr-1 self-center">标签:</span>
                                {filters.tags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                                        className={cn(
                                            "px-2 py-0.5 rounded text-[10px] border transition-colors",
                                            selectedTag === tag
                                                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                                                : "bg-white/5 border-white/5 text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        #{tag}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Gallery Grid */}
                    {flatGalleryItems.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {flatGalleryItems.map((item, globalIndex) => {
                                const { media, tweet } = item;
                                return (
                                    <div
                                        key={`${tweet.id}-${item.originalIndex}`}
                                        className="group relative aspect-square rounded-lg overflow-hidden cursor-zoom-in bg-black/20"
                                        onClick={() => openLightbox(allMediaForLightbox, globalIndex, allAnalysisForLightbox, undefined)}
                                    >
                                        <img
                                            src={normalizeTwitterImage(media.type === 'video' && media.previewUrl ? media.previewUrl : media.url, 'media')}
                                            alt="Gallery Item"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            loading="lazy"
                                        />

                                        {/* Type Badge */}
                                        {media.type === 'video' && (
                                            <div className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 backdrop-blur text-white text-[8px]">
                                                ▶
                                            </div>
                                        )}

                                        {/* Hover Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-white/20">
                                                    <img
                                                        src={normalizeTwitterImage((tweet.author as any)?.avatar, 'avatar')}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <span className="text-[10px] text-zinc-200 font-bold truncate">@{(tweet.author as any)?.handle}</span>
                                            </div>
                                            <p className="text-[10px] text-zinc-400 line-clamp-2 leading-tight">
                                                {tweet.text}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-zinc-500 text-xs italic border border-dashed border-white/5 rounded-lg">
                            没有找到符合条件的图片
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
