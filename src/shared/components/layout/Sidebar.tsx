import React from 'react';
import {
    LayoutDashboard,
    BrainCircuit,
    BarChart3,
    LineChart,
    Settings2,
    Network,
    Image as ImageIcon
} from 'lucide-react';
import { useUIStore, ViewType } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface SidebarProps {
    forceExpand?: boolean;
    isPinned?: boolean;
    onTogglePin?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ forceExpand = false, isPinned = false, onTogglePin }) => {
    const { activeView, setActiveView } = useUIStore();
    const { t } = useTranslation();

    const navItems = [
        { id: 'feed', icon: LayoutDashboard, label: t('nav_feed') },
        { id: 'stats', icon: BarChart3, label: t('nav_stats') },
        { id: 'analytics', icon: LineChart, label: t('nav_analytics') },
        { id: 'intelligence', icon: BrainCircuit, label: t('nav_intelligence') },
        { id: 'connections', icon: Network, label: '连结' },
        { id: 'gallery', icon: ImageIcon, label: t('nav_gallery') },
        { id: 'settings', icon: Settings2, label: t('nav_settings') },
    ];

    const shouldExpand = forceExpand || isPinned;

    return (
        <aside
            className={cn(
                "h-screen flex flex-col relative transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] bg-zinc-900/95 backdrop-blur-xl border-r border-white/10 select-none shrink-0 overflow-hidden shadow-[20px_0_50px_rgba(0,0,0,0.5)]",
                shouldExpand ? "w-[200px] opacity-100 translate-x-0" : "w-0 opacity-0 -translate-x-full"
            )}
        >
            {/* Header: Logo (Click to Pin) */}
            <div
                className={cn(
                    "h-20 flex items-center px-6 shrink-0 border-b transition-all cursor-pointer group",
                    isPinned
                        ? "border-brand/20 bg-brand/5"
                        : "border-white/[0.05] hover:bg-white/[0.02]"
                )}
                onClick={onTogglePin}
                title={isPinned ? "点击取消固定 / Click to unpin" : "点击固定侧边栏 / Click to pin"}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-xl transition-all",
                        isPinned && "ring-2 ring-brand/50"
                    )}>
                        <img src="/icon.png" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <span className={cn(
                        "font-bold text-base tracking-tight transition-colors",
                        isPinned ? "text-brand" : "text-white group-hover:text-brand/80"
                    )}>
                        ThatTweet
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-1 mt-6">
                {navItems.map((item) => {
                    const isActive = activeView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveView(item.id as ViewType)}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all relative group",
                                isActive
                                    ? "text-brand"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-active-bg"
                                    className="absolute inset-0 bg-brand/10 border border-brand/20 rounded-xl"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}

                            <item.icon
                                size={18}
                                strokeWidth={isActive ? 2.5 : 2}
                                className={cn(
                                    "shrink-0 transition-transform duration-300 z-10",
                                    isActive ? "scale-100" : "group-hover:translate-x-0.5"
                                )}
                            />

                            <span className="text-sm font-medium whitespace-nowrap z-10">
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
};
