import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTweets } from '../../shared/hooks/useTweets';
import { useUIStore } from '../../shared/store/useUIStore';
import { normalizeTwitterImage } from '../../shared/utils/image';
import {
    Search, SlidersHorizontal, X, Image as ImageIcon, Loader2, User, Hash, ChevronDown,
    Layers, Code, Network, Layout, BarChart3, Palette, Sparkles, Package, Monitor, Smile, Camera, MoreHorizontal
} from 'lucide-react';
import { cn } from '../../shared/utils/cn';
import { UserCache } from '../../shared/types/tweet';
import { useTranslation } from '../../shared/hooks/useTranslation';
import { GalleryGridItem } from './components/GalleryGridItem';
import { CATEGORY_META, ImageCategory, getAllCategories } from '../../shared/constants/imageCategories';

// Icon mapping for categories
const CATEGORY_ICONS: Record<ImageCategory, React.ReactNode> = {
    code: <Code size={14} />,
    architecture: <Network size={14} />,
    ui_design: <Layout size={14} />,
    chart: <BarChart3 size={14} />,
    portrait: <User size={14} />,
    illustration: <Palette size={14} />,
    cosplay: <Sparkles size={14} />,
    product: <Package size={14} />,
    screenshot: <Monitor size={14} />,
    meme: <Smile size={14} />,
    photo: <Camera size={14} />,
    other: <MoreHorizontal size={14} />
};

