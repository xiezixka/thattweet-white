import { useLayoutEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';

/** Only extension pages import this hook and its stylesheet; X keeps its own theme. */
export function useColorTheme() {
    const mode = useSettingsStore(state => state.settings.themeMode);
    useLayoutEffect(() => {
        document.documentElement.dataset.colorTheme = mode === 'dark' ? 'dark' : 'light';
    }, [mode]);
}
