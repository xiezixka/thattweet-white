import React, { useState } from 'react';
import { Tweet } from '../types/tweet';
import { UserCache } from '../types/tweet';
import { Calendar, MessageCircle, Heart, Repeat2, Tag, Eye, ChevronDown, ChevronUp } from 'lucide-react';
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

export const TweetCard: React.FC<TweetCardProps> = ({ tweet, author, mode = 'masonry' }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { t } = useTranslation();
    const isMasonry = mode === 'masonry';

    const scoreStyles = tweet.aiScore !== undefined ? getScoreStyles(tweet.aiScore) : '';
    const hasLongText = tweet.text.length > 140;

    return (
        <div className={cn(
            "group relative glass-card rounded-xl overflow-hidden flex flex-col transition-all duration-300",
            "p-3 gap-2 border-b border-white/5",
            "break-inside-avoid w-full box-border mb-4"
        )}>
            {/* Header Area */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                    <img
                        src={author.avatar}
                        alt={author.name}
                        className="w-10 h-10 rounded-full border border-white/10"
                    />
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[14px] leading-tight text-zinc-100 truncate max-w-[140px]">{author.name}</span>
                        <span className="text-[13px] text-zinc-500 leading-tight">@{author.handle}</span>
                    </div>
                </div>

                {tweet.aiScore !== undefined && (
                    <div className={cn(
                        "px-2 py-0.5 rounded-lg border text-[10px] font-black italic tracking-tighter transition-all duration-500",
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

            {/* Main Content Area */}
            <div className="relative">
                <div className={cn(
                    "text-zinc-300 break-words transition-all duration-300",
                    "text-[14px] leading-[1.4]",
                    !isExpanded && isMasonry && "line-clamp-5 truncate-multiline"
                )}>
                    {tweet.text}
                </div>

                {hasLongText && isMasonry && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-1 text-[11px] font-bold text-brand/70 hover:text-brand flex items-center gap-0.5 transition-colors"
                    >
                        {isExpanded ? (
                            <>{t('card_show_less')} <ChevronUp size={12} /></>
                        ) : (
                            <>{t('card_read_more')} <ChevronDown size={12} /></>
                        )}
                    </button>
                )}
            </div>

            {/* Media Area */}
            {tweet.media && tweet.media.length > 0 && (
                <div className="aspect-video rounded-xl bg-zinc-800/50 overflow-hidden relative border border-white/5 mt-1">
                    <img
                        src={tweet.media[0].url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt="Media"
                    />
                </div>
            )}

            {/* Footer Area - Fixed: Restored all 4 stats */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5 text-zinc-600">
                <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 hover:text-brand transition-colors cursor-default" title="Replies">
                        <MessageCircle size={12} /> {formatNumber(tweet.replyCount)}
                    </span>
                    <span className="flex items-center gap-1 hover:text-emerald-500 transition-colors cursor-default" title="Retweets">
                        <Repeat2 size={12} /> {formatNumber(tweet.retweetCount)}
                    </span>
                    <span className="flex items-center gap-1 hover:text-rose-400 transition-colors cursor-default" title="Likes">
                        <Heart size={12} /> {formatNumber(tweet.favoriteCount)}
                    </span>
                    <span className="flex items-center gap-1 cursor-default" title="Views">
                        <Eye size={12} /> {formatNumber(tweet.viewCount || 0)}
                    </span>
                </div>
                <div className="text-[10px] font-medium flex items-center gap-1 opacity-60 italic">
                    <Calendar size={12} />
                    {new Date(tweet.createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
                </div>
            </div>
        </div>
    );
};
