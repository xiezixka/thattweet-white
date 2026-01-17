import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useUIStore } from '../../shared/store/useUIStore';
import { normalizeTwitterImage } from '../../shared/utils/image';
import { Search, Filter, Hash, User, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '../../shared/utils/cn';
import { UserCache } from '../../shared/types/tweet';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { GalleryGridItem } from './components/GalleryGridItem';

export const GalleryView: React.FC = () => {
    const { tweets, loading } = useTweets();
    const { openLightbox } = useUIStore();
    const { t } = useTranslation();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // 1. 提取所有包含媒体的推文
    const mediaTweets = useMemo(() => {
        return tweets.filter(t => t.media && t.media.length > 0);
    }, [tweets]);

    // 2. 提取筛选选项 (作者和标签) - 基于所有媒体推文
    const filters = useMemo(() => {
        const authors = new Map<string, UserCache>();
        const tags = new Set<string>();

        mediaTweets.forEach(t => {
            if (t.author) {
                const authorData = typeof t.author === 'object'
                    ? t.author
                    : { id: t.authorId, name: t.authorName || 'User', handle: t.author as string, avatar: t.authorAvatarUrl || '', updatedAt: 0 } as UserCache;

                // 确保有 ID
                const id = authorData.id || t.authorId || 'unknown';
                authors.set(id, { ...authorData, id });
            }
            // 收集标签
            t.tags?.forEach(tag => tags.add(tag));
            t.aiTags?.forEach(tag => tags.add(tag));
        });

        // 排序作者：按媒体数量多少排序？暂时按名字
        const authorList = Array.from(authors.values()).sort((a, b) => a.name.localeCompare(b.name));
        const tagList = Array.from(tags).sort();

        return {
            authors: authorList,
            tags: tagList
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

    // 虚拟滚动优化（简化版：限制显示数量）
    const [displayLimit, setDisplayLimit] = useState(50);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const displayedItems = useMemo(() => flatGalleryItems.slice(0, displayLimit), [flatGalleryItems, displayLimit]);

    useEffect(() => {
        if (!loadMoreRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && displayedItems.length < flatGalleryItems.length) {
                setDisplayLimit(prev => prev + 50);
            }
        }, { rootMargin: '1000px' });

        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [displayedItems.length, flatGalleryItems.length]);


    // 布局说明：
    // 使用 columns CSS 属性实现真正的 Masonry 瀑布流
    // 图片高度自适应 (h-auto)
    // break-inside-avoid 防止图片被切断

    return (
        <div className="w-full min-h-screen flex flex-col p-4 lg:p-8">
            {/* Header */}
            <header className="relative w-full flex flex-col md:flex-row items-start md:items-center justify-between mb-8 px-2 gap-4">
                <div className="shrink-0">
                    <h1 className="text-3xl font-black bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent italic tracking-tight flex items-center gap-3">
                        {t('nav_gallery')}
                        <span className="text-sm font-bold text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded-full not-italic tracking-normal">{flatGalleryItems.length}</span>
                    </h1>
                </div>

                {/* Toolbar */}
                <div className="flex-1 w-full md:w-auto flex flex-col md:flex-row items-center gap-4 justify-end">

                    {/* Search */}
                    <div className="relative w-full md:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                        <input
                            type="text"
                            placeholder="搜索视觉内容..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-10 pr-8 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 placeholder:text-zinc-600 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Filters Bar */}
            <div className="flex flex-col gap-4 mb-6 px-2">
                {/* Author Filters */}
                {filters.authors.length > 0 && (
                    <div className="w-full overflow-x-auto no-scrollbar pb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest shrink-0 mr-2">来源</span>
                            {filters.authors.map(author => (
                                <button
                                    key={author.id}
                                    onClick={() => setSelectedAuthor(selectedAuthor === author.id ? null : author.id)}
                                    className={cn(
                                        "flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border transition-all shrink-0 select-none",
                                        selectedAuthor === author.id
                                            ? "bg-brand/20 border-brand/30 text-zinc-100 ring-1 ring-brand/20"
                                            : "bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                                    )}
                                >
                                    <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                                        <img
                                            src={normalizeTwitterImage(author.avatar, 'avatar')}
                                            alt={author.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => e.currentTarget.src = 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}
                                        />
                                    </div>
                                    <span className="text-[11px] font-medium max-w-[100px] truncate">{author.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tag Filters */}
                {filters.tags.length > 0 && (
                    <div className="w-full overflow-x-auto no-scrollbar pb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest shrink-0 mr-2 self-center">标签</span>
                            {filters.tags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 select-none border",
                                        selectedTag === tag
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                                    )}
                                >
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Gallery Grid - CSS Masonry */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center min-h-[400px]">
                    <Loader2 className="animate-spin text-zinc-700" size={32} />
                </div>
            ) : flatGalleryItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-white/5 rounded-3xl m-2">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
                        <ImageIcon className="text-zinc-700" size={32} />
                    </div>
                    <p className="text-zinc-500 font-medium">暂无视觉内容</p>
                    <p className="text-zinc-700 text-sm mt-1">尝试捕捉一些带图片的推文吧</p>
                </div>
            ) : (
                <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 px-2 select-none space-y-4">
                    {displayedItems.map((item, index) => {
                        const { media, tweet } = item;

                        return (
                            <GalleryGridItem
                                key={`${tweet.id}-${item.originalIndex}-${index}`}
                                media={media}
                                tweet={tweet}
                                index={index}
                                onClick={() => openLightbox(allMediaForLightbox, index, allAnalysisForLightbox, 'clean')}
                            />
                        );
                    })}
                </div>
            )}

            {/* Footer Loader */}
            <div ref={loadMoreRef} className="h-20 w-full flex items-center justify-center">
                {displayedItems.length < flatGalleryItems.length && (
                    <Loader2 className="animate-spin text-zinc-800" size={20} />
                )}
            </div>
        </div>
    );
};
