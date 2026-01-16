import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MediaItem } from '../types/tweet';

export type ViewType = 'feed' | 'intelligence' | 'analytics' | 'stats' | 'settings';

interface LightboxState {
    media: MediaItem[];
    analysis?: Array<{ ocr?: string; description?: string }>;
    index: number;
    isOpen: boolean;
}

interface UIState {
    activeView: ViewType;
    setActiveView: (view: ViewType) => void;
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;
    sidebarWidth: number;
    setSidebarWidth: (width: number) => void;

    // Lightbox State
    lightbox: LightboxState;
    openLightbox: (
        media: MediaItem[],
        index: number,
        analysis?: Array<{ ocr?: string; description?: string }>
    ) => void;
    closeLightbox: () => void;
    setLightboxIndex: (index: number) => void;
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

            // Lightbox initial state
            lightbox: {
                media: [],
                index: 0,
                isOpen: false,
            },
            openLightbox: (media, index, analysis) => set({
                lightbox: { media, index, analysis, isOpen: true }
            }),
            closeLightbox: () => set((state) => ({
                lightbox: { ...state.lightbox, isOpen: false }
            })),
            setLightboxIndex: (index) => set((state) => ({
                lightbox: { ...state.lightbox, index }
            })),
        }),
        {
            name: 'thattweet-ui-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                activeView: state.activeView,
                sidebarCollapsed: state.sidebarCollapsed,
                sidebarWidth: state.sidebarWidth,
            }),
        }
    )
);
