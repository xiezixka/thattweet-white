import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { createPortal } from 'react-dom';
import { Sparkles, FileText, Loader2, RefreshCw, X, Copy, Check } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

/**
 * 🛠️ 极简媒体预览组件 (Minimalistic Lightbox)
 * 全程滚动切换，无多余 UI 干扰。
 */
export const MediaLightbox: React.FC = () => {
    const { lightbox, closeLightbox, setLightboxIndex } = useUIStore();
    const { isOpen, media, index, analysis } = lightbox;
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastWheelTime = useRef<number>(0);
    const [copied, setCopied] = React.useState(false);
    const { t } = useTranslation();

    const handleCopyOcr = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

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
            {/* Main Layout Container */}
            <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden">
                {/* 1. Scroll Container (Focus Area) */}
                <div
                    className="flex-1 h-full relative overflow-hidden"
                >
                    <div
                        ref={scrollRef}
                        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
                        onScroll={(e) => {
                            const container = e.currentTarget;
                            const newIndex = Math.round(container.scrollLeft / container.clientWidth);
                            if (newIndex !== index) {
                                setLightboxIndex(newIndex);
                                setCopied(false);
                            }
                        }}
                    >
                        {media.map((item, i) => (
                            <div
                                key={i}
                                className="flex-none w-full h-full flex items-center justify-center snap-center relative p-8 md:p-16"
                                onClick={closeLightbox}
                            >
                                <div
                                    className="relative group/media max-w-full max-h-full flex items-center justify-center perspective-1000 transition-transform duration-700 ease-out hover:scale-[1.01]"
                                    onClick={e => e.stopPropagation()}
                                >
                                    {/* Soft Glow Backdrop for Image */}
                                    <div className="absolute -inset-16 bg-brand/5 blur-[120px] rounded-full opacity-30 pointer-events-none" />

                                    {item.type === 'video' || item.type === 'gif' ? (
                                        <video
                                            src={item.url}
                                            controls
                                            autoPlay
                                            className="relative max-w-full max-h-[80vh] rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5 object-contain z-10 select-none"
                                        />
                                    ) : (
                                        <img
                                            src={item.url.includes('pbs.twimg.com') ? `${item.url.split('?')[0]}?format=jpg&name=large` : item.url}
                                            alt={`Media ${i + 1}`}
                                            className="relative max-w-full max-h-[80vh] object-contain rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5 select-none z-10"
                                            referrerPolicy="no-referrer"
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom Indicator Dots (Inside Scroll Container Area) */}
                    {media.length > 1 && (
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full pointer-events-none z-20">
                            {media.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/20'}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. Persistent Intelligence Sidebar (Desktop Only) */}
                <div
                    className="hidden md:flex flex-col w-[420px] h-full bg-zinc-950/40 backdrop-blur-3xl border-l border-white/5 z-20 transition-all duration-500"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Sidebar Header - Always Visible */}
                    <div className="p-8 pb-4 border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-brand uppercase tracking-[0.2em] leading-none mb-1">Intelligence</div>
                                <div className="text-sm font-bold text-white/90 uppercase tracking-tight">AI Insights</div>
                            </div>
                        </div>
                    </div>

                    {/* Content Scrollable Area */}
                    <div className="flex-1 overflow-y-auto no-scrollbar p-8">
                        {analysis && analysis[index] && (analysis[index].description || analysis[index].ocr) ? (
                            <div key={index} className="space-y-12 animate-in fade-in duration-500">
                                {/* Vision Section */}
                                {analysis[index]?.description && (
                                    <section>
                                        <div className="text-[11px] font-bold text-white/30 uppercase tracking-[0.1em] mb-4">Vision context</div>
                                        <p className="text-zinc-100 text-[17px] leading-relaxed font-medium tracking-tight">
                                            {analysis[index].description}
                                        </p>
                                    </section>
                                )}

                                {/* OCR Section */}
                                {analysis[index]?.ocr && (
                                    <section>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="text-[11px] font-bold text-white/30 uppercase tracking-[0.1em]">Extracted text</div>
                                            <button
                                                onClick={() => handleCopyOcr(analysis[index].ocr!)}
                                                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                                            >
                                                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                {copied ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 shadow-inner">
                                            <p className="text-zinc-400 text-sm font-mono whitespace-pre-wrap leading-relaxed selection:bg-brand/30">
                                                {analysis[index].ocr}
                                            </p>
                                        </div>
                                    </section>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center space-y-4">
                                <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                                    <Loader2 size={20} className="animate-spin duration-[3s]" />
                                </div>
                                <div className="text-[11px] font-bold uppercase tracking-widest text-white/40">Analyzing media...</div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar Footer */}
                    <div className="p-6 border-t border-white/5 bg-black/20">
                        <div className="flex items-center justify-between opacity-20 select-none">
                            <div className="text-[9px] font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                                Model: SiliconFlow VLM
                            </div>
                            <div className="text-[9px] font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                <Check size={10} />
                                Safe Search
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Mobile Adaptive Drawer */}
                <div className="md:hidden p-6 absolute bottom-0 left-0 right-0 z-30" onClick={e => e.stopPropagation()}>
                    {analysis && analysis[index] && (
                        <div className="p-6 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-[32px] max-h-[40vh] overflow-y-auto shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-10 duration-500">
                            <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-6" />
                            <div className="space-y-6">
                                {analysis[index].description && (
                                    <div>
                                        <div className="text-[10px] font-bold text-brand uppercase tracking-widest mb-2">Vision</div>
                                        <p className="text-zinc-100 text-sm leading-relaxed">{analysis[index].description}</p>
                                    </div>
                                )}
                                {analysis[index].ocr && (
                                    <div className="pt-6 border-t border-white/5">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">OCR</div>
                                            <button onClick={() => handleCopyOcr(analysis[index].ocr!)} className="text-[10px] font-bold text-zinc-400 uppercase">Copy</button>
                                        </div>
                                        <p className="text-zinc-400 text-xs font-mono bg-black/40 p-3 rounded-xl">{analysis[index].ocr}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>,
        document.body
    );
};
