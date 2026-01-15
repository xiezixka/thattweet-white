import { AISettings } from '../../shared/types/settings';
import { Tweet } from '../../shared/types/tweet';
import { AIProviderAdapter, AIAnalysisResult } from './types';

/**
 * 核心工具：负责 Prompt 的构建
 */
class PromptBuilder {
    static buildFullContent(tweet: Tweet): string {
        let content = tweet.text ?? "(no text)";

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

    static buildBatchPrompt(tweets: Tweet[], settings: AISettings): string {
        const tweetBlocks = tweets.map((tweet, index) => {
            const fullContent = this.buildFullContent(tweet);
            const author = typeof tweet.author === 'string' ? tweet.author : (tweet.author as any)?.handle || 'Unknown';
            return `--- TWEET ID: ${tweet.id} ---\nAuthor: @${author}\nContent: ${fullContent}`;
        }).join('\n\n');

        return [
            "You are a professional social media intelligence analyzer.",
            "Analyze the following tweets and return a JSON array containing analysis results for EACH tweet.",
            `Available categories: ${settings.categories.join(', ')}`,
            "",
            "[SCORING & CATEGORIZATION RULES]",
            settings.promptAnalysis.replace(/{tweet_text}/g, 'The tweet content').replace(/{author}/g, 'The author handle'),
            "",
            "[SUMMARY RULES]",
            settings.promptSummary.replace(/{tweet_text}/g, 'The tweet content').replace(/{author}/g, 'The author handle'),
            "",
            "[TWEETS TO ANALYZE]",
            tweetBlocks,
            "",
            "CRITICAL: Final output must be a VALID JSON ARRAY starting with [ and ending with ]. Use no other text.",
            "Each object inside the array must include: id(string), score(number), category(string), reason(string), summary(string), tags(array of strings)."
        ].join("\n");
    }
}

/**
 * 核心工具：负责响应解析与清洗
 */
class OutputParser {
    /**
     * 更强悍的解析逻辑：支持标准的 [..] 数组，也支持 AI 抽风返回的多个 {..} {..} 对象
     */
    static tryParseArray(text: string): any[] {
        let cleaned = text.trim();

        // 1. 尝试直接解析标准的 JSON 数组
        try {
            const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            const target = codeBlockMatch ? codeBlockMatch[1] : cleaned;

            const firstBracket = target.indexOf("[");
            const lastBracket = target.lastIndexOf("]");
            if (firstBracket >= 0 && lastBracket > firstBracket) {
                return JSON.parse(target.slice(firstBracket, lastBracket + 1));
            }

            // 如果是单个对象被解析成数组
            const direct = JSON.parse(target);
            if (Array.isArray(direct)) return direct;
            if (typeof direct === 'object' && direct !== null) return [direct];
        } catch (e) {
            // 解析失败，进入容错逻辑
        }

        // 2. 容错逻辑：针对 AI 返回一连串 {..} {..} 的情况 (JSON Lines 风格)
        try {
            // 正则匹配所有独立的花括号对象
            const matches = text.match(/\{[\s\S]*?\}/g);
            if (matches && matches.length > 0) {
                const results: any[] = [];
                for (const match of matches) {
                    try {
                        results.push(JSON.parse(match));
                    } catch (e) {
                        // 忽略格式错误的单个块
                    }
                }
                if (results.length > 0) return results;
            }
        } catch (e) {
            // 容错也失败
        }

        throw new Error("Failed to parse structured AI response");
    }

    static normalize(parsed: any, settings: AISettings): AIAnalysisResult {
        const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 0;

        let category = parsed.category || '其他';
        if (!settings.categories.includes(category)) {
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
    async analyzeBatch(tweets: Tweet[], settings: AISettings): Promise<(AIAnalysisResult | null)[]> {
        if (tweets.length === 0) return [];

        const url = `${settings.baseUrl}/chat/completions`;
        const batchPrompt = PromptBuilder.buildBatchPrompt(tweets, settings);

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
                        content: "You are a professional social media analyzer. You MUST output results in a single JSON array format."
                    },
                    {
                        role: 'user',
                        content: batchPrompt
                    }
                ],
                // response_format: { type: 'json_object' }, // 批量数组模式下有些模型开启后会报错（因为它强制输出 {} 而不是 []），故暂时关闭
                temperature: 0.2
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Batch AI Provider Error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || "";

        try {
            const parsedArray = OutputParser.tryParseArray(rawContent);
            return this.mapResults(tweets, parsedArray, settings);
        } catch (err) {
            console.error("[Analyzer] Failed to parse Batch response:", rawContent);
            throw new Error("Failed to parse structured Batch AI response");
        }
    }

    private mapResults(originalTweets: Tweet[], results: any[], settings: AISettings): (AIAnalysisResult | null)[] {
        return originalTweets.map(tweet => {
            // 提高 ID 匹配的容错率 (转为字符串比较)
            const found = results.find(r => r && String(r.id) === String(tweet.id));
            if (found) {
                return OutputParser.normalize(found, settings);
            }
            return null;
        });
    }

    async analyze(tweet: Tweet, settings: AISettings): Promise<AIAnalysisResult> {
        const results = await this.analyzeBatch([tweet], settings);
        if (results[0]) return results[0];
        throw new Error("Single tweet analysis failed");
    }
}

/**
 * 调度中心
 */
class AnalyzerManager {
    private adapter = new OpenAIAdapter();

    async analyze(tweet: Tweet, settings: AISettings): Promise<AIAnalysisResult> {
        return this.adapter.analyze(tweet, settings);
    }

    async analyzeBatch(tweets: Tweet[], settings: AISettings): Promise<(AIAnalysisResult | null)[]> {
        return this.adapter.analyzeBatch(tweets, settings);
    }
}

export const TweetAnalyzer = new AnalyzerManager();
