import { create } from 'zustand';

interface IntelligenceState {
    isNoteOpen: boolean;
    toggleNote: () => void;
    setNoteOpen: (isOpen: boolean) => void;
    isInitialized: boolean;

    // Content management
    noteContent: string;
    setNoteContent: (content: string) => void;

    // UI state
    noteWidth: number;
    setNoteWidth: (width: number) => void;
    dualPane: boolean;
    setDualPane: (enabled: boolean) => void;

    // Insertion mechanism
    pendingInsert: { type: 'text' | 'tweet', content: any } | null;
    insertToNote: (type: 'text' | 'tweet', content: any) => void;
    clearPendingInsert: () => void;
    saveNote: () => void;
    loadNote: () => Promise<void>;
}

export const useIntelligenceStore = create<IntelligenceState>((set, get) => ({
    isNoteOpen: true,
    isInitialized: false,
    toggleNote: () => set((state) => ({ isNoteOpen: !state.isNoteOpen })),
    setNoteOpen: (isOpen) => set({ isNoteOpen: isOpen }),

    noteContent: "",
    setNoteContent: (content) => set({ noteContent: content }),

    noteWidth: 1000,
    setNoteWidth: (width) => set({ noteWidth: width }),
    dualPane: true,
    setDualPane: (enabled) => set({ dualPane: enabled }),

    pendingInsert: null,
    insertToNote: (type, content) => set({ pendingInsert: { type, content }, isNoteOpen: true }),
    clearPendingInsert: () => set({ pendingInsert: null }),

    saveNote: () => {
        const { noteContent, dualPane, noteWidth, isInitialized } = get();
        if (!isInitialized) return;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({
                note_content: noteContent,
                note_dual_pane: dualPane,
                note_width: noteWidth
            });
        } else {
            localStorage.setItem('note_content', noteContent);
            localStorage.setItem('note_dual_pane', JSON.stringify(dualPane));
            localStorage.setItem('note_width', noteWidth.toString());
        }
    },

    loadNote: async () => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const res = await chrome.storage.local.get(['note_content', 'note_dual_pane', 'note_width']);
            set({
                noteContent: res.note_content || "",
                dualPane: res.note_dual_pane ?? true,
                noteWidth: res.note_width || 1000,
                isInitialized: true
            });
        } else {
            set({
                noteContent: localStorage.getItem('note_content') || "",
                dualPane: localStorage.getItem('note_dual_pane') === 'false' ? false : true,
                noteWidth: parseInt(localStorage.getItem('note_width') || "1000", 10),
                isInitialized: true
            });
        }
    }
}));
