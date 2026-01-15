import React, { useCallback, useRef } from 'react';
import {
    LayoutDashboard,
    BrainCircuit,
    BarChart3,
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
    const { activeView, setActiveView, sidebarCollapsed, toggleSidebar, sidebarWidth, setSidebarWidth } = useUIStore();
    const { t } = useTranslation();
    const isResizing = useRef(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        isResizing.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'col-resize';
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'default';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = Math.min(Math.max(e.clientX, 80), 480);
        setSidebarWidth(newWidth);
    }, [setSidebarWidth]);

    const navItems = [
        { id: 'feed', icon: LayoutDashboard, label: t('nav_feed') },
        { id: 'intelligence', icon: BrainCircuit, label: t('nav_intelligence') },
        { id: 'stats', icon: BarChart3, label: t('nav_stats') },
        { id: 'settings', icon: Settings2, label: t('nav_settings') },
    ];

    const currentWidth = sidebarCollapsed ? 80 : sidebarWidth;

    return (
        <aside
            style={{ width: currentWidth }}
            className={cn(
                "h-screen flex flex-col relative transition-all duration-300 glass-panel border-r border-white/5 select-none animate-in shrink-0",
                sidebarCollapsed ? "duration-300" : "duration-0" // Disable transition when dragging
            )}
        >
            {/* Logo Area */}
            <div className="p-6 flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                    <img src="/icon.png" alt="Logo" className="w-full h-full object-cover" />
                </div>
                {!sidebarCollapsed && currentWidth > 160 && (
                    <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent truncate">
                        ThatTweet
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-2 mt-4 overflow-hidden">
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
                            "shrink-0",
                            activeView === item.id ? "text-brand" : "group-hover:scale-110 transition-transform"
                        )} />
                        {!sidebarCollapsed && currentWidth > 160 && (
                            <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
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

            {/* Drag Handle */}
            {!sidebarCollapsed && (
                <div
                    onMouseDown={startResizing}
                    className="absolute top-0 -right-1 w-2 h-full cursor-col-resize hover:bg-brand/30 transition-colors z-50"
                />
            )}
        </aside>
    );
};
