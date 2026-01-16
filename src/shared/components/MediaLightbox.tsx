import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { createPortal } from 'react-dom';
import { Sparkles, FileText, Loader2, RefreshCw, X } from 'lucide-react';

/**
 * 🛠️ 极简媒体预览组件 (Minimalistic Lightbox)
 * 全程滚动切换，无多余 UI 干扰。
 */
export const MediaLightbox: React.FC = () => {
    const { lightbox, closeLightbox, setLightboxIndex } = useUIStore();
    const { isOpen, media, index, analysis } = lightbox;
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
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-950/80 backdrop-blur-3xl animate-in fade-in duration-500 ease-out"
            onWheel={handleWheel}
        >
            {/* Close Button Top Right */}
            <button
                onClick={closeLightbox}
                className="absolute top-8 right-8 z-[10001] p-3 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all active:scale-95 group"
            >
                <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>

            {/* Ambient Background Glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" onClick={closeLightbox}>
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
                        className="flex-none w-full h-full flex items-center justify-center snap-center relative"
                    >
                        <div
                            className="w-full h-full flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 p-10 md:p-16 animate-in fade-in zoom-in-95 duration-500"
                            onClick={closeLightbox}
                        >
                            {/* Left Panel: Vision Analysis (Desktop) */}
                            {analysis && analysis[i]?.description && (
                                <div
                                    className="hidden md:flex flex-col w-[380px] h-fit max-h-[75vh] p-10 bg-gradient-to-br from-white/[0.05] to-transparent backdrop-blur-3xl border border-white/10 rounded-[48px] shadow-[0_48px_96px_-24px_rgba(0,0,0,0.8)] animate-in slide-in-from-left-8 duration-700 delay-100"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-12 h-12 rounded-[20px] bg-brand/10 border border-brand/20 flex items-center justify-center text-brand shadow-[0_0_20px_rgba(29,155,240,0.2)]">
                                            <Sparkles size={24} />
                                        </div>
                                        <div>
                                            <div className="text-[11px] font-black text-brand uppercase tracking-[0.3em] leading-none mb-1.5">Vision</div>
                                            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Context Analysis</div>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto no-scrollbar py-2">
                                        <p className="text-zinc-100 text-lg leading-relaxed font-medium tracking-tight">
                                            {analysis[i].description}
                                        </p>
                                    </div>
                                    <div className="mt-8 pt-6 border-t border-white/5">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                                            <div className="w-1 h-1 rounded-full bg-brand" />
                                            Generated by SiliconFlow VLM
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Center: Hero Media */}
                            <div
                                className="flex-1 flex items-center justify-center relative z-10 perspective-1000"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="relative group/media hover:scale-[1.02] transition-transform duration-700 ease-out">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-amber-500/20 rounded-[36px] blur-2xl opacity-0 group-hover/media:opacity-100 transition-opacity duration-700" />
                                    {item.type === 'video' || item.type === 'gif' ? (
                                        <video
                                            src={item.url}
                                            controls
                                            autoPlay
                                            className="relative max-w-full max-h-[82vh] rounded-[32px] shadow-[0_64px_128px_-32px_rgba(0,0,0,0.9)] border border-white/10 object-contain"
                                        />
                                    ) : (
                                        <img
                                            src={item.url.includes('pbs.twimg.com') ? `${item.url.split('?')[0]}?format=jpg&name=large` : item.url}
                                            alt={`Media ${i + 1}`}
                                            className="relative max-w-full max-h-[82vh] object-contain rounded-[32px] shadow-[0_64px_128px_-32px_rgba(0,0,0,0.9)] border border-white/10 select-none"
                                            referrerPolicy="no-referrer"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Right Panel: OCR Stream (Desktop) */}
                            {analysis && analysis[i]?.ocr && (
                                <div
                                    className="hidden md:flex flex-col w-[380px] h-fit max-h-[75vh] p-10 bg-gradient-to-bl from-white/[0.05] to-transparent backdrop-blur-3xl border border-white/10 rounded-[48px] shadow-[0_48px_96px_-24px_rgba(0,0,0,0.8)] animate-in slide-in-from-right-8 duration-700 delay-100"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-12 h-12 rounded-[20px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                                            <FileText size={24} />
                                        </div>
                                        <div>
                                            <div className="text-[11px] font-black text-amber-500 uppercase tracking-[0.3em] leading-none mb-1.5">OCR</div>
                                            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Extracted Content</div>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto no-scrollbar py-2">
                                        <p className="text-zinc-300 text-sm font-mono whitespace-pre-wrap leading-relaxed opacity-90 selection:bg-amber-500/20 scroll-smooth">
                                            {analysis[i].ocr}
                                        </p>
                                    </div>
                                    <div className="mt-8 pt-6 border-t border-white/5">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                                            <div className="w-1 h-1 rounded-full bg-amber-500" />
                                            DeepSeek OCR Precision
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Mobile Fallback Overlay */}
                            <div className="md:hidden mt-4" onClick={e => e.stopPropagation()}>
                                {analysis && analysis[i] && (
                                    <div className="p-6 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl max-h-[40vh] overflow-y-auto">
                                        <div className="space-y-4">
                                            {analysis[i].description && (
                                                <p className="text-zinc-200 text-sm leading-relaxed">{analysis[i].description}</p>
                                            )}
                                            {analysis[i].ocr && (
                                                <div className="pt-4 border-t border-white/10">
                                                    <p className="text-zinc-400 text-xs font-mono">{analysis[i].ocr}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
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
