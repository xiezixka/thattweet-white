import React from 'react';
import {
    LayoutDashboard,
    BrainCircuit,
    BarChart3,
    LineChart,
    Settings2,
    Network,
    Image as ImageIcon,
    Zap,
    ChevronsRight,
    ChevronsLeft
} from 'lucide-react';
import { useUIStore, ViewType } from '../../store/useUIStore';
import { useTranslation } from '../../hooks/useTranslation';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Width constants
const SIDEBAR_NARROW = 64;  // px – icons only
const SIDEBAR_WIDE = 200;   // px – icons + labels

// Icon positioning: keep icons centered within the narrow-width zone (64px)
// Nav has 8px horizontal padding → button content starts at 8px from sidebar edge
// 18px icon centered in 64px → icon left = (64-18)/2 = 23px → paddingLeft = 23-8 = 15px
const ICON_PAD_LEFT = 15;
// 32px logo icon centered in 64px → logo left = (64-32)/2 = 16px
const LOGO_PAD_LEFT = 16;

const TRANSITION = 'width 0.25s ease';

// Gap between icon and text: calculated so text starts exactly at SIDEBAR_NARROW boundary.
// sidebar overflow:hidden clips text when narrow, reveals it as width grows.
// Nav: 8(nav pad) + 15(icon pad) + 18(icon) + gap = 64  →  gap = 23
const TEXT_GAP = SIDEBAR_NARROW - 8 - ICON_PAD_LEFT - 18;
// Logo: 16(logo pad) + 32(logo icon) + gap = 64  →  gap = 16
const LOGO_GAP = SIDEBAR_NARROW - LOGO_PAD_LEFT - 32;

// Text reveal: delayed fade-in on expand; on collapse stays visible while sidebar clips it
const labelRevealStyle = (expanded: boolean): React.CSSProperties => ({
    opacity: expanded ? 1 : 0,
    transition: expanded
        ? 'opacity 0.3s ease 0.15s'    // expand: fade in over 0.3s, delayed 0.15s
        : 'opacity 0.01s ease 0.25s',   // collapse: snap to 0 after sidebar finishes closing
});

interface SidebarProps {
    isPinned: boolean;
    onTogglePin: () => void;
}

export { SIDEBAR_NARROW, SIDEBAR_WIDE };

export const Sidebar: React.FC<SidebarProps> = ({
    isPinned,
    onTogglePin,
}) => {
    const { activeView, setActiveView } = useUIStore();
    const { t } = useTranslation();

    const navItems = [
        { id: 'feed', icon: LayoutDashboard, label: t('nav_feed') },
        { id: 'stats', icon: BarChart3, label: t('nav_stats') },
        { id: 'analytics', icon: LineChart, label: t('nav_analytics') },
        { id: 'intelligence', icon: BrainCircuit, label: t('nav_intelligence') },
        { id: 'connections', icon: Network, label: '连结' },
        { id: 'simulation', icon: Zap, label: '前瞻' },
        { id: 'gallery', icon: ImageIcon, label: t('nav_gallery') },
        { id: 'settings', icon: Settings2, label: t('nav_settings') },
    ];

    const isExpanded = isPinned;

    return (
        <aside
            className="h-screen flex flex-col relative bg-zinc-900/95 backdrop-blur-xl border-r border-white/10 select-none shrink-0 overflow-hidden"
            style={{
                width: isExpanded ? SIDEBAR_WIDE : SIDEBAR_NARROW,
                transition: TRANSITION,
            }}
        >
            {/* Header: Logo — icon always at the same X position */}
            <div
                className={cn(
                    "h-16 flex items-center shrink-0 border-b",
                    isPinned
                        ? "border-brand/20 bg-brand/5"
                        : "border-white/[0.05]"
                )}
                style={{ paddingLeft: LOGO_PAD_LEFT }}
            >
                <div className="flex items-center" style={{ gap: LOGO_GAP }}>
                    <div className={cn(
                        "w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-xl",
                        isPinned && "ring-2 ring-brand/50"
                    )}>
                        <img src="/icon.png" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <span
                        className={cn(
                            "font-bold text-base tracking-tight whitespace-nowrap",
                            isPinned ? "text-brand" : "text-white"
                        )}
                        style={labelRevealStyle(isExpanded)}
                    >
                        ThatTweet
                    </span>
                </div>
            </div>

            {/* Navigation — icons always at fixed left position */}
            <nav className="flex-1 py-4 space-y-1" style={{ paddingLeft: 8, paddingRight: 8 }}>
                {navItems.map((item) => {
                    const isActive = activeView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveView(item.id as ViewType)}
                            title={!isExpanded ? item.label : undefined}
                            className={cn(
                                "w-full flex items-center rounded-xl relative group",
                                isActive
                                    ? "text-brand"
                                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                            )}
                            style={{
                                paddingTop: 10,
                                paddingBottom: 10,
                                paddingLeft: ICON_PAD_LEFT,
                                paddingRight: 12,
                                gap: TEXT_GAP,
                            }}
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
                                    "shrink-0 z-10",
                                    !isActive && "group-hover:translate-x-0.5 transition-transform duration-200"
                                )}
                            />

                            <span
                                className="text-sm font-medium whitespace-nowrap z-10"
                                style={labelRevealStyle(isExpanded)}
                            >
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* Collapse / Expand toggle button — icon at same fixed position */}
            <div className="shrink-0 border-t border-white/[0.05]" style={{ padding: 8 }}>
                <button
                    onClick={onTogglePin}
                    title={isPinned ? "收起侧边栏" : "展开侧边栏"}
                    className={cn(
                        "w-full flex items-center rounded-xl py-2.5",
                        "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]"
                    )}
                    style={{
                        paddingLeft: ICON_PAD_LEFT,
                        paddingRight: 12,
                        gap: TEXT_GAP,
                    }}
                >
                    {isPinned ? (
                        <ChevronsLeft size={18} strokeWidth={2} className="shrink-0 z-10" />
                    ) : (
                        <ChevronsRight size={18} strokeWidth={2} className="shrink-0 z-10" />
                    )}
                    <span
                        className="text-sm font-medium whitespace-nowrap z-10"
                        style={labelRevealStyle(isExpanded)}
                    >
                        {isPinned ? "收起" : "展开"}
                    </span>
                </button>
            </div>
        </aside>
    );
};