export const GalleryView: React.FC = () => {
    const { tweets, loading } = useTweets();
    const { openLightbox } = useUIStore();
    const { t } = useTranslation();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [selectedCategories, setSelectedCategories] = useState<Set<ImageCategory>>(new Set());
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const [authorSearch, setAuthorSearch] = useState('');
    const filterPanelRef = useRef<HTMLDivElement>(null);

    // Close filter panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
                setIsFilterPanelOpen(false);
            }
        };
        if (isFilterPanelOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isFilterPanelOpen]);

    // 1. 提取所有包含媒体的推文
    const mediaTweets = useMemo(() => {
        return tweets.filter(t => t.media && t.media.length > 0);
    }, [tweets]);

    // 2. 提取筛选选项 (作者、标签、类型) - 基于所有媒体推文，带数量统计
    const filters = useMemo(() => {
        const authorCounts = new Map<string, { data: UserCache; count: number }>();
        const tagCounts = new Map<string, number>();
        const categoryCounts = new Map<ImageCategory, number>();

        mediaTweets.forEach(t => {
            // 统计作者
            if (t.author) {
                const authorData = typeof t.author === 'object'
                    ? t.author
                    : { id: t.authorId, name: t.authorName || 'User', handle: t.author as string, avatar: t.authorAvatarUrl || '', updatedAt: 0 } as UserCache;

                const id = authorData.id || t.authorId || 'unknown';
                const existing = authorCounts.get(id);
                if (existing) {
                    existing.count += t.media.length;
                } else {
                    authorCounts.set(id, { data: { ...authorData, id }, count: t.media.length });
                }
            }

            // 统计标签
            t.tags?.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + t.media.length));
            t.aiTags?.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + t.media.length));

            // 🆕 统计图片类型
            t.mediaAnalysis?.forEach(analysis => {
                const cats = analysis.categories || ['other'];
                cats.forEach(cat => {
                    const catKey = cat as ImageCategory;
                    categoryCounts.set(catKey, (categoryCounts.get(catKey) || 0) + 1);
                });
            });
        });

        // 按数量排序
        const authorList = Array.from(authorCounts.values())
            .sort((a, b) => b.count - a.count);
        const tagList = Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
        const categoryList = Array.from(categoryCounts.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);

        return { authors: authorList, tags: tagList, categories: categoryList };
    }, [mediaTweets]);

    // Filter authors for search in panel
    const filteredAuthors = useMemo(() => {
        if (!authorSearch) return filters.authors;
        const q = authorSearch.toLowerCase();
        return filters.authors.filter(a =>
            a.data.name.toLowerCase().includes(q) ||
            a.data.handle?.toLowerCase().includes(q)
        );
    }, [filters.authors, authorSearch]);

    // 3. 执行过滤 (按 Tweet 级别)
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

            // 🆕 类型过滤 - 只要任意一张图片匹配任意选中的类型
            if (selectedCategories.size > 0) {
                const hasMatchingCategory = t.mediaAnalysis?.some(analysis => {
                    const cats = analysis.categories || ['other'];
                    return cats.some(cat => selectedCategories.has(cat as ImageCategory));
                });
                if (!hasMatchingCategory) return false;
            }

            return true;
        });
    }, [mediaTweets, searchQuery, selectedAuthor, selectedTag, selectedCategories]);

    // 4. Flatten data for global lightbox navigation (with category filter applied per-media)
    const flatGalleryItems = useMemo(() => {
        return filteredTweets.flatMap(t =>
            (t.media || []).map((media, originalIndex) => {
                const analysis = t.mediaAnalysis?.[originalIndex];
                const categories = analysis?.categories || ['other'];

                // 如果选中了类型筛选，只展示匹配的图片
                if (selectedCategories.size > 0) {
                    const matches = categories.some(cat => selectedCategories.has(cat as ImageCategory));
                    if (!matches) return null;
                }

                return {
                    media,
                    originalIndex,
                    tweet: t,
                    analysis: analysis || {},
                    categories
                };
            }).filter(Boolean)
        ) as Array<{ media: any; originalIndex: number; tweet: any; analysis: any; categories: string[] }>;
    }, [filteredTweets, selectedCategories]);

    const allMediaForLightbox = useMemo(() => flatGalleryItems.map(i => i.media), [flatGalleryItems]);
    const allAnalysisForLightbox = useMemo(() => flatGalleryItems.map(i => i.analysis || {}), [flatGalleryItems]);

    // 虚拟滚动
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

    // Helper to get selected author/tag display name
    const selectedAuthorData = useMemo(() =>
        filters.authors.find(a => a.data.id === selectedAuthor)?.data
        , [filters.authors, selectedAuthor]);

    const activeFilterCount = (selectedAuthor ? 1 : 0) + (selectedTag ? 1 : 0) + selectedCategories.size;

    const clearAllFilters = () => {
        setSelectedAuthor(null);
        setSelectedTag(null);
        setSelectedCategories(new Set());
        setSearchQuery('');
    };

    const toggleCategory = (cat: ImageCategory) => {
        setSelectedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) {
                next.delete(cat);
            } else {
                next.add(cat);
            }
            return next;
        });
    };

    return (
        <div className="w-full min-h-screen flex flex-col">
            {/* Compact Header */}
            <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 px-4 lg:px-8 py-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Title & Count */}
                    <div className="flex items-center gap-3 shrink-0">
                        <h1 className="text-2xl font-black bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent italic tracking-tight">
                            {t('nav_gallery')}
                        </h1>
                        <span className="text-xs font-bold text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded-full">
                            {flatGalleryItems.length}
                        </span>
                    </div>

                    {/* Search & Filter Controls */}
                    <div className="flex items-center gap-3 flex-1 justify-end max-w-xl">
                        {/* Search */}
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                            <input
                                type="text"
                                placeholder="搜索..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-900/60 border border-white/5 rounded-xl pl-10 pr-8 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/30 placeholder:text-zinc-600 transition-all"
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

                        {/* Filter Toggle Button */}
                        <div className="relative" ref={filterPanelRef}>
                            <button
                                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm font-medium",
                                    isFilterPanelOpen || activeFilterCount > 0
                                        ? "bg-brand/10 border-brand/30 text-brand"
                                        : "bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white hover:border-white/10"
                                )}
                            >
                                <SlidersHorizontal size={16} />
                                <span className="hidden sm:inline">筛选</span>
                                {activeFilterCount > 0 && (
                                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-brand text-[10px] font-black text-white">
                                        {activeFilterCount}
                                    </span>
                                )}
                                <ChevronDown size={14} className={cn("transition-transform", isFilterPanelOpen && "rotate-180")} />
                            </button>

                            {/* Filter Panel Dropdown */}
                            {isFilterPanelOpen && (
                                <div className="absolute right-0 top-full mt-2 w-80 sm:w-[420px] bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                    {/* Panel Header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                                        <span className="text-sm font-bold text-white">筛选条件</span>
                                        {activeFilterCount > 0 && (
                                            <button
                                                onClick={clearAllFilters}
                                                className="text-[11px] font-medium text-zinc-500 hover:text-red-400 transition-colors"
                                            >
                                                清除全部
                                            </button>
                                        )}
                                    </div>

                                    {/* 🆕 Category Section */}
                                    <div className="p-4 border-b border-white/5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Layers size={14} className="text-zinc-500" />
                                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">图片类型</span>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {filters.categories.map(({ category, count }) => {
                                                const meta = CATEGORY_META[category];
                                                const isSelected = selectedCategories.has(category);
                                                return (
                                                    <button
                                                        key={category}
                                                        onClick={() => toggleCategory(category)}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all select-none border",
                                                            isSelected
                                                                ? `bg-white/10 border-white/20 text-white`
                                                                : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                                                        )}
                                                    >
                                                        <span className={cn(isSelected ? meta.color : 'text-zinc-500')}>
                                                            {CATEGORY_ICONS[category]}
                                                        </span>
                                                        <span>{meta.label}</span>
                                                        <span className="text-zinc-600">({count})</span>
                                                    </button>
                                                );
                                            })}
                                            {filters.categories.length === 0 && (
                                                <span className="text-xs text-zinc-600">暂无分类数据（需要重新分析图片）</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Authors Section */}
                                    <div className="p-4 border-b border-white/5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <User size={14} className="text-zinc-500" />
                                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">来源 / 作者</span>
                                        </div>

                                        {/* Author Search */}
                                        {filters.authors.length > 8 && (
                                            <div className="relative mb-3">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" size={12} />
                                                <input
                                                    type="text"
                                                    placeholder="搜索作者..."
                                                    value={authorSearch}
                                                    onChange={(e) => setAuthorSearch(e.target.value)}
                                                    className="w-full bg-zinc-800/50 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-brand/30 placeholder:text-zinc-600"
                                                />
                                            </div>
                                        )}

                                        {/* Author List */}
                                        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto no-scrollbar">
                                            {filteredAuthors.slice(0, 20).map(({ data: author, count }) => (
                                                <button
                                                    key={author.id}
                                                    onClick={() => {
                                                        setSelectedAuthor(selectedAuthor === author.id ? null : author.id);
                                                    }}
                                                    className={cn(
                                                        "flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border transition-all select-none text-[11px]",
                                                        selectedAuthor === author.id
                                                            ? "bg-brand/20 border-brand/40 text-white ring-1 ring-brand/20"
                                                            : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                                                    )}
                                                >
                                                    <div className="w-4 h-4 rounded-full overflow-hidden shrink-0">
                                                        <img
                                                            src={normalizeTwitterImage(author.avatar, 'avatar')}
                                                            alt={author.name}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => e.currentTarget.src = 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'}
                                                        />
                                                    </div>
                                                    <span className="max-w-[80px] truncate">{author.name}</span>
                                                    <span className="text-zinc-600 font-medium">({count})</span>
                                                </button>
                                            ))}
                                            {filteredAuthors.length === 0 && (
                                                <span className="text-xs text-zinc-600">无匹配作者</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Tags Section */}
                                    <div className="p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Hash size={14} className="text-zinc-500" />
                                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">标签</span>
                                        </div>

                                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar">
                                            {filters.tags.slice(0, 30).map(({ tag, count }) => (
                                                <button
                                                    key={tag}
                                                    onClick={() => {
                                                        setSelectedTag(selectedTag === tag ? null : tag);
                                                    }}
                                                    className={cn(
                                                        "px-2 py-1 rounded-lg text-[11px] font-medium transition-colors select-none border",
                                                        selectedTag === tag
                                                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                                                            : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                                                    )}
                                                >
                                                    #{tag} <span className="text-zinc-600">({count})</span>
                                                </button>
                                            ))}
                                            {filters.tags.length === 0 && (
                                                <span className="text-xs text-zinc-600">暂无标签</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Active Filters Chips */}
                {(selectedAuthor || selectedTag || selectedCategories.size > 0) && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/5">
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mr-1">已选:</span>

                        {/* Category Chips */}
                        {Array.from(selectedCategories).map(cat => {
                            const meta = CATEGORY_META[cat];
                            return (
                                <button
                                    key={cat}
                                    onClick={() => toggleCategory(cat)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium group hover:bg-white/10 transition-colors border border-white/10",
                                        meta.color
                                    )}
                                >
                                    {CATEGORY_ICONS[cat]}
                                    <span>{meta.label}</span>
                                    <X size={12} className="opacity-50 group-hover:opacity-100" />
                                </button>
                            );
                        })}

                        {selectedAuthorData && (
                            <button
                                onClick={() => setSelectedAuthor(null)}
                                className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-medium group hover:bg-brand/20 transition-colors"
                            >
                                <div className="w-4 h-4 rounded-full overflow-hidden">
                                    <img src={normalizeTwitterImage(selectedAuthorData.avatar, 'avatar')} className="w-full h-full object-cover" />
                                </div>
                                <span>@{selectedAuthorData.handle}</span>
                                <X size={12} className="opacity-50 group-hover:opacity-100" />
                            </button>
                        )}

                        {selectedTag && (
                            <button
                                onClick={() => setSelectedTag(null)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium group hover:bg-emerald-500/20 transition-colors"
                            >
                                <span>#{selectedTag}</span>
                                <X size={12} className="opacity-50 group-hover:opacity-100" />
                            </button>
                        )}
                    </div>
                )}
            </header>

            {/* Gallery Grid */}
            <div className="flex-1 p-4 lg:p-6">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center min-h-[400px]">
                        <Loader2 className="animate-spin text-zinc-700" size={32} />
                    </div>
                ) : flatGalleryItems.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-white/5 rounded-3xl">
                        <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
                            <ImageIcon className="text-zinc-700" size={32} />
                        </div>
                        <p className="text-zinc-500 font-medium">
                            {activeFilterCount > 0 ? '没有匹配的图片' : '暂无视觉内容'}
                        </p>
                        <p className="text-zinc-700 text-sm mt-1">
                            {activeFilterCount > 0 ? '尝试调整筛选条件' : '尝试捕捉一些带图片的推文吧'}
                        </p>
                        {activeFilterCount > 0 && (
                            <button
                                onClick={clearAllFilters}
                                className="mt-4 px-4 py-2 rounded-xl bg-brand/10 border border-brand/20 text-brand text-sm font-medium hover:bg-brand/20 transition-colors"
                            >
                                清除筛选
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 select-none space-y-4">
                        {displayedItems.map((item, index) => {
                            const { media, tweet } = item;

                            return (
                                <GalleryGridItem
                                    key={`${tweet.id}-${item.originalIndex}-${index}`}
                                    media={media}
                                    tweet={tweet}
                                    index={index}
                                    onClick={() => openLightbox(allMediaForLightbox, index, allAnalysisForLightbox, undefined, 'clean')}
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
        </div>
    );
};
