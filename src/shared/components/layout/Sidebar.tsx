import React from 'react';
import {
    LayoutDashboard,
    BrainCircuit,
    BarChart3,
    LineChart,
    Settings2,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { useUIStore, ViewType } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const Sidebar: React.FC = () => {
    const { activeView, setActiveView, sidebarCollapsed, toggleSidebar } = useUIStore();
    const { t } = useTranslation();

    const navItems = [
        { id: 'feed', icon: LayoutDashboard, label: t('nav_feed') },
        { id: 'intelligence', icon: BrainCircuit, label: t('nav_intelligence') },
        { id: 'stats', icon: BarChart3, label: t('nav_stats') },
        { id: 'analytics', icon: LineChart, label: t('nav_analytics') },
        { id: 'settings', icon: Settings2, label: t('nav_settings') },
    ];

    return (
        <aside
            className={cn(
                "h-screen flex flex-col relative transition-[width] duration-300 ease-in-out glass-panel border-r border-white/5 select-none shrink-0 will-change-[width]",
                sidebarCollapsed ? "w-[88px]" : "w-[260px]"
            )}
        >
            {/* Logo Area */}
            <div className={cn(
                "h-20 flex items-center gap-4 overflow-hidden transition-all duration-300",
                sidebarCollapsed ? "justify-center px-0" : "px-6"
            )}>
                <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-lg shadow-black/20">
                    <img src="/icon.png" alt="Logo" className="w-full h-full object-cover" />
                </div>
                <span className={cn(
                    "font-bold text-xl tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent whitespace-nowrap transition-opacity duration-300",
                    sidebarCollapsed ? "opacity-0 w-0 hidden" : "opacity-100"
                )}>
                    ThatTweet
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-2 mt-4 overflow-hidden">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveView(item.id as ViewType)}
                        className={cn(
                            "w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl transition-all group relative overflow-hidden",
                            activeView === item.id
                                ? "bg-brand/10 text-brand"
                                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200",
                            sidebarCollapsed && "justify-center px-0"
                        )}
                        title={sidebarCollapsed ? item.label : undefined}
                    >
                        {/* Active Indicator Background */}
                        {activeView === item.id && (
                            <div className="absolute inset-0 bg-brand/5 opacity-50" />
                        )}

                        <item.icon
                            size={24}
                            strokeWidth={activeView === item.id ? 2.5 : 2}
                            className={cn(
                                "shrink-0 transition-transform duration-300",
                                activeView === item.id ? "scale-105" : "group-hover:scale-110"
                            )}
                        />

                        <span className={cn(
                            "font-medium whitespace-nowrap transition-all duration-300 origin-left",
                            sidebarCollapsed ? "opacity-0 w-0 hidden scale-90" : "opacity-100 scale-100"
                        )}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </nav>

            {/* Footer / Toggle */}
            <div className="p-4 flex justify-center">
                <button
                    onClick={toggleSidebar}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-600 hover:text-white transition-colors"
                >
                    {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>
        </aside>
    );
};
