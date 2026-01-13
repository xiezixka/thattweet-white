import { create } from 'zustand';
import { Tweet } from '../../../shared/types/tweet';
import { ragService, SearchResult } from '../services/ragService';

interface SearchState {
    query: string;
    results: SearchResult[];
    isSearching: boolean;
    activeTab: 'chats' | 'library';
    setQuery: (query: string) => void;
    setActiveTab: (tab: 'chats' | 'library') => void;
    performSearch: () => Promise<void>;
}

export const useSearchStore = create<SearchState>((set, get) => ({
    query: '',
    results: [],
    isSearching: false,
    activeTab: 'chats',

    setQuery: (query) => {
        set({ query });
        if (query.trim() === '') {
            set({ results: [], isSearching: false });
        }
    },

    setActiveTab: (tab) => set({ activeTab: tab }),

    performSearch: async () => {
        const { query } = get();
        if (!query.trim()) return;

        set({ isSearching: true, activeTab: 'library' });
        try {
            const results = await ragService.search(query, 50);
            set({ results, isSearching: false });
        } catch (err) {
            console.error('Search failed:', err);
            set({ isSearching: false });
        }
    }
}));
