import { db } from '../storage/db';
import { Tweet, ProcessStatus, MediaItem } from '../../shared/types/tweet';
import { AISettings, DEFAULT_AI_SETTINGS, getSafeAISettings } from '../../shared/types/settings';
import { parseCategories } from '../../shared/constants/imageCategories';

// ==================== 配置常量 ====================
const CONFIG = {
    /** 单次请求最大图片数量 (大多数免费 VLM 模型限制) */
    MAX_IMAGES_PER_REQUEST: 6,
    /** API 繁忙时的冷却时间 (毫秒) */
    BUSY_COOLDOWN_MS: 60 * 1000,
    /** VLM API 的 max_tokens */
    VLM_MAX_TOKENS: 4096,
    /** VLM API 的 temperature */
    VLM_TEMPERATURE: 0.7,
    /** 修复模型的 max_tokens */
    REPAIR_MAX_TOKENS: 2048,
    /** 修复模型的 temperature */
    REPAIR_TEMPERATURE: 0.3,
    /** 队列查询限制 */
    QUEUE_FETCH_LIMIT: 100,
} as const;

// ==================== 类型定义 ====================
interface ImageDetail {
    ocr: string;
    description: string;
    categories: string[];
}

interface TweetAnalysisResult {
    overall: string;
    details: ImageDetail[];
}

type AnalysisResults = Record<string, TweetAnalysisResult>;

interface ImageMapping {
    tweetId: string;
    localIndex: number;
}

/**
 * 视觉与 OCR 核心服务 (SiliconFlow Multi-modal 驱动)
 * 采用批处理模式：一次 API 调用分析多条推文的多张图片
 */
export class VisionService {
    private static isProcessing = false;
    private static activeKeys = new Set<string>();
    private static BUSY_COOLDOWN_UNTIL = 0;

    // ==================== 公共 API ====================

