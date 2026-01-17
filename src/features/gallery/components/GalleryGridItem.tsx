import React, { useState } from 'react';
import { Tweet, MediaItem } from '../../../shared/types/tweet';
import { normalizeTwitterImage } from '../../../shared/utils/image';
import { cn } from '../../../shared/utils/cn';

interface GalleryGridItemProps {
    media: MediaItem;
    tweet: Tweet;
    index: number;
    onClick: () => void;
}

export const GalleryGridItem: React.FC<GalleryGridItemProps> = ({ media, tweet, onClick }) => {
    const author = typeof tweet.author === 'object' ? tweet.author : null;
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="break-inside-avoid group relative bg-zinc-900 rounded-xl overflow-hidden cursor-zoom-in border border-white/5 hover:border-white/10 transition-colors shadow-lg mb-4"
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <img
                src={normalizeTwitterImage(media.type === 'video' && media.previewUrl ? media.previewUrl : media.url, 'media')}
                alt="Gallery Item"
                className={cn(
                    "w-full h-auto object-cover transition-transform duration-700",
                    isHovered ? "scale-105" : "scale-100"
                )}
                loading="lazy"
            />

            {/* Video Indicator */}
            {media.type === 'video' && (
                <div className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 backdrop-blur text-white pl-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </div>
            )}

            {/* Overlay */}
            <div className={cn(
                "absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-4 transition-opacity duration-300",
                isHovered ? "opacity-100" : "opacity-0"
            )}>
                {author && (
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-white/20">
                            <img
                                src={normalizeTwitterImage(author.avatar, 'avatar')}
                                className="w-full h-full object-cover"
                                alt={author.name}
                            />
                        </div>
                        <span className="text-xs font-bold text-zinc-100 truncate shadow-black drop-shadow-md">@{author.handle}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
