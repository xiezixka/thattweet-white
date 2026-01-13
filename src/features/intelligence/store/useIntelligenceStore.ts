import { create } from 'zustand';

interface IntelligenceState {
    isNoteOpen: boolean;
    toggleNote: () => void;
    setNoteOpen: (isOpen: boolean) => void;

    // Insertion mechanism
    pendingInsert: { type: 'text' | 'tweet', content: any } | null;
    insertToNote: (type: 'text' | 'tweet', content: any) => void;
    clearPendingInsert: () => void;
}

export const useIntelligenceStore = create<IntelligenceState>((set) => ({
    isNoteOpen: true,
    toggleNote: () => set((state) => ({ isNoteOpen: !state.isNoteOpen })),
    setNoteOpen: (isOpen) => set({ isNoteOpen: isOpen }),

    pendingInsert: null,
    insertToNote: (type, content) => set({ pendingInsert: { type, content }, isNoteOpen: true }),
    clearPendingInsert: () => set({ pendingInsert: null }),
}));
