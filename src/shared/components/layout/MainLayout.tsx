import React from 'react';
import { Sidebar } from './Sidebar';
import { useUIStore } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import { version } from '../../../../package.json';
import { Menu } from 'lucide-react';
import { isSafariIOS } from '../../utils/platform';

interface MainLayoutProps {
    children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const { activeView } = useUIStore();
    const { t } = useTranslation();
    const [isHovered, setIsHovered] = React.useState(false);
    const [isPinned, setIsPinned] = React.useState(false);
    const hoverTimeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        setIsHovered(false);
    }, [activeView]);

    React.useEffect(() => () => {
        if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    }, []);

    const handleMouseEnter = () => {
        if (isPinned) return; // 已固定时不响应悬停
        if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        if (isPinned) return; // 已固定时不自动收起

        hoverTimeoutRef.current = window.setTimeout(() => {
            setIsHovered(false);
        }, 300);
    };

    const handleTogglePin = () => {
        if (isSafariIOS && window.matchMedia('(max-width: 1023px)').matches) return;
        setIsPinned(prev => !prev);
        setIsHovered(false); // 切换时关闭悬浮状态
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
            {/* 固定模式：侧边栏占据实际空间 */}
            {isPinned && (
                <div className="shrink-0">
                    <Sidebar
                        forceExpand={true}
                        isPinned={isPinned}
                        onTogglePin={handleTogglePin}
                    />
                </div>
            )}

            {/* 悬浮模式：作为 Overlay 浮层 */}
            {!isPinned && (
                <>
                    <button
                        type="button"
                        aria-label="打开导航菜单"
                        aria-expanded={isHovered}
                        className="fixed left-3 bottom-12 z-[70] w-11 h-11 flex items-center justify-center rounded-xl bg-zinc-900 border border-white/20 text-zinc-200 shadow-md"
                        onClick={() => setIsHovered(value => !value)}
                    ><Menu size={20} /></button>
                    {/* 边缘触发感应区 (最左侧 16px) */}
                    <div
                        className="fixed left-0 top-0 bottom-0 w-4 z-[60]"
                        onMouseEnter={handleMouseEnter}
                    />

                    {/* 侧边导航浮层 */}
                    <div
                        className="fixed left-0 top-0 bottom-0 z-50 pointer-events-none"
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="pointer-events-auto h-full">
                            <Sidebar
                                forceExpand={isHovered}
                                isPinned={isPinned}
                                onTogglePin={handleTogglePin}
                            />
                        </div>
                    </div>
                </>
            )}

            {/* 主画布 */}
            <main
                className="flex-1 relative overflow-hidden flex flex-col z-10"
                style={{ contain: 'content' } as React.CSSProperties}
            >
                {/* 页面切换动效 */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeView}
                        data-view={activeView}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className={['intelligence', 'settings', 'connections'].includes(activeView)
                            ? "flex-1 overflow-hidden flex flex-col w-full h-full"
                            : "flex-1 overflow-y-auto overflow-x-hidden"}
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>

                {/* 全局状态条 (极简) */}
                <footer className="h-8 shrink-0 border-t border-white/5 bg-black/20 backdrop-blur-sm flex items-center px-3 md:px-6 text-[10px] text-zinc-600 gap-3 md:gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="uppercase tracking-wider font-medium">{t('status_interceptor_active')}</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-white/5 pl-4">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                        <span className="uppercase tracking-wider font-medium">{t('status_ai_idle')}</span>
                    </div>
                    <div className="flex-1" />
                    <span className="opacity-40">{t('status_version_prefix')}{version}</span>
                </footer>
            </main>
        </div>
    );
};
