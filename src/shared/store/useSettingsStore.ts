import { create } from 'zustand';
import { AISettings, DEFAULT_AI_SETTINGS } from '../types/settings';

interface SettingsState {
    settings: AISettings;
    setSettings: (settings: AISettings) => void;
    updateSettings: (updates: Partial<AISettings>) => void;
    loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_AI_SETTINGS,
    setSettings: (settings) => set({ settings }),
    updateSettings: (updates) => {
        const newSettings = { ...get().settings, ...updates };
        set({ settings: newSettings });

        // Persist to Chrome Storage
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ aiSettings: newSettings });
        }
    },
    loadSettings: async () => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const result = await chrome.storage.local.get(['aiSettings']);
            if (result.aiSettings) {
                set({ settings: { ...DEFAULT_AI_SETTINGS, ...result.aiSettings } });
            }
        }
    }
}));

// Initialize load
if (typeof window !== 'undefined') {
    useSettingsStore.getState().loadSettings();
}
