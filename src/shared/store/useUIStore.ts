import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ViewType = 'feed' | 'intelligence' | 'stats' | 'settings';

interface UIState {
    activeView: ViewType;
    setActiveView: (view: ViewType) => void;
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;
    sidebarWidth: number;
    setSidebarWidth: (width: number) => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            activeView: 'feed',
            setActiveView: (view) => set({ activeView: view }),
            sidebarCollapsed: false,
            toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
            sidebarWidth: 260,
            setSidebarWidth: (width) => set({ sidebarWidth: width }),
        }),
        {
            name: 'thattweet-ui-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
