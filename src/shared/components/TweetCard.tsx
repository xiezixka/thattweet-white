import React from 'react';
import { Tweet } from '../types/tweet';
import { UserCache } from '../types/tweet';
import { Calendar, MessageCircle, Heart, Repeat2, BarChart2, Tag } from 'lucide-react';
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

export const TweetCard: React.FC<TweetCardProps> = ({ tweet, author, mode = 'masonry' }) => {
    const isMasonry = mode === 'masonry';

    return (
        <div className={cn(
            "group relative glass-card rounded-2xl overflow-hidden flex flex-col",
            isMasonry ? "p-5 gap-4" : "p-3 gap-2 text-sm"
        )}>
            {/* Header: Author & Score */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <img
                        src={author.avatar}
                        alt={author.name}
                        className="w-10 h-10 rounded-full border border-white/10"
                    />
                    <div className="flex flex-col">
                        <span className="font-bold text-sm leading-tight text-zinc-100">{author.name}</span>
                        <span className="text-xs text-zinc-500 leading-tight">@{author.handle}</span>
                    </div>
                </div>

                {tweet.aiScore && (
                    <div className="px-2 py-1 rounded-lg bg-brand/10 border border-brand/20 text-[10px] font-bold text-brand">
                        SCORE {tweet.aiScore}
                    </div>
                )}
            </div>

            {/* AI Headline / Summary */}
            {tweet.aiSummary && (
                <div className="text-zinc-200 font-medium leading-relaxed bg-white/[0.03] p-3 rounded-xl border border-white/5">
                    {tweet.aiSummary}
                </div>
            )}

            {/* Main Text (Collapsible in Masonry) */}
            <p className={cn(
                "text-zinc-400 leading-normal",
                isMasonry ? "text-sm line-clamp-3 group-hover:line-clamp-none transition-all" : "text-xs"
            )}>
                {tweet.text}
            </p>

            {/* Media Placeholder */}
            {tweet.media && tweet.media.length > 0 && (
                <div className="aspect-video rounded-xl bg-zinc-800/50 overflow-hidden relative">
                    <img
                        src={tweet.media[0].url}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        alt="Media"
                    />
                    {tweet.media.length > 1 && (
                        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[10px] text-white">
                            +{tweet.media.length - 1}
                        </div>
                    )}
                </div>
            )}

            {/* AI Tags */}
            {tweet.aiTags && tweet.aiTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {tweet.aiTags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/50 text-[10px] text-zinc-400 border border-white/5">
                            <Tag size={10} />
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Footer: Stats */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5 text-zinc-500">
                <div className="flex items-center gap-4 text-[10px]">
                    <span className="flex items-center gap-1"><MessageCircle size={12} /> {tweet.replyCount}</span>
                    <span className="flex items-center gap-1"><Repeat2 size={12} /> {tweet.retweetCount}</span>
                    <span className="flex items-center gap-1"><Heart size={12} /> {tweet.favoriteCount}</span>
                </div>
                <div className="text-[10px] flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(tweet.createdAt).toLocaleDateString()}
                </div>
            </div>
        </div>
    );
};
