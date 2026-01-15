import React, { useState } from 'react';
import { Tweet } from '../types/tweet';
import { UserCache } from '../types/tweet';
import { Calendar, MessageCircle, Heart, Repeat2, Tag, Eye, ChevronDown, ChevronUp, Play, User, Layers, Trash2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { useUIStore } from '../store/useUIStore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface TweetCardProps {
    tweet: Tweet;
    author: UserCache;
    mode?: 'masonry' | 'compact' | 'reference';
    onAuthorClick?: (author: UserCache) => void;
}

const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

const getScoreStyles = (score: number) => {
    if (score >= 90) return 'text-rose-400 bg-rose-400/10 border-rose-400/20 shadow-lg shadow-rose-400/10';
    if (score >= 70) return 'text-amber-400 bg-amber-400/10 border-amber-400/20 shadow-md shadow-amber-400/10';
    if (score >= 40) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    return 'text-zinc-500 bg-zinc-500/10 border-white/5';
};

/**
 * 🛠️ 强力 URL 规范化 (增加容错与推导)
 */
const normalizeTwitterUrl = (url: string | undefined): string => {
    if (!url) return '';
    // 🧪 实验：回退到最原始状态，除了 HTTPS 协议外，不做任何处理
    // 如果 URL 有效，直接返回。
    // 旧版能显示，说明原始 URL 本身就是好的。
    // 唯一保留：视频/媒体图可能需要 format 参数，但头像我们先不动。

    let processed = url.replace('http:', 'https:');

    // 只对媒体图 (media) 追加参数，头像保持原样！
    if (processed.includes('pbs.twimg.com') && !processed.includes('/profile_images/')) {
        if (!processed.includes('?')) {
            processed += '?format=jpg&name=large';
        }
    }
    return processed;
};