    /**
     * 运行图片处理队列
     */
    static async processQueue(): Promise<void> {
        if (this.isProcessing || Date.now() < this.BUSY_COOLDOWN_UNTIL) return;

        // 🚀 立即上锁，防止 race condition
        this.isProcessing = true;

        try {
            const settings = await this.getSettings();
            const node = settings.workflowNodes.perception;
            if (!node.enabled) {
                this.isProcessing = false;
                return;
            }

            const { provider, apiKey } = this.resolveProvider(settings, node.providerId);
            if (!provider || !apiKey || this.activeKeys.has(apiKey)) {
                this.isProcessing = false;
                return;
            }

            console.log(`[VisionService] Starting perception process using provider: ${provider.name}`);

            const eligibleTweets = await this.fetchEligibleTweets(settings);
            if (eligibleTweets.length === 0) {
                this.isProcessing = false;
                return;
            }

            const batchSize = settings.visionBatchSize || 3;
            const tweetsToProcess = eligibleTweets.slice(0, batchSize);

            if (tweetsToProcess.length > 0) {
                await this.updateTweetsStatus(tweetsToProcess, ProcessStatus.Processing);
                await this.processBatch(tweetsToProcess, apiKey, settings);
            }
        } catch (err) {
            console.error(`[VisionService] processQueue failed:`, err);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 处理一批推文 (单一 Key)
     */
    public static async processBatch(tweets: Tweet[], apiKey: string, settings: AISettings): Promise<void> {
        this.activeKeys.add(apiKey);
        const processedTweets: Tweet[] = [];

        try {
            console.log(`[VisionService] Processing batch of ${tweets.length} tweets...`);

            // 收集图片数据
            const { allBase64, imageToTweetMap, processedTweets: processed, remainingTweets } =
                await this.collectImageData(tweets, settings);

            processedTweets.push(...processed);

            // 处理超出限制的推文 - 重置为 Pending
            if (remainingTweets.length > 0) {
                await this.updateTweetsStatus(remainingTweets, ProcessStatus.Pending);
            }

            // 如果没有成功获取图片
            if (allBase64.length === 0) {
                await this.updateTweetsStatus(processedTweets, ProcessStatus.Skipped);
                return;
            }

            // 调用 VLM API
            const analysisResult = await this.callVLM(allBase64, processedTweets, imageToTweetMap, apiKey, settings);

            // 处理 BUSY 状态
            if (analysisResult === 'BUSY') {
                this.BUSY_COOLDOWN_UNTIL = Date.now() + CONFIG.BUSY_COOLDOWN_MS;
                await this.updateTweetsStatus(processedTweets, ProcessStatus.Pending);
                return;
            }

            // 写回结果
            await this.saveAnalysisResults(processedTweets, analysisResult);

        } catch (err) {
            console.error(`[VisionService] Batch process failed:`, err);
            const targets = processedTweets.length > 0 ? processedTweets : tweets;
            await this.updateTweetsStatus(targets, ProcessStatus.Failed);
        } finally {
            this.activeKeys.delete(apiKey);
        }
    }

    /**
     * 强制立即处理单个推文的视觉分析
     * 注意：这个方法不检查 enabled 状态，只要配置了 provider 和 model 就可以运行
     * 用于收藏时触发视觉分析
     */
    static async forceProcessTweet(tweetId: string): Promise<void> {
        const settings = await this.getSettings();
        const node = settings.workflowNodes.perception;

        const tweet = await db.tweets.get(tweetId);
        if (!tweet) return;

        const hasImages = tweet.media?.some(m => m.type === 'image');
        if (!hasImages) {
            console.log(`[VisionService] Tweet ${tweetId} has no images, skipping vision analysis`);
            return;
        }

        const { provider, apiKey } = this.resolveProvider(settings, node.providerId);
        if (!provider || !apiKey) {
            console.log(`[VisionService] No valid provider configured for perception, skipping`);
            return;
        }

        if (!node.model) {
            console.log(`[VisionService] No model configured for perception, skipping`);
            return;
        }

        console.log(`[VisionService] Forcing immediate perception analysis for ${tweetId}`);
        await this.processBatch([tweet], apiKey, settings);
    }

    /**
     * 重置所有图片分析状态，以便重新处理
     */
    static async resetAllImageAnalysis(): Promise<number> {
        console.log('[VisionService] Resetting all image analysis status...');

        const completedTweets = await db.tweets
            .where('imageProcessStatus')
            .anyOf([ProcessStatus.Completed, ProcessStatus.Failed, ProcessStatus.Skipped])
            .filter(t => t.media?.some(m => m.type === 'image'))
            .toArray();

        if (completedTweets.length === 0) {
            console.log('[VisionService] No tweets to reset');
            return 0;
        }

        await Promise.all(completedTweets.map(t =>
            db.tweets.update(t.id, {
                imageProcessStatus: ProcessStatus.Pending,
                mediaAnalysis: undefined,
                visionDescription: undefined,
                ocrText: undefined,
                imageProcessedAt: undefined
            })
        ));

        console.log(`[VisionService] Reset ${completedTweets.length} tweets for reprocessing`);
        return completedTweets.length;
    }

    /**
     * 获取可用的模型列表
     */
    static async fetchAvailableModels(
        apiKey: string,
        provider: 'siliconflow' | 'openrouter' = 'siliconflow'
    ): Promise<Array<{ id: string; type?: string }>> {
        const baseUrl = provider === 'siliconflow'
            ? 'https://api.siliconflow.cn/v1'
            : 'https://openrouter.ai/api/v1';

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

            const vlmModels = models.filter((m: any) => {
                const id = m.id.toLowerCase();
                return provider === 'openrouter' ? id.includes(':free') : true;
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
    static async debugListModels(): Promise<void> {
        const settings = await this.getSettings();
        const providerId = settings.workflowNodes.perception.providerId || settings.defaultProviderId;
        const provider = settings.providers.find(p => p.id === providerId);

        if (!provider || !provider.apiKey) {
            console.warn('[VisionService] No API keys configured');
            return;
        }

        const models = await this.fetchAvailableModels(
            provider.apiKey,
            provider.provider === 'openrouter' ? 'openrouter' : 'siliconflow'
        );
        console.table(models);
    }

    // ==================== 私有辅助方法 ====================

    private static async getSettings(): Promise<AISettings> {
        return new Promise((resolve) => {
            chrome.storage.local.get(['aiSettings'], (res) => {
                resolve(getSafeAISettings(res.aiSettings));
            });
        });
    }

    /**
     * 解析 Provider 配置
     */
    private static resolveProvider(settings: AISettings, nodeProviderId?: string) {
        const providerId = nodeProviderId || settings.defaultProviderId;
        const provider = settings.providers.find(p => p.id === providerId);
        const apiKey = provider?.apiKey;
        return { provider, apiKey };
    }

    /**
     * 获取待处理的推文
     */
    private static async fetchEligibleTweets(settings: AISettings): Promise<Tweet[]> {
        const pendingIds = await db.tweets
            .where('imageProcessStatus')
            .equals(ProcessStatus.Pending)
            .limit(CONFIG.QUEUE_FETCH_LIMIT)
            .primaryKeys();

        if (pendingIds.length === 0) return [];

        const candidates = await db.tweets.bulkGet(pendingIds as string[]);
        return (candidates.filter(t => t !== undefined) as Tweet[]).filter(t => {
            if (t.savedAt < settings.visionEnabledAt) return false;
            return t.media?.some((m: MediaItem) => m.type === 'image');
        });
    }

    /**
     * 批量更新推文状态
     */
    private static async updateTweetsStatus(tweets: Tweet[], status: ProcessStatus): Promise<void> {
        await Promise.all(tweets.map(t =>
            db.tweets.update(t.id, { imageProcessStatus: status, ...(status === ProcessStatus.Processing ? { imageProcessingStartedAt: Date.now() } : {}) })
        ));
    }

    /**
     * 收集图片数据并转换为 Base64
     */
    private static async collectImageData(tweets: Tweet[], settings: AISettings) {
        const allBase64: string[] = [];
        const imageToTweetMap: ImageMapping[] = [];
        const processedTweets: Tweet[] = [];
        const remainingTweets: Tweet[] = [];

        for (const tweet of tweets) {
            const imageUrls = tweet.media
                ?.filter(m => m.type === 'image')
                .slice(0, settings.maxImagesPerTweet || 4)
                .map(m => m.url) || [];

            // 检查是否超出图片限制
            if (allBase64.length + imageUrls.length > CONFIG.MAX_IMAGES_PER_REQUEST) {
                console.warn(`[VisionService] Batch too large. Truncating.`);
                remainingTweets.push(...tweets.slice(tweets.indexOf(tweet)));
                break;
            }

            processedTweets.push(tweet);

            for (let i = 0; i < imageUrls.length; i++) {
                const b64 = await this.fetchImageAsBase64(imageUrls[i]);
                if (b64) {
                    allBase64.push(b64);
                    imageToTweetMap.push({ tweetId: tweet.id, localIndex: i });
                }
            }
        }

        return { allBase64, imageToTweetMap, processedTweets, remainingTweets };
    }

    /**
     * 保存分析结果到数据库
     */
    private static async saveAnalysisResults(tweets: Tweet[], results: AnalysisResults): Promise<void> {
        await Promise.all(tweets.map(tweet => {
            const result = results[tweet.id];
            if (result) {
                const allOcr = result.details?.map(d => d.ocr).filter(Boolean).join('\n\n') || '';
                return db.tweets.update(tweet.id, {
                    visionDescription: result.overall || '',
                    ocrText: allOcr,
                    mediaAnalysis: result.details || [],
                    imageProcessStatus: ProcessStatus.Completed,
                    imageProcessedAt: Date.now()
                });
            } else {
                return db.tweets.update(tweet.id, { imageProcessStatus: ProcessStatus.Failed });
            }
        }));
    }

    /**
     * 拉取图片转 Base64 (带压缩优化)
     */
    private static async fetchImageAsBase64(url: string): Promise<string | null> {
        try {
            // 🚀 性能优化：优先取 medium 版本，已经足够 AI 分析，节省流量和内存
            const processedUrl = url.includes('pbs.twimg.com') && !url.includes('?')
                ? `${url}?format=jpg&name=medium`
                : url;

            console.log(`[VisionService] Fetching image: ${processedUrl.substring(0, 80)}...`);
            const response = await fetch(processedUrl);

            if (!response.ok) {
                console.warn(`[VisionService] Image fetch failed: ${response.status}`);
                return null;
            }

            const blob = await response.blob();

            // 🚀 核心优化：在客户端进行二次缩放压缩，极致节省内存
            return await this.resizeImage(blob, 1024);
        } catch (err) {
            console.error(`[VisionService] Image fetch error:`, err);
            return null;
        }
    }

    /**
     * 使用 Canvas 调整图片尺寸并压缩
     * @param blob 原始图片 Blob
     * @param maxDim 最大边长
     */
    private static async resizeImage(blob: Blob, maxDim: number): Promise<string | null> {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let width = img.width;
                let height = img.height;

                // 计算缩放比例
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = (height / width) * maxDim;
                        width = maxDim;
                    } else {
                        width = (width / height) * maxDim;
                        height = maxDim;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    resolve(null);
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                // 压缩质量 0.8，既保证清晰度又能大幅减小体积
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

                console.log(`[VisionService] Image resized: ${img.width}x${img.height} -> ${Math.round(width)}x${Math.round(height)}`);
                resolve(dataUrl);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };

            img.src = url;
        });
    }

    // ==================== VLM API 调用 ====================

    /**
     * 调用 VLM API
     */
    private static async callVLM(
        imageBase64List: string[],
        tweets: Tweet[],
        mapping: ImageMapping[],
        apiKey: string,
        settings: AISettings
    ): Promise<AnalysisResults | 'BUSY'> {
        const node = settings.workflowNodes.perception;
        const { provider } = this.resolveProvider(settings, node.providerId);
        if (!provider) throw new Error("Provider not found");

        const mappingInfo = tweets.map(t => {
            const indices = mapping
                .map((m, i) => m.tweetId === t.id ? i : -1)
                .filter(idx => idx !== -1);
            return `- Tweet ID [${t.id}]: 包含图片索引 ${JSON.stringify(indices)}`;
        }).join('\n');

        const prompt = (node.prompt || "")
            .replace(/{ai_style_focus}/g, settings.aiStyleFocus || '')
            .replace(/{tweet_mapping}/g, mappingInfo);

        const baseUrl = provider.baseUrl.trim().replace(/\/$/, '');
        const url = `${baseUrl}/chat/completions`;

        const messages = this.buildVLMMessages(prompt, imageBase64List);
        const body = {
            model: node.model,
            messages,
            stream: false,
            temperature: CONFIG.VLM_TEMPERATURE,
            max_tokens: CONFIG.VLM_MAX_TOKENS
        };

        console.log(`[VisionService] Calling VLM API:`, { url, model: node.model, images: imageBase64List.length });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.buildHeaders(apiKey),
                body: JSON.stringify(body)
            });

            console.log(`[VisionService] Response received. Status: ${response.status}`);

            // 处理可重试的错误
            if (response.status === 429 || response.status === 503) return 'BUSY';

            if (!response.ok) {
                return this.handleAPIError(response, node.model);
            }

            const data = await response.json();
            const rawContent = this.extractResponseContent(data);

            if (!rawContent) {
                throw new Error('Empty response from VLM');
            }

            console.log(`[VisionService] Raw VLM Response Content:`, rawContent);

            return await this.parseVLMResponse(rawContent, tweets, imageBase64List.length, settings);

        } catch (err) {
            console.error('[VisionService] VLM Call error:', err);
            throw err;
        }
    }

    /**
     * 构建 VLM 消息数组
     */
    private static buildVLMMessages(prompt: string, imageBase64List: string[]): any[] {
        const systemInstruction = '你是一个专业的推文图像分析助手。你必须严格按 JSON 格式返回结果，不包含任何解释或 Markdown 标记。';

        return [
            { role: 'system', content: systemInstruction },
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    ...imageBase64List.map(base64 => ({
                        type: 'image_url',
                        image_url: { url: base64, detail: 'auto' }
                    }))
                ]
            }
        ];
    }

    /**
     * 构建请求头
     */
    private static buildHeaders(apiKey: string): Record<string, string> {
        return {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
            'X-Title': 'ThatTweet'
        };
    }

    /**
     * 处理 API 错误响应
     */
    private static async handleAPIError(response: Response, model: string): Promise<'BUSY'> {
        const errText = await response.text();

        if (response.status === 404) {
            throw new Error(`404 - Model Not Found. Please check your model name: ${model}`);
        }

        const isOpenRouterPrivacyError = response.status === 403 && errText.includes('data policy');
        console.error(`[VisionService] API Error ${response.status}:`, errText);

        throw new Error(`${response.status} ${isOpenRouterPrivacyError
            ? '- OpenRouter requires "Free model publication" enabled in Settings > Privacy'
            : errText}`);
    }

    /**
     * 从响应中提取内容
     */
    private static extractResponseContent(data: any): string | null {
        const choice = data.choices?.[0];
        const message = choice?.message;

        let rawContent = message?.content
            || message?.text
            || message?.reasoning_content
            || choice?.text
            || (typeof message === 'string' ? message : null);

        // 检查响应体中的错误
        if (!rawContent && data.error) {
            console.error('[VisionService] API returned error in response body:', data.error);
            const code = data.error.code;
            const msg = data.error.message || '';

            const isRetriable = this.isRetriableError(code, msg);
            if (isRetriable) {
                console.warn('[VisionService] Retriable error detected.');
                return null; // 将在调用方处理
            }
            throw new Error(`API error: ${msg || JSON.stringify(data.error)}`);
        }

        return rawContent;
    }

    /**
     * 判断是否为可重试的错误
     */
    private static isRetriableError(code: number, message: string): boolean {
        const retriableCodes = [502, 503, 429];
        const retriablePatterns = ['busy', 'network connection', 'timeout', 'overload', 'unavailable'];

        return retriableCodes.includes(code) ||
            retriablePatterns.some(p => message.toLowerCase().includes(p));
    }

    // ==================== 响应解析 ====================

    /**
     * 解析 VLM 响应
     */
    private static async parseVLMResponse(
        rawContent: string,
        tweets: Tweet[],
        imageCount: number,
        settings: AISettings
    ): Promise<AnalysisResults> {
        try {
            let jsonStr = this.extractJsonString(rawContent);
            jsonStr = this.handleMultipleJsonObjects(jsonStr, tweets);
            jsonStr = this.cleanJsonString(jsonStr);

            let parsed = JSON.parse(jsonStr);
            parsed = this.remapTweetIds(parsed, tweets);

            return this.normalizeResults(parsed, tweets);

        } catch (e: any) {
            console.warn('[VisionService] Failed to parse JSON. Error:', e.message);
            this.logParseError(e, rawContent);

            // 尝试紧急恢复
            const recovered = this.emergencyRegexRecovery(rawContent, tweets);
            if (recovered) return recovered;

            // 尝试使用文本模型修复
            const repaired = await this.repairWithTextModel(rawContent, tweets, imageCount, settings);
            if (repaired) return repaired;

            // 返回 fallback
            return this.createFallbackResult(tweets, rawContent);
        }
    }

    /**
     * 提取 JSON 字符串
     */
    private static extractJsonString(content: string): string {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
            throw new Error('No JSON object found');
        }

        return content.substring(firstBrace, lastBrace + 1);
    }

    /**
     * 处理多个独立 JSON 对象的情况
     */
    private static handleMultipleJsonObjects(jsonStr: string, tweets: Tweet[]): string {
        const multiObjectPattern = /\}\s*\n?\s*\{/g;

        if (!multiObjectPattern.test(jsonStr)) {
            return jsonStr;
        }

        console.log('[VisionService] Detected multiple separate JSON objects, attempting to merge...');

        const objects = this.parseMultipleObjects(jsonStr);

        if (objects.length > 0) {
            const merged: any = {};
            objects.forEach((obj, idx) => {
                let tweetId = obj['推文ID'] || obj['tweet_id'] || obj['id'];

                if (typeof tweetId === 'string') {
                    tweetId = tweetId.replace(/[\[\]"]/g, '').trim();
                }

                if (!tweetId && idx < tweets.length) {
                    tweetId = tweets[idx].id;
                }

                if (tweetId) {
                    merged[tweetId] = obj;
                }
            });

            console.log('[VisionService] Merged objects:', Object.keys(merged));
            return JSON.stringify(merged);
        }

        return jsonStr;
    }

    /**
     * 解析多个 JSON 对象
     */
    private static parseMultipleObjects(jsonStr: string): any[] {
        const objects: any[] = [];
        let depth = 0;
        let start = 0;

        for (let i = 0; i < jsonStr.length; i++) {
            if (jsonStr[i] === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (jsonStr[i] === '}') {
                depth--;
                if (depth === 0) {
                    const objStr = jsonStr.substring(start, i + 1);
                    try {
                        objects.push(JSON.parse(objStr));
                    } catch (e) {
                        console.warn('[VisionService] Failed to parse individual object');
                    }
                }
            }
        }

        return objects;
    }

    /**
     * 清理 JSON 字符串
     */
    private static cleanJsonString(jsonStr: string): string {
        let cleaned = jsonStr;

        // 处理双重转义
        if (cleaned.includes('\\"') && !cleaned.slice(1, -1).includes('"')) {
            cleaned = cleaned.replace(/\\"/g, '"');
        }

        // 尝试反转义
        if (cleaned.startsWith('{') && cleaned.includes('\\"')) {
            try {
                const testUnescaped = cleaned.replace(/\\"/g, '"');
                JSON.parse(testUnescaped);
                cleaned = testUnescaped;
            } catch {
                // 保持原样
            }
        }

        // 移除 BOM 和空白
        cleaned = cleaned.replace(/^\uFEFF/, '').trim();

        // 移除尾随逗号
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

        // 移除注释
        cleaned = cleaned.replace(/\/\/.*$/gm, '');
        cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

        // 修复字符串内的控制字符和无效转义
        cleaned = cleaned.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, content) => {
            let fixed = content
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/[\x00-\x1F]/g, '')
                .replace(/\\([^nrtbf\\"\/u])/g, '$1');
            return `"${fixed}"`;
        });

        return cleaned;
    }

    /**
     * 重映射 Tweet ID
     */
    private static remapTweetIds(parsed: any, tweets: Tweet[]): any {
        const parsedKeys = Object.keys(parsed);
        const actualIds = tweets.map(t => t.id);
        const hasMatchingIds = parsedKeys.some(k => actualIds.includes(k));

        const isGenericKeys = parsedKeys.some(k =>
            /^(tweet|image|img|图片|推文)[_\s]*\d+$/i.test(k.trim())
        );

        const analysisKeys = parsedKeys.filter(k =>
            !['多图集成', 'overall_summary', 'summary'].includes(k)
        );

        if ((!hasMatchingIds || isGenericKeys) && analysisKeys.length > 0) {
            console.warn('[VisionService] Model returned incorrect/generic IDs. Remapping...');

            const sortedKeys = [...analysisKeys].sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.match(/\d+/)?.[0] || '0');
                return numA - numB;
            });

            const remapped: any = {};

            if (actualIds.length === 1 && sortedKeys.length > 1) {
                // 单个推文多图分析
                const overallSummary = parsed['多图集成'] || parsed['overall_summary'] || '';
                remapped[actualIds[0]] = {
                    overall: overallSummary || '',
                    details: sortedKeys.map(key => parsed[key])
                };
            } else {
                // 多个推文
                sortedKeys.forEach((fakeId, index) => {
                    if (index < actualIds.length) {
                        remapped[actualIds[index]] = parsed[fakeId];
                    }
                });
            }

            return remapped;
        }

        return parsed;
    }

    /**
     * 标准化结果格式
     */
    private static normalizeResults(parsed: any, tweets: Tweet[]): AnalysisResults {
        const normalized: AnalysisResults = {};

        for (const [tweetId, value] of Object.entries(parsed)) {
            let data: any = value;

            // 处理嵌套 JSON 字符串
            if (typeof value === 'string') {
                try {
                    data = JSON.parse(value);
                } catch {
                    data = { overall: value };
                }
            }

            normalized[tweetId] = this.normalizeResultItem(data);
        }

        // 处理特殊情况: tweet_id 作为键名
        if (normalized.tweet_id && tweets.length === 1) {
            const actualId = tweets[0].id;
            normalized[actualId] = normalized.tweet_id;
            delete normalized.tweet_id;
        }

        return normalized;
    }

    /**
     * 标准化单个结果项
     */
    private static normalizeResultItem(data: any): TweetAnalysisResult {
        // 已有标准结构
        if (data.overall !== undefined && Array.isArray(data.details)) {
            return {
                overall: data.overall,
                details: data.details.map(this.normalizeDetail)
            };
        }

        // details 不是数组
        if (data.overall && data.details) {
            return {
                overall: data.overall,
                details: [this.normalizeDetail(data.details)]
            };
        }

        // images 数组格式
        if (Array.isArray(data.images)) {
            const sortedImages = [...data.images].sort((a, b) => (a.index || 0) - (b.index || 0));
            const details = sortedImages.map(this.normalizeDetail);
            return {
                overall: details[0]?.description || '',
                details
            };
        }

        // 图片索引格式
        const imageKeys = Object.keys(data).filter(k => k.startsWith('图片索引'));
        if (imageKeys.length > 0) {
            const details = imageKeys.sort().map(k => this.normalizeDetail(data[k]));
            return {
                overall: details[0]?.description || '',
                details
            };
        }

        // 默认转换
        const detail = this.normalizeDetail(data);
        return {
            overall: detail.description,
            details: [detail]
        };
    }

    /**
     * 标准化单个分析详情
     */
    private static normalizeDetail(item: any): ImageDetail {
        if (typeof item === 'string') {
            return { ocr: '', description: item, categories: ['other'] };
        }

        const desc = item.depth_insight
            || item['深度洞察']
            || item.description
            || item['差异化描述']
            || '';

        const highlights = item.highlights || item['亮点'] || '';

        const ocr = item.ocr
            || item['高精度 OCR']
            || item['OCR']
            || (Array.isArray(item.key_elements) ? item.key_elements.join('\n') : '')
            || '';

        const typeInfo = item.type || item['类型'] || '';
        const categories = parseCategories(typeInfo);

        let fullDesc = desc;
        if (typeInfo) fullDesc = `[${typeInfo}] ${fullDesc}`;
        if (highlights) fullDesc += `\n✨ ${highlights}`;

        return {
            ocr: typeof ocr === 'string' ? ocr : '',
            description: fullDesc,
            categories
        };
    }

    /**
     * 紧急正则恢复
     */
    private static emergencyRegexRecovery(rawContent: string, tweets: Tweet[]): AnalysisResults | null {
        try {
            console.log('[VisionService] Attempting emergency regex recovery...');

            const objectPattern = /"([^"]+)"\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
            const extractedObjects: Array<{ key: string; content: string }> = [];
            let match;

            while ((match = objectPattern.exec(rawContent)) !== null) {
                const key = match[1];
                const content = match[2];
                if (!['集成洞察', '多图集成', 'overall_summary'].includes(key)) {
                    extractedObjects.push({ key, content });
                }
            }

            if (extractedObjects.length === 0) return null;

            const recovered: AnalysisResults = {};

            if (tweets.length === 1 && extractedObjects.length >= 1) {
                // 单推文多图
                const details = extractedObjects.map(obj => this.extractDetailFromContent(obj.content));
                const overallMatch = rawContent.match(/"(?:集成洞察|多图集成|overall_summary)"\s*:\s*"([^"]+)"/);

                recovered[tweets[0].id] = {
                    overall: overallMatch?.[1]?.replace(/\\n/g, '\n') || details[0]?.description || '',
                    details
                };
            } else {
                // 多推文
                extractedObjects.forEach((obj, index) => {
                    if (index < tweets.length) {
                        const detail = this.extractDetailFromContent(obj.content);
                        recovered[tweets[index].id] = {
                            overall: detail.description,
                            details: [detail]
                        };
                    }
                });
            }

            if (Object.keys(recovered).length > 0) {
                console.log('[VisionService] Emergency recovery successful');
                return recovered;
            }

            return null;
        } catch (err) {
            console.error('[VisionService] Emergency recovery failed:', err);
            return null;
        }
    }

    /**
     * 从内容字符串中提取详情
     */
    private static extractDetailFromContent(content: string): ImageDetail {
        const descMatch = content.match(/"(?:深度洞察|差异化描述|description)"\s*:\s*"([^"]+)"/);
        const ocrMatch = content.match(/"(?:高精度 OCR|OCR|ocr)"\s*:\s*"([^"]*)"/);
        const typeMatch = content.match(/"(?:类型|type)"\s*:\s*"([^"]+)"/);

        const desc = descMatch?.[1]?.replace(/\\n/g, '\n') || '';
        const typeInfo = typeMatch?.[1] || '';
        const categories = parseCategories(typeInfo);

        return {
            ocr: ocrMatch?.[1]?.replace(/\\n/g, '\n') || '',
            description: typeInfo ? `[${typeInfo}] ${desc}` : desc,
            categories
        };
    }

    /**
     * 记录解析错误的上下文
     */
    private static logParseError(error: any, rawContent: string): void {
        if (error.message.includes('position')) {
            const posMatch = error.message.match(/position (\d+)/);
            if (posMatch) {
                const pos = parseInt(posMatch[1], 10);
                const start = Math.max(0, pos - 50);
                const end = Math.min(rawContent.length, pos + 50);
                console.warn(`[VisionService] Error near position ${pos}:\n` +
                    rawContent.substring(start, pos) + ' >>>' + rawContent[pos] + '<<< ' +
                    rawContent.substring(pos + 1, end));
            }
        }
    }

    /**
     * 创建 fallback 结果
     */
    private static createFallbackResult(tweets: Tweet[], rawContent: string): AnalysisResults {
        const fallback: AnalysisResults = {};
        tweets.forEach(t => {
            fallback[t.id] = {
                overall: "视觉分析解析失败。原始响应：" + (rawContent?.substring(0, 200) || '无响应'),
                details: []
            };
        });
        return fallback;
    }

    // ==================== 修复功能 ====================

    /**
     * 使用 textAnalysis 模型修复 VLM 解析失败的响应
     */
    private static async repairWithTextModel(
        rawContent: string,
        tweets: Tweet[],
        imageCount: number,
        settings: AISettings
    ): Promise<AnalysisResults | null> {
        try {
            const node = settings.workflowNodes.textAnalysis;
            const { provider, apiKey } = this.resolveProvider(settings, node.providerId);

            if (!provider || !apiKey || !node.model) {
                console.log('[VisionService] Text model not configured, skipping repair');
                return null;
            }

            console.log('[VisionService] 🔧 Attempting to repair VLM response with text model...');

            const tweetInfo = tweets.map(t => `- Tweet ID: ${t.id} (预期有图片)`).join('\n');

            const repairPrompt = `你是一个 JSON 数据修复专家。下面是一个 VLM 视觉模型的原始输出，但格式有问题无法直接解析。
请帮我从中提取有用信息，并转换为标准的 JSON 格式。

## 原始 VLM 输出:
\`\`\`
${rawContent.substring(0, 3000)}
\`\`\`

## 需要提取的推文:
${tweetInfo}

## 要求的输出格式:
返回一个 JSON 对象，键是推文 ID，值包含:
- overall: 图片的整体描述（字符串）
- details: 数组，每个元素是 { ocr: "提取的文字", description: "图片描述", categories: ["类型"] }

categories 可选值: code, architecture, ui_design, chart, portrait, illustration, cosplay, product, screenshot, meme, photo, other

只返回 JSON，不要任何解释或 markdown 标记。如果无法提取有效信息，返回空对象 {}。`;

            const baseUrl = provider.baseUrl.trim().replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: node.model,
                    messages: [
                        { role: 'system', content: '你是一个 JSON 数据修复专家。只返回有效的 JSON，不要任何解释。' },
                        { role: 'user', content: repairPrompt }
                    ],
                    temperature: CONFIG.REPAIR_TEMPERATURE,
                    max_tokens: CONFIG.REPAIR_MAX_TOKENS
                })
            });

            if (!response.ok) {
                console.warn('[VisionService] Text model repair failed:', response.status);
                return null;
            }

            const data = await response.json();
            const repairContent = data.choices?.[0]?.message?.content?.trim();

            if (!repairContent) {
                console.warn('[VisionService] Empty repair response');
                return null;
            }

            console.log('[VisionService] Repair model response:', repairContent.substring(0, 500));

            return this.parseRepairResponse(repairContent);

        } catch (err) {
            console.error('[VisionService] Repair with text model failed:', err);
            return null;
        }
    }

    /**
     * 解析修复响应
     */
    private static parseRepairResponse(content: string): AnalysisResults | null {
        try {
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');

            if (firstBrace === -1 || lastBrace === -1) return null;

            const jsonStr = content.substring(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(jsonStr);

            if (Object.keys(parsed).length === 0) return null;

            const normalized: AnalysisResults = {};

            for (const [tweetId, value] of Object.entries(parsed)) {
                const data = value as any;

                if (data.overall !== undefined || data.details) {
                    normalized[tweetId] = {
                        overall: data.overall || '',
                        details: Array.isArray(data.details)
                            ? data.details.map((d: any) => ({
                                ocr: d.ocr || '',
                                description: d.description || '',
                                categories: Array.isArray(d.categories)
                                    ? d.categories
                                    : parseCategories(d.categories || '')
                            }))
                            : []
                    };
                } else if (typeof data === 'string') {
                    normalized[tweetId] = {
                        overall: data,
                        details: [{ ocr: '', description: data, categories: ['other'] }]
                    };
                }
            }

            if (Object.keys(normalized).length > 0) {
                console.log('%c[VisionService] ✅ Repair successful!', 'color: #4CAF50', normalized);
                return normalized;
            }

            return null;
        } catch (err) {
            console.warn('[VisionService] Failed to parse repaired JSON:', err);
            return null;
        }
    }
}
