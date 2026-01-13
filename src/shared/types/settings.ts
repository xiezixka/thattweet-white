export type AIProvider = 'siliconflow' | 'deepseek' | 'openai' | 'anthropic' | 'custom';

export interface AISettings {
    enabled: boolean;
    provider: AIProvider;
    apiKey: string;
    model: string;
    baseUrlContent?: string;

    // 视觉与图像处理 (Vision/OCR 分离)
    visionEnabled: boolean;
    ocrEnabled: boolean;
    visionModel: string; // 默认可以使用 siliconflow 的视觉模型

    // 自动化与性能偏好
    autoAnalyze: boolean;
    batchSize: number; // 每次处理几条
    maxRetries: number;
    rateLimitMs: number;

    // 提示词配置
    prompts: {
        system: string;
        tweetTemplate: string;
    }
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    enabled: false,
    provider: 'siliconflow',
    apiKey: '',
    model: 'deepseek-ai/DeepSeek-V3',
    visionEnabled: false,
    ocrEnabled: false,
    visionModel: 'vendor/Pro/google/gemini-2.0-flash-exp', // 示例视觉模型
    autoAnalyze: true,
    batchSize: 10,
    maxRetries: 5,
    rateLimitMs: 2000,
    prompts: {
        system: '你是一个精干的推文分析助手。我会给你推文内容（如有图片，会附带 OCR 或视觉分析文字）。请严格按 JSON 格式返回分析结果。',
        tweetTemplate: '推文作者: {author}\n内容: {text}\n图片描述: {vision}\nOCR文字: {ocr}'
    }
};
