import { AISettings } from '../../shared/types/settings';
import { Tweet } from '../../shared/types/tweet';
import { AIProviderAdapter, AIAnalysisResult } from './types';

/**
 * 核心工具：负责 Prompt 的构建
 */
class PromptBuilder {
    static buildFullContent(tweet: Tweet): string {
        let content = tweet.text || "";

        if (tweet.ocrText?.trim() || tweet.visionDescription?.trim()) {
            content += "\n\n--- IMAGE ANALYSIS DATA ---";

            if (tweet.ocrText?.trim()) {
                content += `\n[TEXT DETECTED IN IMAGE]:\n${tweet.ocrText}`;
            }

            if (tweet.visionDescription?.trim()) {
                content += `\n[VISUAL DESCRIPTION]:\n${tweet.visionDescription}`;
            }

            content += "\n--- END OF IMAGE DATA ---";
        }

        return content;
    }

    static fillVariables(template: string, tweet: Tweet, fullContent: string, settings: AISettings): string {
        const author = typeof tweet.author === 'string'
            ? tweet.author
            : (tweet.author as any)?.handle || 'Unknown';

        return template
            .replace(/{tweet_text}/g, fullContent)
            .replace(/{author}/g, author)
            .replace(/{tweet_id}/g, tweet.id)
            .replace(/{ai_style_focus}/g, settings.aiStyleFocus || '');
    }