export const TweetCard: React.FC<TweetCardProps> = ({ tweet, author, mode = 'masonry', onAuthorClick }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [imgFail, setImgFail] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const { t } = useTranslation();
    const { openLightbox } = useUIStore();
    const isMasonry = mode === 'masonry';

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!deleteConfirm) {
            setDeleteConfirm(true);
            setTimeout(() => setDeleteConfirm(false), 3000); // 3s reset
            return;
        }

        const { db } = await import('../../core/storage/db');
        await db.tweets.delete(tweet.id);
    };

    const scoreStyles = tweet.aiScore !== undefined ? getScoreStyles(tweet.aiScore) : '';
    const hasLongText = tweet.text.length > 140;

    // 1. 头像处理 (增加 fallback 状态)
    const avatarUrl = normalizeTwitterUrl(author?.avatar);

    // 调试日志 (已关闭)
    // if (!avatarUrl) console.log(`[Card] No avatar for ${author?.name}`, author);
    // else console.log(`[Card] Avatar for ${author?.name}:`, avatarUrl);

    // 2. 媒体处理 (多图逻辑)
    const mediaItems = tweet.media || [];
    const hasMedia = mediaItems.length > 0;

    return (
        <div
            onClick={() => window.open(tweet.tweetUrl, '_blank')}
            className={cn(
                "group relative glass-card rounded-xl overflow-hidden flex flex-col transition-all duration-300 cursor-pointer hover:shadow-lg hover:border-white/10",
                "p-3 gap-2 border-b border-white/5",
                "break-inside-avoid w-full box-border mb-4",
                "select-none" // 阻止拖动时选中文本
            )}>
            {/* Header Area */}
            <div className="flex items-center justify-between mb-1">
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onAuthorClick) onAuthorClick(author);
                    }}
                    className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer"
                >
                    <div className="w-10 h-10 rounded-full border border-white/10 bg-zinc-800 shrink-0 overflow-hidden">
                        {avatarUrl && !imgFail ? (
                            <img
                                src={avatarUrl}
                                alt={author?.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={() => setImgFail(true)}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-brand/10 text-brand">
                                <User size={20} />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[14px] leading-tight text-zinc-100 truncate max-w-[140px]">
                            {author?.name || 'Unknown'}
                        </span>
                        <span className="text-[13px] text-zinc-500 leading-tight">
                            @{author?.handle || 'unknown'}
                        </span>
                    </div>
                </div>

                {tweet.aiScore !== undefined && (
                    <div className={cn(
                        "px-2 py-0.5 rounded-lg border text-[10px] font-black italic tracking-tighter transition-all duration-500 shrink-0",
                        scoreStyles
                    )}>
                        {tweet.aiScore}
                    </div>
                )}
            </div>

            {tweet.aiSummary && (
                <div className={cn(
                    "text-zinc-200 text-[13px] leading-[1.4] p-2.5 rounded-xl border italic mb-1",
                    tweet.aiScore && tweet.aiScore >= 90 ? "bg-rose-400/5 border-rose-400/10" : "bg-white/[0.03] border-white/5"
                )}>
                    <div className="flex items-start gap-2">
                        <span className={cn(
                            "font-black text-[10px] mt-0.5",
                            tweet.aiScore && tweet.aiScore >= 90 ? "text-rose-400" : "text-brand"
                        )}>{t('card_ai_label')}:</span>
                        <div className="flex-1">
                            <p>{tweet.aiSummary}</p>
                            {tweet.aiReason && (
                                <p className="mt-1.5 text-[11px] text-zinc-500 border-l-2 border-white/10 pl-2 not-italic font-medium">
                                    {tweet.aiReason}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="relative">
                <div className={cn(
                    "text-zinc-300 break-words transition-all duration-300",
                    "text-[14px] leading-[1.4]",
                    !isExpanded && isMasonry && "line-clamp-5",
                    "select-text" // 允许正文被选中
                )}>
                    {tweet.text || "(No Text Content)"}
                </div>

                {hasLongText && isMasonry && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="mt-1 text-[11px] font-bold text-brand hover:text-brand transition-colors"
                    >
                        {isExpanded ? t('card_show_less') : t('card_read_more')}
                    </button>
                )}
            </div>

            {/* Media/Video Area (Horizontal Scroll + Lightbox) */}
            {hasMedia && (
                <div className="relative group/media mt-1">
                    <div
                        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar rounded-xl bg-zinc-900 border border-white/5 transition-colors group-hover:border-white/10"
                        onScroll={(e) => {
                            const container = e.currentTarget;
                            const index = Math.round(container.scrollLeft / container.clientWidth);
                            if (index !== currentMediaIndex) setCurrentMediaIndex(index);
                        }}
                    >
                        {mediaItems.map((item, idx) => {
                            const thumb = normalizeTwitterUrl(item.previewUrl || (item.type === 'image' ? item.url : ''));
                            return (
                                <div
                                    key={idx}
                                    className="flex-none w-full aspect-video snap-center relative overflow-hidden flex items-center justify-center cursor-zoom-in"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openLightbox(mediaItems, idx);
                                    }}
                                >
                                    <img
                                        src={thumb}
                                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                                        alt={`Media ${idx + 1}`}
                                        referrerPolicy="no-referrer"
                                    />
                                    {item.type === 'video' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
                                            <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20 text-white shadow-2xl scale-95 group-hover/media:scale-100 transition-transform">
                                                <Play size={16} fill="white" className="ml-0.5" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Restore Media Count (Subtle Bottom Right) */}
                                    {mediaItems.length > 1 && (
                                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/40 backdrop-blur-md rounded text-[9px] font-black text-white/70 border border-white/5 flex items-center gap-1 group-hover/media:opacity-0 transition-opacity">
                                            <Layers size={9} />
                                            {mediaItems.length}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Navigation Dots */}
                    {mediaItems.length > 1 && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 round-full bg-black/20 backdrop-blur-sm rounded-full opacity-0 group-hover/media:opacity-100 transition-opacity pointer-events-none">
                            {mediaItems.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        "h-1 rounded-full transition-all duration-300",
                                        idx === currentMediaIndex ? "w-4 bg-white" : "w-1 bg-white/40"
                                    )}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Footer Area */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5 text-zinc-600">
                <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1"><MessageCircle size={12} /> {formatNumber(tweet.replyCount || 0)}</span>
                    <span className="flex items-center gap-1"><Repeat2 size={12} /> {formatNumber(tweet.retweetCount || 0)}</span>
                    <span className="flex items-center gap-1 hover:text-rose-400 transition-colors"><Heart size={12} /> {formatNumber(tweet.favoriteCount || 0)}</span>
                    <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(tweet.viewCount || 0)}</span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            const { db } = await import('../../core/storage/db');
                            await db.tweets.update(tweet.id, { isBookmarked: !tweet.isBookmarked });
                        }}
                        className={cn(
                            "p-1.5 rounded-lg transition-all",
                            tweet.isBookmarked
                                ? "bg-amber-400/20 text-amber-400 shadow-lg shadow-amber-400/10"
                                : "hover:bg-white/5 text-zinc-600 hover:text-amber-400"
                        )}
                        title={t('int_bookmark') || 'Bookmark'}
                    >
                        <Tag size={13} fill={tweet.isBookmarked ? "currentColor" : "none"} />
                    </button>
                    <button
                        onClick={handleDelete}
                        className={cn(
                            "p-1.5 rounded-lg transition-all",
                            deleteConfirm
                                ? "bg-rose-500/20 text-rose-500 shadow-lg shadow-rose-500/10 ring-1 ring-rose-500/50"
                                : "hover:bg-rose-500/10 text-zinc-600 hover:text-rose-500"
                        )}
                        title="Delete Tweet"
                    >
                        <Trash2 size={13} className={cn(deleteConfirm && "animate-pulse")} />
                    </button>
                    <div className="text-[10px] font-medium opacity-50 italic">
                        {tweet.createdAt ? new Date(tweet.createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' }) : '00/00'}
                    </div>
                </div>
            </div>
        </div>
    );
};
