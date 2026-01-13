import { AISettings } from '../../shared/types/settings';
import { Tweet } from '../../shared/types/tweet';
import { AIProviderAdapter, AIAnalysisResult } from './types';

/**
 * 通用 OpenAI 兼容适配器 (适用于 SiliconFlow, DeepSeek, OpenAI, OpenRouter 等)
 */
class OpenAIAdapter implements AIProviderAdapter {
    async analyze(tweet: Tweet, settings: AISettings): Promise<AIAnalysisResult> {
        const baseURL = this.getBaseURL(settings);
        const url = `${baseURL}/chat/completions`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    {
                        role: 'system',
                        content: settings.prompts.system
                    },
                    {
                        role: 'user',
                        content: `分析推文：${tweet.text}`
                    }
                ],
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API Error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content);
    }

    private getBaseURL(settings: AISettings) {
        switch (settings.provider) {
            case 'siliconflow': return 'https://api.siliconflow.cn/v1';
            case 'deepseek': return 'https://api.deepseek.com';
            case 'openai': return 'https://api.openai.com/v1';
            case 'custom': return settings.baseUrlContent || '';
            default: return 'https://api.siliconflow.cn/v1';
        }
    }
}

/**
 * 调度中心：根据配置选择适配器
 */
class AnalyzerManager {
    private adapters: Record<string, AIProviderAdapter> = {
        'openai_compatible': new OpenAIAdapter(),
    };

    async analyze(tweet: Tweet, settings: AISettings): Promise<AIAnalysisResult> {
        // 根据 provider 选择适配器
        let adapterType = 'openai_compatible';

        // 如果以后接入 Claude，可以在此处扩展逻辑
        if (settings.provider === 'anthropic') {
            adapterType = 'anthropic';
        }

        const adapter = this.adapters[adapterType];
        if (!adapter) throw new Error(`Unsupported AI Provider: ${settings.provider}`);

        return adapter.analyze(tweet, settings);
    }
}

export const TweetAnalyzer = new AnalyzerManager();
