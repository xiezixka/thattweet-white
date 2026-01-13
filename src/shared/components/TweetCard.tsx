import React, { useState } from 'react';
import { Tweet } from '../types/tweet';
import { UserCache } from '../types/tweet';
import { Calendar, MessageCircle, Heart, Repeat2, Tag, Eye, ChevronDown, ChevronUp, Play, User } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface TweetCardProps {
    tweet: Tweet;
    author: UserCache;
    mode?: 'masonry' | 'compact' | 'reference';
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

export const TweetCard: React.FC<TweetCardProps> = ({ tweet, author, mode = 'masonry' }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPlayerActive, setIsPlayerActive] = useState(false);
    const [imgFail, setImgFail] = useState(false);
    const { t } = useTranslation();
    const isMasonry = mode === 'masonry';

    const scoreStyles = tweet.aiScore !== undefined ? getScoreStyles(tweet.aiScore) : '';
    const hasLongText = tweet.text.length > 140;

    // 1. 头像处理 (增加 fallback 状态)
    const avatarUrl = normalizeTwitterUrl(author?.avatar);

    // 调试日志 (已关闭)
    // if (!avatarUrl) console.log(`[Card] No avatar for ${author?.name}`, author);
    // else console.log(`[Card] Avatar for ${author?.name}:`, avatarUrl);

    // 2. 媒体处理 (增加容错)
    const firstMedia = tweet.media?.[0];
    // 强制探测预览图：如果 media 里没 previewUrl，尝试回退到 url (假设 url 是图片)
    const rawPreview = firstMedia?.previewUrl || (firstMedia?.type === 'image' ? firstMedia.url : '');
    const thumbnailUrl = normalizeTwitterUrl(rawPreview);

    const videoUrl = firstMedia?.type === 'video' ? firstMedia.url.replace('http:', 'https:') : '';

    return (
        <div className={cn(
            "group relative glass-card rounded-xl overflow-hidden flex flex-col transition-all duration-300",
            "p-3 gap-2 border-b border-white/5",
            "break-inside-avoid w-full box-border mb-4"
        )}>
            {/* Header Area */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
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

            {/* AI Summary */}
            {tweet.aiSummary && (
                <div className={cn(
                    "text-zinc-200 text-[13px] leading-[1.4] p-2.5 rounded-xl border italic mb-1",
                    tweet.aiScore && tweet.aiScore >= 90 ? "bg-rose-400/5 border-rose-400/10" : "bg-white/[0.03] border-white/5"
                )}>
                    <span className={cn(
                        "font-black mr-2 text-[10px]",
                        tweet.aiScore && tweet.aiScore >= 90 ? "text-rose-400" : "text-brand"
                    )}>{t('card_ai_label')}:</span>
                    {tweet.aiSummary}
                </div>
            )}

            {/* Content Area */}
            <div className="relative">
                <div className={cn(
                    "text-zinc-300 break-words transition-all duration-300",
                    "text-[14px] leading-[1.4]",
                    !isExpanded && isMasonry && "line-clamp-5"
                )}>
                    {tweet.text || "(No Text Content)"}
                </div>

                {hasLongText && isMasonry && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-1 text-[11px] font-bold text-brand hover:text-brand transition-colors"
                    >
                        {isExpanded ? t('card_show_less') : t('card_read_more')}
                    </button>
                )}
            </div>

            {/* Media/Video Area (重点修复封面显示) */}
            {thumbnailUrl && (
                <div className="aspect-video rounded-xl bg-zinc-900 overflow-hidden relative border border-white/5 mt-1 group-hover:border-white/10 transition-colors">
                    {!isPlayerActive ? (
                        <>
                            <img
                                src={thumbnailUrl}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer"
                                alt="Media Thumbnail"
                                onClick={() => firstMedia?.type === 'video' && setIsPlayerActive(true)}
                                referrerPolicy="no-referrer"
                            />
                            {firstMedia?.type === 'video' && (
                                <div
                                    className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors cursor-pointer"
                                    onClick={() => setIsPlayerActive(true)}
                                >
                                    <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20 text-white shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                                        <Play size={20} fill="white" className="ml-1" />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <video
                            src={videoUrl}
                            className="w-full h-full object-contain bg-black"
                            controls
                            autoPlay
                            playsInline
                        />
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
                <div className="text-[10px] font-medium opacity-50 italic">
                    {tweet.createdAt ? new Date(tweet.createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' }) : '00/00'}
                </div>
            </div>
        </div>
    );
};
