import { create } from 'zustand';
import { AISettings, DEFAULT_AI_SETTINGS, getSafeAISettings } from '../types/settings';

export interface SettingsState {
    settings: AISettings;
    setSettings: (settings: unknown) => void;
    updateSettings: (updates: Partial<AISettings>) => void;
    loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_AI_SETTINGS,
    setSettings: (settings) => set({ settings: getSafeAISettings(settings) }),
    updateSettings: (updates) => {
        const newSettings = getSafeAISettings({ ...get().settings, ...updates });
        set({ settings: newSettings });

        // Persist to Chrome Storage
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ aiSettings: newSettings }).catch(error => {
                console.error('[ThatTweet] Failed to save settings:', error);
            });
        }
    },
    loadSettings: async () => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const result = await chrome.storage.local.get(['aiSettings']);
                if (result.aiSettings) {
                    set({ settings: getSafeAISettings(result.aiSettings) });
                }
            } catch (error) {
                console.error('[ThatTweet] Failed to load settings:', error);
            }
        }
    }
}));

// Initialize load
if (typeof window !== 'undefined') {
    useSettingsStore.getState().loadSettings();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.aiSettings) {
                useSettingsStore.getState().setSettings(changes.aiSettings.newValue);
            }
        });
    }
}
