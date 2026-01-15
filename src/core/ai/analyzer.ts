import { AISettings } from '../../shared/types/settings';
import { Tweet } from '../../shared/types/tweet';
import { AIProviderAdapter, AIAnalysisResult } from './types';

/**
 * 核心工具：负责 Prompt 的构建
 */
class PromptBuilder {
    static buildFullContent(tweet: Tweet): string {
        let content = tweet.text ?? "(no text)";

        // 注入 OCR 和 Vision 内容 (多模态融合)
        if (tweet.ocrText?.trim()) {
            content += `\n\n【图片文字内容】\n${tweet.ocrText}`;
        }

        if (tweet.visionDescription?.trim()) {
            content += `\n\n【图片内容描述】\n${tweet.visionDescription}`;
        }

        return content;
    }

    static fillVariables(template: string, tweet: Tweet, fullContent: string): string {
        const author = typeof tweet.author === 'string'
            ? tweet.author
            : (tweet.author as any)?.handle || 'Unknown';

        return template
            .replace(/{tweet_text}/g, fullContent)
            .replace(/{author}/g, author);
    }

    static buildCombinedPrompt(tweet: Tweet, settings: AISettings): string {
        const fullContent = this.buildFullContent(tweet);

        // 分别填充两个模板
        const analysisRules = this.fillVariables(settings.promptAnalysis, tweet, fullContent);
        const summaryRules = this.fillVariables(settings.promptSummary, tweet, fullContent);

        // 合并为单次请求指令
        return [
            "You are a tweet analysis assistant. Strictly output valid JSON only.",
            `Available categories: ${settings.categories.join(', ')}`,
            "",
            "[ANALYSIS & SCORING RULES]",
            analysisRules,
            "",
            "[SUMMARY RULES]",
            summaryRules,
            "",
            "Final output must be a single JSON object with these fields: score(number), category(string), reason(string), summary(string)."
        ].join("\n");
    }
}

/**
 * 核心工具：负责响应解析与清洗
 */
class OutputParser {
    static cleanJson(text: string): string {
        // 1. 尝试剔除 Markdown 代码块
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        let cleaned = codeBlockMatch ? codeBlockMatch[1] : text;

        // 2. 截取首个 { 到最后一个 } 之间的内容 (正则兜底)
        cleaned = cleaned.trim();
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");

        if (firstBrace >= 0 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        return cleaned;
    }

    static normalize(parsed: any, settings: AISettings): AIAnalysisResult {
        // 评分校验
        const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 0;

        // 分类校验 (严格匹配 Settings 里的 categories)
        let category = parsed.category || '其他';
        if (!settings.categories.includes(category)) {
            // 尝试模糊匹配或默认回退
            category = settings.categories.find(c => category.includes(c)) || '其他';
        }

        return {
            score,
            category,
            reason: parsed.reason || '',
            summary: parsed.summary?.trim() || '',
            tags: Array.isArray(parsed.tags) ? parsed.tags : []
        };
    }
}

/**
 * 通用 OpenAI 兼容适配器
 */
class OpenAIAdapter implements AIProviderAdapter {
    async analyze(tweet: Tweet, settings: AISettings): Promise<AIAnalysisResult> {
        const url = `${settings.baseUrl}/chat/completions`;
        const combinedPrompt = PromptBuilder.buildCombinedPrompt(tweet, settings);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`,
                'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                'X-Title': 'ThatTweet'
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    {
                        role: 'system',
                        content: "You are a helpful assistant that analyzes tweets and outputs structured JSON."
                    },
                    {
                        role: 'user',
                        content: combinedPrompt
                    }
                ],
                // 某些 provider 支持 json_mode
                response_format: { type: 'json_object' },
                temperature: 0.3 // 降低随机性以保证 JSON 稳定
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`AI Provider Error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || "";

        try {
            const cleanedJson = OutputParser.cleanJson(rawContent);
            const parsed = JSON.parse(cleanedJson);
            return OutputParser.normalize(parsed, settings);
        } catch (err) {
            console.error("[Analyzer] Failed to parse AI response:", rawContent);
            throw new Error("Failed to parse structured AI response");
        }
    }
}

/**
 * 调度中心
 */
class AnalyzerManager {
    private adapter = new OpenAIAdapter();

    async analyze(tweet: Tweet, settings: AISettings): Promise<AIAnalysisResult> {
        // 目前主要使用 OpenAI 兼容协议
        return this.adapter.analyze(tweet, settings);
    }
}

export const TweetAnalyzer = new AnalyzerManager();
