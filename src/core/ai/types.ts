import { AISettings } from '../../shared/types/settings';
import { Tweet } from '../../shared/types/tweet';

export interface AIAnalysisResult {
    summary: string;
    tags: string[];
    score: number;
    category: string;
}

/**
 * AI 适配器标准接口
 */
export interface AIProviderAdapter {
    analyze(tweet: Tweet, settings: AISettings): Promise<AIAnalysisResult>;
}
