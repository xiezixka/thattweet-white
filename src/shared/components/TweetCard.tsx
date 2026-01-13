import React from 'react';
import { Tweet } from '../types/tweet';
import { UserCache } from '../types/tweet';
import { Calendar, MessageCircle, Heart, Repeat2, Tag, Eye } from 'lucide-react';
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

export const TweetCard: React.FC<TweetCardProps> = ({ tweet, author, mode = 'masonry' }) => {
    const isMasonry = mode === 'masonry';

    return (
        <div className={cn(
            "group relative glass-card rounded-2xl overflow-hidden flex flex-col transition-all duration-300",
            "p-4 gap-4 border-b border-white/5", // Balanced Padding (16px)
            "break-inside-avoid w-full box-border mb-4" // Old Spec Flow Logic
        )}>
            {/* Header: Author & Info (14px / 13px / 12px) */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img
                        src={author.avatar}
                        alt={author.name}
                        className="w-10 h-10 rounded-full border border-white/10"
                    />
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[14px] leading-tight text-zinc-100 truncate max-w-[150px]">{author.name}</span>
                        <span className="text-[13px] text-zinc-500 leading-tight">@{author.handle}</span>
                    </div>
                </div>

                {tweet.aiScore !== undefined && (
                    <div className="px-2 py-0.5 rounded-lg bg-brand/10 border border-brand/20 text-[10px] font-bold text-brand italic tracking-tight">
                        {tweet.aiScore}
                    </div>
                )}
            </div>

            {/* AI Summary Section */}
            {tweet.aiSummary && (
                <div className="text-zinc-200 text-[14px] leading-[1.5] bg-white/[0.03] p-3 rounded-xl border border-white/5 italic">
                    <span className="text-brand font-black mr-2 text-[11px]">AI</span>
                    {tweet.aiSummary}
                </div>
            )}

            {/* Main Content (Old Spec: 14px / 1.4) */}
            <div className={cn(
                "text-zinc-300 break-words",
                "text-[14px] leading-[1.4]", // Fixed Old Spec Scale
                isMasonry ? "line-clamp-6 group-hover:line-clamp-none transition-all duration-500" : ""
            )}>
                {tweet.text}
            </div>

            {/* Media Content */}
            {tweet.media && tweet.media.length > 0 && (
                <div className="aspect-video rounded-xl bg-zinc-800/50 overflow-hidden relative border border-white/5">
                    <img
                        src={tweet.media[0].url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        alt="Media"
                    />
                </div>
            )}

            {/* Tags - Cleaner integration */}
            {tweet.aiTags && tweet.aiTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {tweet.aiTags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-md bg-zinc-800/30 text-[11px] text-zinc-500 border border-white/5">
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Footer Stats (12px Scale) */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5 text-zinc-600">
                <div className="flex items-center gap-4 text-[12px]">
                    <span className="flex items-center gap-1.5 hover:text-brand transition-colors cursor-default"><MessageCircle size={13} /> {formatNumber(tweet.replyCount)}</span>
                    <span className="flex items-center gap-1.5 hover:text-emerald-500 transition-colors cursor-default"><Repeat2 size={13} /> {formatNumber(tweet.retweetCount)}</span>
                    <span className="flex items-center gap-1.5 hover:text-rose-500 transition-colors cursor-default"><Heart size={13} /> {formatNumber(tweet.favoriteCount)}</span>
                    <span className="flex items-center gap-1.5"><Eye size={13} /> {formatNumber(tweet.viewCount || 0)}</span>
                </div>
                <div className="text-[12px] font-medium flex items-center gap-1.5 opacity-60">
                    <Calendar size={13} />
                    {new Date(tweet.createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
                </div>
            </div>
        </div>
    );
};
