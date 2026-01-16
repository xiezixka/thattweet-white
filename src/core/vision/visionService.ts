import { db } from '../storage/db';
import { Tweet, ProcessStatus, MediaItem } from '../../shared/types/tweet';
import { AISettings, DEFAULT_AI_SETTINGS } from '../../shared/types/settings';

/**
 * 视觉与 OCR 核心服务 (SiliconFlow Multi-modal 驱动)
 * 采用批处理模式：一次 API 调用分析多条推文的多张图片
 */
export class VisionService {
    private static isProcessing = false;
    private static activeKeys = new Set<string>();
    private static BUSY_COOLDOWN_UNTIL = 0;

    /**
     * 运行图片处理队列
     */
    static async processQueue() {
        if (this.isProcessing) return;
        if (Date.now() < this.BUSY_COOLDOWN_UNTIL) return;

        const settings = await this.getSettings();
        if (!settings.visionEnabled && !settings.ocrEnabled) return;

        // 获取可能的 Key
        let apiKeys: string[] = [];
        if (settings.visionProvider === 'siliconflow') {
            if (settings.siliconFlowApiKeys && settings.siliconFlowApiKeys.length > 0) {
                apiKeys = settings.siliconFlowApiKeys;
            } else if (settings.imageKeys && settings.imageKeys.trim()) {
                apiKeys = settings.imageKeys.split('\n').map(k => k.trim()).filter(Boolean);
            } else if (settings.apiKey) {
                apiKeys = [settings.apiKey];
            }
        } else {
            // OpenRouter: Use specific vision key, or fallback to global if it looks like OpenRouter
            const orKey = settings.visionApiKeyOpenRouter || (settings.apiKey?.startsWith('sk-or') ? settings.apiKey : '');
            if (orKey) apiKeys = [orKey];
        }

        const availableKeys = apiKeys.filter(k => !this.activeKeys.has(k));
        console.log(`[VisionService] Starting ${settings.visionProvider} queue process. Keys found: ${apiKeys.length}, Available: ${availableKeys.length}`);

        if (availableKeys.length === 0) {
            if (apiKeys.length === 0) console.warn(`[VisionService] No API keys found for provider: ${settings.visionProvider}`);
            return;
        }

        // 查找待处理的推文
        const pendingTweets = await db.tweets
            .where('imageProcessStatus')
            .equals(ProcessStatus.Pending)
            .toArray();

        // 过滤 visionEnabledAt 之后保存的推文，且必须有图
        const eligibleTweets = pendingTweets.filter(t => {
            if (t.savedAt < settings.visionEnabledAt) return false;
            return t.media?.some(m => m.type === 'image');
        });

        if (eligibleTweets.length === 0) return;

        this.isProcessing = true;
        try {
            // 一次处理一批
            const batchSize = settings.visionBatchSize || 3;
            const tweetsToProcess = eligibleTweets.slice(0, batchSize * availableKeys.length);

            // 按 Key 分组并发执行
            const tasks: Promise<void>[] = [];
            for (let i = 0; i < availableKeys.length; i++) {
                const key = availableKeys[i];
                const startIdx = i * batchSize;
                const batch = tweetsToProcess.slice(startIdx, startIdx + batchSize);

                if (batch.length > 0) {
                    tasks.push(this.processBatch(batch, key, settings));
                }
            }

            await Promise.all(tasks);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 处理一批推文 (单一 Key)
     */
    public static async processBatch(tweets: Tweet[], apiKey: string, settings: AISettings) {
        this.activeKeys.add(apiKey);
        try {
            console.log(`[VisionService] Processing batch of ${tweets.length} tweets...`);

            // 1. 标记为处理中
            for (const t of tweets) {
                await db.tweets.update(t.id, { imageProcessStatus: ProcessStatus.Processing });
            }

            // 2. 拉取所有图片并转为 Base64
            const tweetImageData: Array<{ tweetId: string; images: string[] }> = [];
            let allBase64: string[] = [];
            let imageToTweetMap: Array<{ tweetId: string; localIndex: number }> = [];

            for (const tweet of tweets) {
                const imageUrls = tweet.media
                    ?.filter(m => m.type === 'image')
                    .slice(0, settings.maxImagesPerTweet || 4)
                    .map(m => m.url) || [];

                const base64List: string[] = [];
                for (let i = 0; i < imageUrls.length; i++) {
                    const b64 = await this.fetchImageAsBase64(imageUrls[i]);
                    if (b64) {
                        base64List.push(b64);
                        imageToTweetMap.push({ tweetId: tweet.id, localIndex: i });
                        allBase64.push(b64);
                    }
                }
                tweetImageData.push({ tweetId: tweet.id, images: base64List });
            }

            if (allBase64.length === 0) {
                for (const t of tweets) {
                    await db.tweets.update(t.id, { imageProcessStatus: ProcessStatus.Skipped });
                }
                return;
            }

            // 3. 构建多模态请求
            const analysisResult = await this.callVLM(allBase64, tweets, imageToTweetMap, apiKey, settings);

            if (analysisResult === 'BUSY') {
                this.BUSY_COOLDOWN_UNTIL = Date.now() + 60 * 1000;
                // 重置状态为 Pending 以便重试
                for (const t of tweets) {
                    await db.tweets.update(t.id, { imageProcessStatus: ProcessStatus.Pending });
                }
                return;
            }

            // 4. 解析结果并写回数据库
            for (const tweet of tweets) {
                const result = analysisResult[tweet.id];
                if (result) {
                    // 合并所有图片的 OCR 文字到一个大文本
                    const allOcr = result.details?.map(d => d.ocr).filter(Boolean).join('\n\n') || '';

                    await db.tweets.update(tweet.id, {
                        visionDescription: result.overall || '',
                        ocrText: allOcr,
                        mediaAnalysis: result.details || [],
                        imageProcessStatus: ProcessStatus.Completed,
                        imageProcessedAt: Date.now()
                    });
                } else {
                    await db.tweets.update(tweet.id, { imageProcessStatus: ProcessStatus.Failed });
                }
            }

        } catch (err) {
            console.error(`[VisionService] Batch process failed:`, err);
            for (const t of tweets) {
                await db.tweets.update(t.id, { imageProcessStatus: ProcessStatus.Failed });
            }
        } finally {
            this.activeKeys.delete(apiKey);
        }
    }

    /**
     * 调用 VLM API
     */
    private static async callVLM(
        imageBase64List: string[],
        tweets: Tweet[],
        mapping: Array<{ tweetId: string; localIndex: number }>,
        apiKey: string,
        settings: AISettings
    ): Promise<Record<string, { overall: string; details: Array<{ ocr: string; description: string }> }> | 'BUSY'> {
        try {

            const mappingInfo = tweets.map(t => {
                const indices = mapping.map((m, i) => m.tweetId === t.id ? i : -1).filter(idx => idx !== -1);
                return `- Tweet ID [${t.id}]: 包含图片索引 ${JSON.stringify(indices)}`;
            }).join('\n');

            const prompt = (settings.promptVision || DEFAULT_AI_SETTINGS.promptVision)
                .replace(/{ai_style_focus}/g, settings.aiStyleFocus || '')
                .replace(/{tweet_mapping}/g, mappingInfo);


            const model = settings.visionModel || (settings.visionProvider === 'siliconflow' ? 'Qwen/Qwen2-VL-7B-Instruct' : 'google/gemini-pro-1.5-exp');

            let baseUrl = 'https://api.siliconflow.cn/v1';
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            };

            if (settings.visionProvider === 'openrouter') {
                baseUrl = 'https://openrouter.ai/api/v1';
                headers['HTTP-Referer'] = 'https://github.com/RechardLLee/thattweet-vite';
                headers['X-Title'] = 'ThatTweet (Advanced Vision)';
            }

            const url = `${baseUrl}/chat/completions`;

            console.log(`[VisionService] Calling VLM API:`, { url, model, images: imageBase64List.length });

            // 构建符合规范的消息数组
            // 对于 OpenRouter，有些模型对 System Message 支持不佳，我们将指令直接放入 User Message
            const messages: any[] = [];

            const systemInstruction = '你是一个专业的推文图像分析助手。你必须严格按 JSON 格式返回结果，不包含任何解释或 Markdown 标记。';

            if (settings.visionProvider === 'siliconflow') {
                messages.push({ role: 'system', content: systemInstruction });
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        ...imageBase64List.map(base64 => ({
                            type: 'image_url',
                            image_url: { url: base64, detail: 'auto' }
                        }))
                    ]
                });
            } else {
                // OpenRouter: 合并 Prompt
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: `${systemInstruction}\n\n${prompt}` },
                        ...imageBase64List.map(base64 => ({
                            type: 'image_url',
                            image_url: { url: base64 } // OpenRouter 有些模型不喜欢 detail: auto
                        }))
                    ]
                });
            }

            try {
                const body: any = {
                    model,
                    messages,
                    stream: false,
                    temperature: 0.7,
                    max_tokens: 4096
                };

                console.log(`[VisionService] Fetching from ${url}...`);
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
                console.log(`[VisionService] Response received. Status: ${response.status}`);

                if (response.status === 429 || response.status === 503) return 'BUSY';
                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`[VisionService] API Error ${response.status}:`, errorBody);
                    throw new Error(`API error: ${response.status} - ${errorBody}`);
                }

                const data = await response.json();

                // Enhanced response parsing: check multiple possible response structures
                const choice = data.choices?.[0];
                const message = choice?.message;

                // Try multiple possible content fields
                let rawContent = message?.content
                    || message?.text
                    || message?.reasoning_content
                    || choice?.text  // Some APIs put text directly on choice
                    || (typeof message === 'string' ? message : null); // Some APIs return message as string directly

                // If still no content, check for error messages in the response
                if (!rawContent && data.error) {
                    console.error('[VisionService] API returned error:', data.error);
                    throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
                }

                console.log(`[VisionService] Raw VLM Response Content:`, rawContent);

                if (!rawContent) {
                    // Log the full response structure for debugging
                    console.error('[VisionService] VLM Response missing content. Full response structure:', JSON.stringify(data, null, 2));
                    console.error('[VisionService] Response keys:', Object.keys(data));
                    if (data.choices) {
                        console.error('[VisionService] choices[0] keys:', data.choices[0] ? Object.keys(data.choices[0]) : 'no choices');
                        if (data.choices[0]?.message) {
                            console.error('[VisionService] message keys:', Object.keys(data.choices[0].message));
                        }
                    }
                    throw new Error('Empty response from VLM - could not find content in response');
                }

                // 尝试解析 JSON (更加鲁棒的提取方式)
                let jsonStr = '';
                try {
                    const firstBrace = rawContent.indexOf('{');
                    const lastBrace = rawContent.lastIndexOf('}');
                    if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON object found');

                    jsonStr = rawContent.substring(firstBrace, lastBrace + 1);

                    // 1. 基础清理：移除常见的 JSON 污染（如 Markdown 代码块标记在内部被误切）
                    // 已经在 substring 处理过了，主要是处理内部内容

                    // 2. 移除尾随逗号 (Trailing Commas)
                    let cleanedJson = jsonStr.replace(/,\s*([\]}])/g, '$1');

                    // 3. 移除单行/多行注释 (有些模型喜欢在 JSON 里写注释)
                    cleanedJson = cleanedJson.replace(/\/\/.*$/gm, '');
                    cleanedJson = cleanedJson.replace(/\/\*[\s\S]*?\*\//g, '');

                    // 4. 修复控制字符 (Bad control character)
                    // 模型在 OCR 提取时常在字符串中直接输出真实换行符或制表符，这在 JSON 字符串中是非法的
                    // 我们通过正则锁定所有引号内的内容，并将这些物理控制字符转换为转义形式
                    cleanedJson = cleanedJson.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, content) => {
                        return `"${content
                            .replace(/\n/g, '\\n')
                            .replace(/\r/g, '\\r')
                            .replace(/\t/g, '\\t')
                            .replace(/[\x00-\x1F]/g, '')}"`;
                    });

                    // 5. 修复引号内未转义的双引号
                    // 寻找在引号内但未转义的引号（不包括该字段开头和结尾的引号）
                    cleanedJson = cleanedJson.replace(/(?<=: \s*")(.+?)(?="\s*[,}\]])/gs, (match, content) => {
                        return content.replace(/(?<!\\)"/g, '\\"');
                    });

                    let parsed = JSON.parse(cleanedJson);

                    // 6. 逻辑纠错：处理模型直接返回 "tweet_id" 作为键名的情况
                    if (parsed.tweet_id && tweets.length === 1) {
                        const actualId = tweets[0].id;
                        parsed = { [actualId]: parsed.tweet_id };
                    }

                    return parsed;
                } catch (e: any) {
                    console.warn('[VisionService] Failed to parse JSON. Error:', e.message);

                    // 打印错误附近的上下文，方便准确定位
                    if (e.message.includes('position')) {
                        const posMatch = e.message.match(/position (\d+)/);
                        if (posMatch) {
                            const pos = parseInt(posMatch[1], 10);
                            const start = Math.max(0, pos - 50);
                            const end = Math.min(jsonStr.length, pos + 50);
                            console.warn('[VisionService] Error near position ' + pos + ':\n' +
                                jsonStr.substring(start, pos) + ' >>>' + jsonStr[pos] + '<<< ' + jsonStr.substring(pos + 1, end));
                        }
                    }

                    console.log('[VisionService] Raw content for debugging:', rawContent);

                    // 最后的挣扎：更加鲁棒的正则恢复 + 终极截断兜底
                    try {
                        console.log('[VisionService] Attempting improved emergency regex recovery...');
                        const recovered: any = {};
                        const hasGenericKey = rawContent.includes('"tweet_id"');

                        tweets.forEach(t => {
                            const key = (hasGenericKey && tweets.length === 1) ? 'tweet_id' : t.id;

                            // 尝试抓取 overall
                            const overallMatch = rawContent.match(new RegExp(`"${key}"\\s*:\\s*{\\s*"overall"\\s*:\\s*"([^"]+)"`, 'i'));

                            if (overallMatch) {
                                const details: any[] = [];
                                // 简单的正则抓取 OCR 和 Description 对
                                const detailRegex = /\{\s*"ocr"\s*:\s*"([^"]+)"\s*,\s*"description"\s*:\s*"([^"]+)"\s*\}/gi;
                                let m;
                                while ((m = detailRegex.exec(rawContent)) !== null) {
                                    details.push({
                                        ocr: m[1].replace(/\\n/g, '\n'),
                                        description: m[2].replace(/\\n/g, '\n')
                                    });
                                }
                                recovered[t.id] = {
                                    overall: overallMatch[1].replace(/\\n/g, '\n'),
                                    details: details.length > 0 ? details : []
                                };
                            } else {
                                // 最终兜底：如果连正则都抓不到，直接截断原文作为描述
                                console.warn(`[VisionService] No regex match for ${t.id}, using raw content truncation.`);
                                recovered[t.id] = {
                                    overall: rawContent.substring(0, 500).replace(/["{}]/g, '') + '... (解析失败，保留原文片段)',
                                    details: []
                                };
                            }
                        });

                        if (Object.keys(recovered).length > 0) return recovered;
                    } catch (recoveryError) {
                        console.error('[VisionService] Recovery failed:', recoveryError);
                    }

                    // 如果走到这里依然没有数据
                    const fallback: any = {};
                    tweets.forEach(t => {
                        fallback[t.id] = {
                            overall: "视觉分析解析彻底失败。原始响应：" + (rawContent ? rawContent.substring(0, 200) : '无响应'),
                            details: []
                        };
                    });
                    return fallback;
                }
            } catch (innerErr) {
                console.error('[VisionService] VLM Call error:', innerErr);
                throw innerErr;
            }
        } catch (fatalErr: any) {
            console.error('[VisionService] Fatal error in callVLM:', fatalErr);
            throw fatalErr;
        }
    }

    /**
     * 拉取图片转 Base64
     */
    private static async fetchImageAsBase64(url: string): Promise<string | null> {
        try {
            // Twitter 图片需要处理 URL 增加高质量参数
            const processedUrl = url.includes('pbs.twimg.com') && !url.includes('?')
                ? `${url}?format=jpg&name=medium`
                : url;

            const response = await fetch(processedUrl);
            if (!response.ok) return null;
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    }

    /**
     * 强制立即处理单个推文的视觉分析
     */
    static async forceProcessTweet(tweetId: string) {
        const settings = await this.getSettings();
        if (!settings.visionEnabled && !settings.ocrEnabled) return;

        const tweet = await db.tweets.get(tweetId);
        if (!tweet) return;

        // 获取 Key
        let apiKey = '';
        if (settings.visionProvider === 'siliconflow') {
            if (settings.siliconFlowApiKeys?.length > 0) {
                apiKey = settings.siliconFlowApiKeys[0];
            } else if (settings.imageKeys?.trim()) {
                apiKey = settings.imageKeys.split('\n')[0].trim();
            } else if (settings.apiKey) {
                apiKey = settings.apiKey;
            }
        } else {
            apiKey = settings.visionApiKeyOpenRouter || (settings.apiKey?.startsWith('sk-or') ? settings.apiKey : '');
        }

        if (!apiKey) {
            console.warn(`[VisionService] No API key for ${settings.visionProvider}`);
            return;
        }

        console.log(`[VisionService] Forcing immediate ${settings.visionProvider} vision analysis for ${tweetId}`);
        await this.processBatch([tweet], apiKey, settings);
    }

    private static async getSettings(): Promise<AISettings> {
        return new Promise((resolve) => {
            chrome.storage.local.get(['aiSettings'], (res) => {
                resolve(res.aiSettings || DEFAULT_AI_SETTINGS);
            });
        });
    }

    /**
     * 获取 SiliconFlow 可用的模型列表
     * 可用于调试和模型选择
     */
    static async fetchAvailableModels(apiKey: string, provider: 'siliconflow' | 'openrouter' = 'siliconflow'): Promise<Array<{ id: string; type?: string }>> {
        const baseUrl = provider === 'siliconflow' ? 'https://api.siliconflow.cn/v1' : 'https://openrouter.ai/api/v1';
        try {
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                    'X-Title': 'ThatTweet'
                }
            });

            if (!response.ok) {
                console.error('[VisionService] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            const models = data.data || [];

            // 过滤出可能支持视觉的模型（包含 VL, Vision, OCR 等关键词）
            const vlmModels = models.filter((m: any) => {
                const id = m.id.toLowerCase();
                if (provider === 'openrouter') {
                    return id.includes(':free');
                }
                return true;
            });

            console.log('[VisionService] Available VLM models:', vlmModels.map((m: any) => m.id));
            return vlmModels;
        } catch (err) {
            console.error('[VisionService] Error fetching models:', err);
            return [];
        }
    }

    /**
     * 调试工具：在控制台打印可用的 VLM 模型
     */
    static async debugListModels() {
        const settings = await this.getSettings();
        const apiKeys = settings.siliconFlowApiKeys.length > 0
            ? settings.siliconFlowApiKeys
            : (settings.apiKey ? [settings.apiKey] : []);

        if (apiKeys.length === 0) {
            console.warn('[VisionService] No API keys configured');
            return;
        }

        const models = await this.fetchAvailableModels(apiKeys[0], settings.visionProvider);
        console.table(models);
    }
}