    static buildBatchPrompt(tweets: Tweet[], settings: AISettings): string {
        const tweetBlocks = tweets.map((tweet, index) => {
            const fullContent = this.buildFullContent(tweet);
            return this.fillVariables(`--- TWEET ID: {tweet_id} ---\nAuthor: @{author}\nContent: {tweet_text}`, tweet, fullContent, settings);
        }).join('\n\n');

        return [
            "You are a professional social media intelligence analyzer.",
            "Analyze the following tweets and return a JSON array containing analysis results for EACH tweet.",
            `Available categories: ${settings.categories.join(', ')}`,
            "",
            "[SCORING & CATEGORIZATION RULES]",
            settings.promptAnalysis
                .replace(/{tweet_text}/g, 'The tweet content')
                .replace(/{author}/g, 'The author handle')
                .replace(/{tweet_id}/g, 'The tweet ID')
                .replace(/{ai_style_focus}/g, settings.aiStyleFocus || ''),
            "",
            "[SUMMARY RULES]",
            settings.promptSummary
                .replace(/{tweet_text}/g, 'The tweet content')
                .replace(/{author}/g, 'The author handle'),
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
                        content: "You are a professional social media intelligence analyzer. Analyze the provided tweet text and its associated image analysis data (OCR text and visual descriptions). Your goal is to synthesize the text and visual information to provide a deep, correlated analysis. For each tweet, identify how the images relate to or support the written content. You MUST output results in a single standard JSON array format."
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

    async generateProfile(tweets: Tweet[], settings: AISettings): Promise<{ summary: string; keywords: string[] }> {
        // 1. 配置优先级 (Profile > Chat > Global)
        const apiKey = settings.profileApiKey || settings.chatApiKey || settings.apiKey;
        let baseUrl = settings.profileBaseUrl || settings.chatBaseUrl || settings.baseUrl || 'https://openrouter.ai/api/v1';
        const modelToUse = settings.profileModel || settings.chatModel || settings.model || 'mistralai/mistral-7b-instruct:free';

        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        const url = `${baseUrl}/chat/completions`;

        // 构造 Profile Prompt
        const context = tweets.map((t, i) => {
            const date = new Date(Number(t.savedAt)).toLocaleDateString();
            const tags = (t.aiTags || []).join(', ');
            // 风格分析必须基于原文 (Raw Text)，AI Summary 会丢失语气特征
            // 增加截取长度至 500 字符，尽可能保留完整语境
            const content = t.text.slice(0, 500);
            return `#${i + 1} [${date}] [Tags: ${tags}]\n${content}`;
        }).join('\n\n');

        const prompt = settings.promptProfile
            .replace('{count}', String(tweets.length))
            .replace('{context}', context);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: modelToUse,
                    messages: [
                        { role: 'system', content: 'You are an expert profiler. Return valid JSON.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.5
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || "";

            // 尝试提取 JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const target = jsonMatch ? jsonMatch[0] : content;
            const parsed = JSON.parse(target);

            return {
                summary: parsed.summary || "",
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : []
            };

        } catch (e: any) {
            console.error("[Profile Gen Failed]", e);
            throw new Error(e.message || "Profile generation failed");
        }
    }

    async chatWithAuthorExpert(query: string, tweets: Tweet[], settings: AISettings): Promise<string> {
        const apiKey = settings.expertApiKey || settings.chatApiKey || settings.apiKey;
        let baseUrl = settings.expertBaseUrl || settings.chatBaseUrl || settings.baseUrl || 'https://openrouter.ai/api/v1';
        const modelToUse = settings.expertModel || settings.chatModel || settings.model || 'mistralai/mistral-7b-instruct:free';

        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        const url = `${baseUrl}/chat/completions`;

        // 构造 RAG Context
        const context = tweets.slice(0, 20).map((t, i) => {
            return `[Tweet ${i + 1}]: ${t.text}`;
        }).join('\n\n');

        const systemPrompt = [
            "You are an expert analyst who has studied this author's tweets deeply.",
            "Use the provided TWEET CONTEXT to answer the user's question about the author.",
            "If the answer is not in the context, say you don't know based on existing data.",
            "Keep the tone professional and analytical.",
            "",
            "[TWEET CONTEXT]",
            context
        ].join('\n');

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: modelToUse,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: query }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error ${response.status}: ${errText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "No response.";
        } catch (e: any) {
            console.error("[Chat Expert Failed]", e);
            return `分析失败: ${e.message}`;
        }
    }

    async chatWithAuthorExpertStream(
        query: string,
        tweets: Tweet[],
        settings: AISettings,
        onChunk: (text: string) => void
    ): Promise<void> {
        const apiKey = settings.expertApiKey || settings.chatApiKey || settings.apiKey;
        let baseUrl = settings.expertBaseUrl || settings.chatBaseUrl || settings.baseUrl || 'https://openrouter.ai/api/v1';
        const modelToUse = settings.expertModel || settings.chatModel || settings.model || 'mistralai/mistral-7b-instruct:free';

        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        const url = `${baseUrl}/chat/completions`;

        const context = tweets.slice(0, 20).map((t, i) => `[Tweet ${i + 1}]: ${t.text}`).join('\n\n');
        const systemPrompt = [
            "You are an expert analyst who has studied this author's tweets deeply.",
            "Use the provided TWEET CONTEXT to answer the user's question about the author.",
            "If the answer is not in the context, say you don't know based on existing data.",
            "Keep the tone professional and analytical.",
            "",
            "[TWEET CONTEXT]",
            context
        ].join('\n');

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: modelToUse,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: query }
                    ],
                    temperature: 0.7,
                    stream: true
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error ${response.status}: ${errText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) return;

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const cleanLine = line.replace(/^data: /, '').trim();
                    if (!cleanLine || cleanLine === '[DONE]') continue;

                    try {
                        const json = JSON.parse(cleanLine);
                        const content = json.choices?.[0]?.delta?.content;
                        if (content) onChunk(content);
                    } catch (e) {
                        // Ignore partial JSON
                    }
                }
            }
        } catch (e: any) {
            console.error("[Stream Chat Failed]", e);
            throw e;
        }
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

    async analyzeAuthorProfile(tweets: Tweet[], settings: AISettings) {
        return this.adapter.generateProfile(tweets, settings);
    }

    async chatWithAuthorExpert(query: string, tweets: Tweet[], settings: AISettings) {
        return this.adapter.chatWithAuthorExpert(query, tweets, settings);
    }

    async chatWithAuthorExpertStream(query: string, tweets: Tweet[], settings: AISettings, onChunk: (text: string) => void) {
        return this.adapter.chatWithAuthorExpertStream(query, tweets, settings, onChunk);
    }

    async fetchAvailableModels(baseUrl: string, apiKey: string): Promise<string[]> {
        try {
            const url = `${baseUrl.replace(/\/$/, '')}/models`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();
            return (data.data || []).map((m: any) => m.id);
        } catch (e: any) {
            console.error("[Fetch Models Failed]", e);
            throw e;
        }
    }
}

export const TweetAnalyzer = new AnalyzerManager();
