import { create } from 'zustand';

export type ViewType = 'feed' | 'intelligence' | 'stats' | 'settings';

interface UIState {
    activeView: ViewType;
    setActiveView: (view: ViewType) => void;
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    activeView: 'feed',
    setActiveView: (view) => set({ activeView: view }),
    sidebarCollapsed: false,
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
