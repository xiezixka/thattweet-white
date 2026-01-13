import { createOpenAI } from '@ai-sdk/openai';
import { AISettings } from '../../shared/types/settings';

export const AIProviderFactory = {
    getModel(settings: AISettings, forceVision: boolean = false) {
        if (!settings.apiKey) throw new Error('AI API Key is required');

        let baseURL = '';
        switch (settings.provider) {
            case 'siliconflow': baseURL = 'https://api.siliconflow.cn/v1'; break;
            case 'deepseek': baseURL = 'https://api.deepseek.com'; break;
            case 'openai': baseURL = 'https://api.openai.com/v1'; break;
            case 'custom': baseURL = settings.baseUrlContent || ''; break;
        }

        const provider = createOpenAI({
            apiKey: settings.apiKey,
            baseURL: baseURL,
        });

        return provider(forceVision ? settings.visionModel : settings.model);
    }
};
