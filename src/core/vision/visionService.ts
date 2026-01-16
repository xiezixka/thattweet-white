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
        if (settings.siliconFlowApiKeys && settings.siliconFlowApiKeys.length > 0) {
            apiKeys = settings.siliconFlowApiKeys;
        } else if (settings.imageKeys && settings.imageKeys.trim()) {
            apiKeys = settings.imageKeys.split('\n').map(k => k.trim()).filter(Boolean);
        } else if (settings.apiKey) {
            apiKeys = [settings.apiKey];
        }

        const availableKeys = apiKeys.filter(k => !this.activeKeys.has(k));
        console.log(`[VisionService] Starting queue process. Keys found: ${apiKeys.length}, Available: ${availableKeys.length}`);

        if (availableKeys.length === 0) {
            if (apiKeys.length === 0) console.warn('[VisionService] No API keys found in any field!');
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

        const prompt = `请分析以下提供的一组推文图片。
    
### 推文索引映射：
${tweets.map(t => {
            const indices = mapping.map((m, i) => m.tweetId === t.id ? i : -1).filter(idx => idx !== -1);
            return `- Tweet ID [${t.id}]: 包含图片索引 ${JSON.stringify(indices)}`;
        }).join('\n')}

### 任务要求：
1. 请根据映射关系，分别为每个 Tweet ID 提供分析。
2. 识别并提取图中所有可见文字（OCR）。
3. 用中文简洁描述图片内容。
4. 如果推文有多张图，请在 "overall" 字段给出一个整合这些图片的连贯描述。

### 强制返回格式 (JSON ONLY):
{
  "tweet_id": {
     "overall": "该推文多张图片的整体总结描述",
     "details": [
        { "ocr": "图1提取的文字", "description": "图1的内容描述" },
        { "ocr": "图2提取的文字", "description": "图2的内容描述" }
     ]
  }
}`;


        const model = settings.visionModel || 'Qwen/Qwen2-VL-7B-Instruct';
        // 视觉服务强制使用 SiliconFlow 的 API 地址，不受全局 baseUrl (可能是 OpenRouter) 的影响
        const baseUrl = 'https://api.siliconflow.cn/v1';
        const url = `${baseUrl}/chat/completions`;

        console.log(`[VisionService] Calling VLM API:`, { url, model, images: imageBase64List.length });

        // 构建符合规范的消息数组
        const messages = [
            {
                role: 'system',
                content: '你是一个专业的推文图像分析助手。你必须严格按 JSON 格式返回结果，不包含任何解释或 Markdown 标记。'
            },
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

        try {
            const body: any = {
                model,
                messages,
                stream: false,
                temperature: 0.7,
                max_tokens: 4096
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (response.status === 429 || response.status === 503) return 'BUSY';
            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`[VisionService] API Error ${response.status}:`, errorBody);
                throw new Error(`API error: ${response.status} - ${errorBody}`);
            }

            const data = await response.json();
            const message = data.choices?.[0]?.message;
            const rawContent = message?.content || message?.reasoning_content;

            if (!rawContent) {
                console.error('[VisionService] VLM Response missing content:', data);
                throw new Error('Empty response from VLM');
            }

            // 尝试解析 JSON (更加鲁棒的提取方式)
            try {
                const firstBrace = rawContent.indexOf('{');
                const lastBrace = rawContent.lastIndexOf('}');
                if (firstBrace === -1 || lastBrace === -1) throw new Error('No JSON object found');

                const jsonStr = rawContent.substring(firstBrace, lastBrace + 1);
                return JSON.parse(jsonStr);
            } catch (e: any) {
                console.warn('[VisionService] Failed to parse JSON, raw content length:', rawContent.length);
                throw new Error('VLM JSON parse failed: ' + e.message);
            }

        } catch (err) {
            console.error('[VisionService] VLM Call error:', err);
            throw err;
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
        let apiKeys: string[] = [];
        if (settings.siliconFlowApiKeys?.length > 0) {
            apiKeys = settings.siliconFlowApiKeys;
        } else if (settings.imageKeys?.trim()) {
            apiKeys = settings.imageKeys.split('\n').map(k => k.trim()).filter(Boolean);
        } else if (settings.apiKey) {
            apiKeys = [settings.apiKey];
        }

        if (apiKeys.length === 0) return;

        console.log(`[VisionService] Forcing immediate vision analysis for ${tweetId}`);
        await this.processBatch([tweet], apiKeys[0], settings);
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
    static async fetchAvailableModels(apiKey: string): Promise<Array<{ id: string; type?: string }>> {
        try {
            const response = await fetch('https://api.siliconflow.cn/v1/models', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (!response.ok) {
                console.error('[VisionService] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            const models = data.data || [];

            // 过滤出可能支持视觉的模型（包含 VL, Vision, OCR 等关键词）
            const vlmModels = models.filter((m: any) =>
                /vl|vision|ocr|glm-4v|qwen.*vl/i.test(m.id)
            );

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

        const models = await this.fetchAvailableModels(apiKeys[0]);
        console.table(models);
    }
}
