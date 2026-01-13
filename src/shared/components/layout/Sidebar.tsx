import React from 'react';
import {
    LayoutDashboard,
    BrainCircuit,
    BarChart3,
    Settings2,
    ChevronLeft,
    ChevronRight,
    Bird
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
        { id: 'settings', icon: Settings2, label: t('nav_settings') },
    ];

    return (
        <aside
            className={cn(
                "h-screen flex flex-col transition-all duration-300 glass-panel border-r border-white/5",
                sidebarCollapsed ? "w-20" : "w-64"
            )}
        >
            {/* Logo Area */}
            <div className="p-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
                    <Bird className="text-white" size={24} />
                </div>
                {!sidebarCollapsed && (
                    <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        ThatTweet
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-2 mt-4">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveView(item.id as ViewType)}
                        className={cn(
                            "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all group",
                            activeView === item.id
                                ? "bg-brand/10 text-brand nebula-glow"
                                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                        )}
                    >
                        <item.icon size={22} className={cn(
                            activeView === item.id ? "text-brand" : "group-hover:scale-110 transition-transform"
                        )} />
                        {!sidebarCollapsed && (
                            <span className="font-medium">{item.label}</span>
                        )}
                    </button>
                ))}
            </nav>

            {/* Footer / Toggle */}
            <div className="p-3">
                <button
                    onClick={toggleSidebar}
                    className="w-full flex items-center justify-center p-3 rounded-xl hover:bg-white/5 text-zinc-500 transition-colors"
                >
                    {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>
            </div>
        </aside>
    );
};
