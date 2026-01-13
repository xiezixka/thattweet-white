import React from 'react';
import { Sidebar } from './Sidebar';
import { useUIStore } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';

interface MainLayoutProps {
    children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
    const { activeView } = useUIStore();
    const { t } = useTranslation();

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-zinc-950">
            {/* 侧边导航 */}
            <Sidebar />

            {/* 主画布 */}
            <main className="flex-1 relative overflow-hidden flex flex-col">
                {/* 页面切换动效 */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeView}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="flex-1 overflow-y-auto no-scrollbar"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>

                {/* 全局状态条 (极简) */}
                <footer className="h-8 border-t border-white/5 bg-black/20 backdrop-blur-sm flex items-center px-6 text-[10px] text-zinc-600 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="uppercase tracking-wider font-medium">{t('status_interceptor_active')}</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-white/5 pl-4">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                        <span className="uppercase tracking-wider font-medium">{t('status_ai_idle')}</span>
                    </div>
                    <div className="flex-1" />
                    <span className="opacity-40">{t('status_version_prefix')}1.0.1 ALPHA</span>
                </footer>
            </main>
        </div>
    );
};
