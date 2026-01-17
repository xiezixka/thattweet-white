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

        if (tweet.aiScore) {
            content += `\n[QUALITY RATING]: ${tweet.aiScore}/100`;
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
        const node = settings.workflowNodes.textAnalysis;
        const promptTemplate = node.prompt || "";

        const tweetBlocks = tweets.map((tweet, index) => {
            const fullContent = this.buildFullContent(tweet);
            return this.fillVariables(`--- TWEET ID: {tweet_id} ---\nAuthor: @{author}\nContent: {tweet_text}`, tweet, fullContent, settings);
        }).join('\n\n');

        return [
            "You are a professional social media intelligence analyzer.",
            "Analyze the following tweets and return a JSON array containing analysis results for EACH tweet.",
            `Available categories: ${settings.categories.join(', ')}`,
            "",
            "[ANALYSIS RULES]",
            this.fillVariables(promptTemplate, tweets[0] || {} as any, "", settings),
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
     * 清理并提取 JSON 字符串
     */
    static cleanJson(str: string): string {
        let target = str.trim();

        // 1. 基础清理：移除 Markdown 代码块标记及外部杂质
        const firstBrace = target.indexOf('{');
        const firstBracket = target.indexOf('[');
        const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;

        const lastBrace = target.lastIndexOf('}');
        const lastBracket = target.lastIndexOf(']');
        const end = (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) ? lastBrace : lastBracket;

        if (start !== -1 && end !== -1 && end > start) {
            target = target.substring(start, end + 1);
        }

        // 2. 移除尾随逗号 (Trailing Commas)
        target = target.replace(/,\s*([\]}])/g, '$1');

        // 3. 移除单行/多行注释
        target = target.replace(/\/\/.*$/gm, '');
        target = target.replace(/\/\*[\s\S]*?\*\//g, '');

        // 4. 修复控制字符 (换行、制表符等在 JSON 字符串内是非法的)
        target = target.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, content) => {
            return `"${content
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/[\x00-\x1F]/g, '')}"`;
        });

        // 5. 修复引号内未转义的双引号 (针对常见的 "key": "value "with" quotes" 情况)
        // 寻找在引号内但未转义的引号（不包括该字段开头和结尾的引号）
        // 这个正则比较复杂，优先处理简单的 key-value 结构
        target = target.replace(/(?<=: \s*")(.+?)(?="\s*[,}\]])/gs, (match, content) => {
            return content.replace(/(?<!\\)"/g, '\\"');
        });

        return target;
    }

    static tryParseArray(text: string): any[] {
        const cleaned = this.cleanJson(text);
        try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) return parsed;
            if (typeof parsed === 'object' && parsed !== null) return [parsed];
        } catch (e) {
            // 解析失败，尝试针对 {..} {..} 这种多对象格式
            const matches = text.match(/\{[\s\S]*?\}/g);
            if (matches && matches.length > 0) {
                const results: any[] = [];
                for (const m of matches) {
                    try {
                        results.push(JSON.parse(this.cleanJson(m)));
                    } catch (inner) { }
                }
                if (results.length > 0) return results;
            }
        }
        throw new Error("Failed to parse structured AI response");
    }

    static tryParseObject(text: string): any {
        const cleaned = this.cleanJson(text);
        try {
            return JSON.parse(cleaned);
        } catch (e) {
            // 如果解析失败，尝试抓取第一个花括号对象
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    return JSON.parse(this.cleanJson(match[0]));
                } catch (inner) { }
            }
        }
        throw new Error("Failed to parse structured AI response into object");
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
    private resolveConfig(settings: AISettings, nodeKey: keyof AISettings['workflowNodes']) {
        const node = settings.workflowNodes[nodeKey];
        const providerId = node.providerId || settings.defaultProviderId;
        const provider = settings.providers.find(p => p.id === providerId);

        if (!provider) {
            const msg = `Provider not found for node: ${String(nodeKey)}. ` +
                `Required Provider ID: ${providerId}. ` +
                `Available Providers: ${settings.providers.map(p => p.id).join(', ') || 'None'}. ` +
                `Please check your AI Workflow settings.`;
            throw new Error(msg);
        }

        return {
            apiKey: provider.apiKey.trim(),
            baseUrl: provider.baseUrl.trim().replace(/\/$/, ''),
            model: node.model?.trim() || '',
            prompt: node.prompt || ''
        };
    }

    async analyzeBatch(tweets: Tweet[], settings: AISettings): Promise<(AIAnalysisResult | null)[]> {
        if (tweets.length === 0) return [];

        const config = this.resolveConfig(settings, 'textAnalysis');
        const url = `${config.baseUrl}/chat/completions`;
        const batchPrompt = PromptBuilder.buildBatchPrompt(tweets, settings);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                'X-Title': 'ThatTweet'
            },
            body: JSON.stringify({
                model: config.model,
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
            const errText = await response.text();
            if (response.status === 404) {
                throw new Error(`404 - Model Not Found. Please check your model name: ${config.model}`);
            }
            const isOpenRouterPrivacyError = response.status === 403 && errText.includes('data policy');
            throw new Error(`${response.status} ${isOpenRouterPrivacyError ? '- OpenRouter requires "Free model publication" enabled in Settings > Privacy' : errText}`);
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

    async generateProfile(tweets: Tweet[], settings: AISettings): Promise<{ summary: string; keywords: string[]; sentiment: string; semantic: string }> {
        const config = this.resolveConfig(settings, 'profile');
        const url = `${config.baseUrl}/chat/completions`;

        // 构造 Profile Prompt (严格基于原文，排除 AI 生成的标签/摘要)
        const context = tweets.map((t, i) => {
            const date = new Date(Number(t.savedAt)).toLocaleDateString();
            // 风格与语义分析必须基于“无污染”的原文 (Pure Raw Content)
            const rawText = t.text;
            // OCR 属于原始图像证据，属于“原文”范畴
            const ocr = t.ocrText ? `\n[图像原始文本]: ${t.ocrText}` : '';
            return `--- 推文片段 #${i + 1} [${date}] ---\n${rawText}${ocr}`;
        }).join('\n\n');

        let prompt = config.prompt
            .replace('{count}', String(tweets.length));

        // 🛡️ 关键修复：确保原文一定被传入分析
        if (prompt.includes('{context}')) {
            prompt = prompt.replace('{context}', context);
        } else {
            prompt += `\n\n[ANALYSIS MATERIAL - TOP ${tweets.length} TWEETS]\n${context}`;
        }

        // 🛡️ 强制增强防护：如果用户设置中的 Prompt 不包含新指令，强制追加
        if (!prompt.includes('sentiment') || !prompt.includes('semantic')) {
            prompt += `\n\n[EXTRA INSTRUCTION]
Please also include the following fields in your JSON response:
3. "sentiment": Evaluate the emotional tone and trust level (50-100 words in Chinese).
4. "semantic": Analyze the depth and consistency of their core topics (50-100 words in Chinese).`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: 'system', content: 'You are an expert profiler. Return valid JSON.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.5
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                if (response.status === 404) {
                    throw new Error(`404 - Model Not Found. Please check your model name: ${config.model}`);
                }
                const isOpenRouterPrivacyError = response.status === 403 && errText.includes('data policy');
                throw new Error(`${response.status} ${isOpenRouterPrivacyError ? '- OpenRouter requires "Free model publication" enabled in Settings > Privacy' : errText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || "";

            const parsed = OutputParser.tryParseObject(content);

            return {
                summary: parsed.summary || "",
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
                sentiment: parsed.sentiment || "",
                semantic: parsed.semantic || ""
            };

        } catch (e: any) {
            console.error("[Profile Gen Failed]", e);
            throw new Error(e.message || "Profile generation failed");
        }
    }

    async chatWithAuthorExpert(query: string, tweets: Tweet[], settings: AISettings): Promise<string> {
        const config = this.resolveConfig(settings, 'salon');
        const url = `${config.baseUrl}/chat/completions`;

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
                    'Authorization': `Bearer ${config.apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: config.model,
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
        const config = this.resolveConfig(settings, 'salon');
        const url = `${config.baseUrl}/chat/completions`;

        // === PHASE 1: Extract Keywords (Fast Model) ===
        let keywords: string[] = [];
        try {
            const extractionNode = settings.workflowNodes.textAnalysis;
            const extractionConfig = this.resolveConfig(settings, 'textAnalysis');

            const extractionResponse = await fetch(`${extractionConfig.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${extractionConfig.apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: extractionConfig.model,
                    messages: [
                        { role: 'system', content: 'Extract 3-5 core search keywords from the user question. Return ONLY a JSON array of strings, nothing else. Example: ["Web3", "decentralization", "future"]' },
                        { role: 'user', content: query }
                    ],
                    temperature: 0.3,
                    max_tokens: 100
                })
            });

            if (extractionResponse.ok) {
                const data = await extractionResponse.json();
                const content = data.choices?.[0]?.message?.content || '[]';
                try {
                    const parsed = JSON.parse(content.replace(/```json\s*|\s*```/g, '').trim());
                    if (Array.isArray(parsed)) keywords = parsed;
                } catch {
                    // Fallback: extract words from response
                    keywords = content.match(/["']([^"']+)["']/g)?.map((s: string) => s.replace(/["']/g, '')) || [];
                }
            }
        } catch (e) {
            console.warn("[Keyword Extraction Failed]", e);
        }

        // Fallback keywords from query
        if (keywords.length === 0) {
            keywords = query.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
        }

        console.log("[Thought Salon] Extracted keywords:", keywords);

        // === PHASE 2: Local Search with Scoring ===
        const scoredTweets = tweets.map(tweet => {
            let score = 0;
            const textLower = (tweet.text || '').toLowerCase();

            for (const kw of keywords) {
                if (textLower.includes(kw.toLowerCase())) {
                    score += 10;
                }
            }

            // Bonus for high engagement
            const hvi = ((tweet.favoriteCount || 0) + (tweet.retweetCount || 0) * 2) / Math.max(tweet.viewCount || 1, 1) * 1000;
            score += Math.min(hvi / 10, 5); // Max 5 bonus points

            return { tweet, score };
        });

        // Sort by score and take top 20
        const topTweets = scoredTweets
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(s => s.tweet);

        console.log("[Thought Salon] Top tweets selected:", topTweets.length);

        // === PHASE 3: Build Rich Context ===
        const context = topTweets.map((t, i) => {
            // Calculate weights for prompt
            const likes = t.favoriteCount || 0;
            const rts = t.retweetCount || 0;
            const views = t.viewCount || 1;
            const dataWeight = Math.min(Math.round(((likes * 1 + rts * 2) / views) * 1000 + Math.log10(likes + rts * 2 + 1) * 20), 99);
            const qualityWeight = t.aiScore || 50;

            let block = `[Memory ${i + 1}]: ${t.text}`;
            block += `\n(Quality: ${qualityWeight}, Momentum: ${dataWeight})`;

            // Include image URLs if available
            if (t.media && t.media.length > 0) {
                const imageUrls = t.media
                    .filter(m => m.type !== 'video' && m.type !== 'gif')
                    .map(m => m.url)
                    .slice(0, 2);
                if (imageUrls.length > 0) {
                    block += `\n[Images: ${imageUrls.join(', ')}]`;
                }
            }

            return block;
        }).join('\n\n');

        const authorHandle = typeof tweets[0]?.author === 'string' ? tweets[0].author : (tweets[0]?.author?.handle || 'Unknown');
        const systemPrompt = [
            `你现在是 @${authorHandle}。`,
            "",
            "你正在和一位对你思想感兴趣的朋友进行一场轻松的交流。",
            "像真人一样说话：用「我」来指代自己，分享你的真实想法和观点。",
            "",
            "对话风格：",
            "- 像朋友聊天一样自然，多用陈述句表达观点，可以使用语气词、感叹",
            "- **严禁使用反问句**（如“难道你不觉得...吗？”），不要用说教的口吻",
            "- 除非用户明确询问，否则**不要**在回复末尾强行抛出问题",
            "- 专注于分享你的见解，而不是引导或考问对方",
            "- 可以表达不确定性（\"我觉得...\"、\"也许...\"、\"说实话我也不太确定\"）",
            "- 如果对方的问题让你联想到你写过的某些内容，自然地引用它",
            "- 如果你的记忆（下方的推文片段）中没有相关内容，可以基于你的风格进行合理推测，但要诚实说明",
            "",
            "关于内容权重的认知：",
            "- 每一条推文都有 (Quality, Momentum) 标签。",
            "- Quality 代表内容的「价值/厚度」，Momentum 代表「流量/响度」。",
            "- 如果两者差距很大（如高 Q 低 M），说明这是你的「深刻但小众」的思想，交流时可以表现出对这类观点的珍视。",
            "- 如果两者都很高，说明这是你的「成名作」或「代表作」。",
            "",
            "格式建议：",
            "- 回复不要太长，保持对话节奏感",
            "- 可以用 Markdown 格式化重要观点（**加粗**、列表等）",
            "- 如果引用了某条推文中的图片，可以用 ![简述](url) 展示",
            "",
            `[你的记忆片段 - 以下是你 @${authorHandle} 写过的部分推文]`,
            context,
            "",
            `[用户搜索的话题锚点: ${keywords.join(', ')}]`,
            "",
            "现在，以 @" + authorHandle + " 的身份，用你的语言风格和对方对话吧。请记住：多陈述，少提问。分析时请考虑到你内容的质量与流量对比，展现出真实的创作者气质。"
        ].join('\n');

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                },
                body: JSON.stringify({
                    model: config.model,
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
                if (response.status === 404) {
                    throw new Error(`404 - Model Not Found. Please check your model name: ${config.model}`);
                }
                const isOpenRouterPrivacyError = response.status === 403 && errText.includes('data policy');
                throw new Error(`${response.status} ${isOpenRouterPrivacyError ? '- OpenRouter requires "Free model publication" enabled in Settings > Privacy' : errText}`);
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
