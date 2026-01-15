import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { createPortal } from 'react-dom';

/**
 * 🛠️ 极简媒体预览组件 (Minimalistic Lightbox)
 * 全程滚动切换，无多余 UI 干扰。
 */
export const MediaLightbox: React.FC = () => {
    const { lightbox, closeLightbox, setLightboxIndex } = useUIStore();
    const { isOpen, media, index } = lightbox;
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastWheelTime = useRef<number>(0);

    // 同步滚动位置到当前 index
    useEffect(() => {
        if (isOpen && scrollRef.current) {
            const container = scrollRef.current;
            const targetLeft = index * container.clientWidth;
            // 只有当偏差较大时才强制同步，避免与手势滚动冲突
            if (Math.abs(container.scrollLeft - targetLeft) > 10) {
                container.scrollTo({
                    left: targetLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [isOpen, index]);

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();

        const now = Date.now();
        if (now - lastWheelTime.current < 400) return; // 400ms 频率限制，防止飞快翻页

        if (Math.abs(e.deltaY) > 30) {
            if (e.deltaY > 0 && index < media.length - 1) {
                setLightboxIndex(index + 1);
                lastWheelTime.current = now;
            } else if (e.deltaY < 0 && index > 0) {
                setLightboxIndex(index - 1);
                lastWheelTime.current = now;
            }
        }
    };

    if (!isOpen || !media.length) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-950/70 backdrop-blur-3xl animate-in fade-in duration-500 ease-out"
            onClick={closeLightbox}
            onWheel={handleWheel}
        >
            {/* Ambient Background Glow - Subtle blue hue to enhance the glass feel */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vw] h-[120vh] bg-[radial-gradient(circle_at_center,rgba(29,155,240,0.08)_0%,transparent_70%)]" />
                <div className="absolute inset-0 bg-white/[0.01] pointer-events-none" /> {/* Micro-grain hint */}
            </div>
            {/* Scroll Container */}
            <div
                ref={scrollRef}
                className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
                onScroll={(e) => {
                    const container = e.currentTarget;
                    const newIndex = Math.round(container.scrollLeft / container.clientWidth);
                    if (newIndex !== index) setLightboxIndex(newIndex);
                }}
            >
                {media.map((item, i) => (
                    <div
                        key={i}
                        className="flex-none w-full h-full flex items-center justify-center snap-center p-4"
                        onClick={(e) => {
                            // 只有点击图片外的区域才关闭
                            if (e.target === e.currentTarget) closeLightbox();
                        }}
                    >
                        <div
                            className="relative max-w-full max-h-full flex items-center justify-center animate-in zoom-in-95 duration-300"
                            onClick={e => e.stopPropagation()}
                        >
                            {item.type === 'video' || item.type === 'gif' ? (
                                <video
                                    src={item.url}
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
                                />
                            ) : (
                                <img
                                    src={item.url.includes('pbs.twimg.com') ? `${item.url.split('?')[0]}?format=jpg&name=large` : item.url}
                                    alt={`Media ${i + 1}`}
                                    className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl select-none"
                                    referrerPolicy="no-referrer"
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Dots (Very Subtle Indicator) */}
            {media.length > 1 && (
                <div
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-black/20 backdrop-blur-md border border-white/5 rounded-full pointer-events-none"
                >
                    {media.map((_, i) => (
                        <div
                            key={i}
                            className={`h-1 rounded-full transition-all duration-300 ${i === index ? 'w-4 bg-white/80' : 'w-1 bg-white/10'}`}
                        />
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
};
