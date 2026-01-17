import React, { useEffect, useCallback } from 'react';
import { useUIStore } from '../store/useUIStore';
import { createPortal } from 'react-dom';
import { Sparkles, Loader2, X, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

/**
 * 🛠️ 极简媒体预览组件 (Minimalistic Lightbox)
 * 单图直接显示模式，点哪张显示哪张。
 */
export const MediaLightbox: React.FC = () => {
    const { lightbox, closeLightbox, setLightboxIndex } = useUIStore();
    const { isOpen, media, index, analysis } = lightbox;
    const [copied, setCopied] = React.useState(false);
    const [provider, setProvider] = React.useState<string>('SiliconFlow');
    const { t } = useTranslation();

    useEffect(() => {
        chrome.storage.local.get(['aiSettings'], (res) => {
            if (res.aiSettings?.visionProvider === 'openrouter') {
                setProvider('OpenRouter');
            } else {
                setProvider('SiliconFlow');
            }
        });
    }, []);

    const handleCopyOcr = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // 键盘导航
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isOpen) return;

        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft' && index > 0) {
            setLightboxIndex(index - 1);
            setCopied(false);
        } else if (e.key === 'ArrowRight' && index < media.length - 1) {
            setLightboxIndex(index + 1);
            setCopied(false);
        }
    }, [isOpen, index, media.length, closeLightbox, setLightboxIndex]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const goToPrev = () => {
        if (index > 0) {
            setLightboxIndex(index - 1);
            setCopied(false);
        }
    };

    const goToNext = () => {
        if (index < media.length - 1) {
            setLightboxIndex(index + 1);
            setCopied(false);
        }
    };

    if (!isOpen || !media.length) return null;

    const currentItem = media[index];
    const currentAnalysis = analysis?.[index];

    return createPortal(
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-950/90 backdrop-blur-2xl animate-in fade-in duration-300 ease-out"
            onClick={closeLightbox}
        >
            {/* Close Button Top Right */}
            <button
                onClick={closeLightbox}
                className="absolute top-6 right-6 z-[10001] p-3 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all active:scale-95 group"
            >
                <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>

            {/* Navigation Arrows */}
            {media.length > 1 && (
                <>
                    {index > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); goToPrev(); }}
                            className="absolute left-6 top-1/2 -translate-y-1/2 z-[10001] p-4 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all active:scale-95"
                        >
                            <ChevronLeft size={28} />
                        </button>
                    )}
                    {index < media.length - 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); goToNext(); }}
                            className="absolute right-6 top-1/2 -translate-y-1/2 z-[10001] p-4 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all active:scale-95"
                        >
                            <ChevronRight size={28} />
                        </button>
                    )}
                </>
            )}

            {/* Main Content Container */}
            <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden">

                {/* Image Display Area - Click outside image to close */}
                <div className="flex-1 h-full flex items-center justify-center p-8 md:p-16" onClick={closeLightbox}>
                    <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        {/* Soft Glow Backdrop */}
                        <div className="absolute -inset-16 bg-brand/5 blur-[120px] rounded-full opacity-30 pointer-events-none" />

                        {currentItem.type === 'video' || currentItem.type === 'gif' ? (
                            <video
                                key={index}
                                src={currentItem.url?.startsWith('blob:') ? '' : currentItem.url}
                                poster={currentItem.previewUrl}
                                controls
                                autoPlay={!currentItem.url?.startsWith('blob:')}
                                loop={currentItem.type === 'gif'}
                                muted={currentItem.type === 'gif'}
                                playsInline
                                className="relative max-w-full max-h-[85vh] rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5 object-contain z-10 select-none bg-black/40"
                                onError={(e) => {
                                    const target = e.currentTarget;
                                    target.style.display = 'none';
                                    const img = document.createElement('img');
                                    img.src = currentItem.previewUrl || '';
                                    img.className = target.className;
                                    target.parentElement?.appendChild(img);
                                }}
                            />
                        ) : (
                            <img
                                key={index}
                                src={currentItem.url.includes('pbs.twimg.com') ? `${currentItem.url.split('?')[0]}?format=jpg&name=large` : currentItem.url}
                                alt={`Media ${index + 1}`}
                                className="relative max-w-full max-h-[85vh] object-contain rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5 select-none z-10"
                                referrerPolicy="no-referrer"
                            />
                        )}
                    </div>
                </div>

                {/* Sidebar (Desktop Only) - Hide in clean mode */}
                {lightbox.mode !== 'clean' && (
                    <div
                        className="hidden md:flex flex-col w-[420px] h-full bg-zinc-950/40 backdrop-blur-3xl border-l border-white/5 z-20"
                    >
                        {/* Sidebar Header */}
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
                            {currentAnalysis && (currentAnalysis.description || currentAnalysis.ocr) ? (
                                <div key={index} className="space-y-12 animate-in fade-in duration-500">
                                    {/* Vision Section */}
                                    {currentAnalysis.description && (
                                        <section>
                                            <div className="text-[11px] font-bold text-white/30 uppercase tracking-[0.1em] mb-4">Vision context</div>
                                            <p className="text-zinc-100 text-[17px] leading-relaxed font-medium tracking-tight">
                                                {currentAnalysis.description}
                                            </p>
                                        </section>
                                    )}

                                    {/* OCR Section */}
                                    {currentAnalysis.ocr && (
                                        <section>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="text-[11px] font-bold text-white/30 uppercase tracking-[0.1em]">Extracted text</div>
                                                <button
                                                    onClick={() => handleCopyOcr(currentAnalysis.ocr!)}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                                                >
                                                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                    {copied ? 'Copied' : 'Copy'}
                                                </button>
                                            </div>
                                            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 shadow-inner">
                                                <p className="text-zinc-400 text-sm font-mono whitespace-pre-wrap leading-relaxed selection:bg-brand/30">
                                                    {currentAnalysis.ocr}
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
                                    Model: {provider} VLM
                                </div>
                                <div className="text-[9px] font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Check size={10} />
                                    Safe Search
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mobile Adaptive Drawer - Hide in clean mode */}
                {lightbox.mode !== 'clean' && (
                    <div className="md:hidden p-6 absolute bottom-0 left-0 right-0 z-30">
                        {currentAnalysis && (
                            <div className="p-6 bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-[32px] max-h-[40vh] overflow-y-auto shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-10 duration-500">
                                <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-6" />
                                <div className="space-y-6">
                                    {currentAnalysis.description && (
                                        <div>
                                            <div className="text-[10px] font-bold text-brand uppercase tracking-widest mb-2">Vision</div>
                                            <p className="text-zinc-100 text-sm leading-relaxed">{currentAnalysis.description}</p>
                                        </div>
                                    )}
                                    {currentAnalysis.ocr && (
                                        <div className="pt-6 border-t border-white/5">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">OCR</div>
                                                <button onClick={() => handleCopyOcr(currentAnalysis.ocr!)} className="text-[10px] font-bold text-zinc-400 uppercase">Copy</button>
                                            </div>
                                            <p className="text-zinc-400 text-xs font-mono bg-black/40 p-3 rounded-xl">{currentAnalysis.ocr}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Page Indicator */}
            {media.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[10001] px-4 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full text-xs font-bold text-white tracking-widest leading-none">
                    {index + 1} <span className="text-white/30 mx-1">/</span> {media.length}
                </div>
            )}

        </div>,
        document.body
    );
};
