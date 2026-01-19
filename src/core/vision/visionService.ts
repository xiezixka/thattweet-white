import { db } from '../storage/db';
import { Tweet, ProcessStatus, MediaItem } from '../../shared/types/tweet';
import { AISettings, DEFAULT_AI_SETTINGS, getSafeAISettings } from '../../shared/types/settings';
import { parseCategories } from '../../shared/constants/imageCategories';

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
        const node = settings.workflowNodes.perception;
        if (!node.enabled) return;

        // Resolve Config
        const providerId = node.providerId || settings.defaultProviderId;
        const provider = settings.providers.find(p => p.id === providerId);
        if (!provider || !provider.apiKey) return;

        const apiKey = provider.apiKey;
        if (this.activeKeys.has(apiKey)) return;

        console.log(`[VisionService] Starting perception process using provider: ${provider.name}`);

        // 查找待处理的推文 ID (优化版：只拉取 ID)
        const pendingIds = await db.tweets
            .where('imageProcessStatus')
            .equals(ProcessStatus.Pending)
            .limit(100)
            .primaryKeys();

        if (pendingIds.length === 0) return;

        // 加载实体进行筛选 (有图且在启用时间之后)
        const candidates = await db.tweets.bulkGet(pendingIds as string[]);
        const eligibleTweets = (candidates.filter(t => t !== undefined) as any[]).filter(t => {
            if (t.savedAt < settings.visionEnabledAt) return false;
            return t.media?.some((m: any) => m.type === 'image');
        });

        if (eligibleTweets.length === 0) return;

        this.isProcessing = true;
        try {
            // 一次处理一批
            const batchSize = settings.visionBatchSize || 3;
            const tweetsToProcess = eligibleTweets.slice(0, batchSize);

            if (tweetsToProcess.length > 0) {
                // 🚀 立即标记状态
                for (const t of tweetsToProcess) {
                    await db.tweets.update(t.id, { imageProcessStatus: ProcessStatus.Processing });
                }

                await this.processBatch(tweetsToProcess, apiKey, settings);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 处理一批推文 (单一 Key)
     */
    public static async processBatch(tweets: Tweet[], apiKey: string, settings: AISettings) {
        this.activeKeys.add(apiKey);
        const processedTweets: Tweet[] = [];
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

            const MAX_TOTAL_IMAGES = 6; // Most free VLM models limit to 6 images per request

            for (const tweet of tweets) {
                const imageUrls = tweet.media
                    ?.filter(m => m.type === 'image')
                    .slice(0, settings.maxImagesPerTweet || 4)
                    .map(m => m.url) || [];

                // 如果加入这推文的图片会超过 10 张，则停止处理本批次后续推文
                if (allBase64.length + imageUrls.length > MAX_TOTAL_IMAGES) {
                    console.warn(`[VisionService] Batch too large (images: ${allBase64.length + imageUrls.length} > ${MAX_TOTAL_IMAGES}). Truncating batch.`);
                    // 将未处理的推文状态标回 Pending，以便下一次队列处理
                    const remaining = tweets.slice(tweets.indexOf(tweet));
                    for (const rt of remaining) {
                        await db.tweets.update(rt.id, { imageProcessStatus: ProcessStatus.Pending });
                    }
                    break;
                }

                processedTweets.push(tweet);
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
                    // 如果是因为图片拉取全失败导致的 0，且没进入上面的 Truncate
                    if (processedTweets.includes(t)) {
                        await db.tweets.update(t.id, { imageProcessStatus: ProcessStatus.Skipped });
                    }
                }
                return;
            }

            // 3. 构建多模态请求 (只处理 processedTweets)
            const analysisResult = await this.callVLM(allBase64, processedTweets, imageToTweetMap, apiKey, settings);

            if (analysisResult === 'BUSY') {
                this.BUSY_COOLDOWN_UNTIL = Date.now() + 60 * 1000;
                // 重置状态为 Pending 以便重试
                for (const t of processedTweets) {
                    await db.tweets.update(t.id, { imageProcessStatus: ProcessStatus.Pending });
                }
                return;
            }

            // 4. 解析结果并写回数据库
            for (const tweet of processedTweets) {
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
            const targets = processedTweets.length > 0 ? processedTweets : tweets;
            for (const t of targets) {
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

            const node = settings.workflowNodes.perception;
            const prompt = (node.prompt || "")
                .replace(/{ai_style_focus}/g, settings.aiStyleFocus || '')
                .replace(/{tweet_mapping}/g, mappingInfo);

            const model = node.model;
            const providerId = node.providerId || settings.defaultProviderId;
            const provider = settings.providers.find(p => p.id === providerId);

            if (!provider) throw new Error("Provider not found");

            const baseUrl = provider.baseUrl.trim().replace(/\/$/, '');
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${apiKey.trim()}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/RechardLLee/thattweet-vite',
                'X-Title': 'ThatTweet'
            };

            const url = `${baseUrl}/chat/completions`;

            console.log(`[VisionService] Calling VLM API:`, { url, model, images: imageBase64List.length });

            // 构建符合规范的消息数组
            // 对于 OpenRouter，有些模型对 System Message 支持不佳，我们将指令直接放入 User Message
            const messages: any[] = [];

            const systemInstruction = '你是一个专业的推文图像分析助手。你必须严格按 JSON 格式返回结果，不包含任何解释或 Markdown 标记。';

            // Use System Message if provider is NO OpenRouter to play safe, 
            // but OpenAI-compatible usually should support system role
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

            try {
                const body: any = {
                    model,
                    messages,
                    stream: false,
                    temperature: 0.7,
                    max_tokens: 4096
                };

                // Debug: Log request structure (excluding base64 for brevity)
                const debugBody = {
                    ...body,
                    messages: body.messages.map((m: any) => ({
                        role: m.role,
                        content: typeof m.content === 'string'
                            ? m.content.substring(0, 100) + '...'
                            : Array.isArray(m.content)
                                ? m.content.map((c: any) => c.type === 'image_url'
                                    ? { type: 'image_url', image_url: { url: c.image_url?.url?.substring(0, 50) + '... (base64)', detail: c.image_url?.detail } }
                                    : c)
                                : m.content
                    }))
                };
                console.log(`[VisionService] Request Body Structure:`, JSON.stringify(debugBody, null, 2));

                console.log(`[VisionService] Fetching from ${url}...`);
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
                console.log(`[VisionService] Response received. Status: ${response.status}`);

                if (response.status === 429 || response.status === 503) return 'BUSY';
                if (!response.ok) {
                    const errText = await response.text();
                    if (response.status === 404) {
                        throw new Error(`404 - Model Not Found. Please check your model name: ${model}`);
                    }
                    const isOpenRouterPrivacyError = response.status === 403 && errText.includes('data policy');
                    console.error(`[VisionService] API Error ${response.status}:`, errText);
                    throw new Error(`${response.status} ${isOpenRouterPrivacyError ? '- OpenRouter requires "Free model publication" enabled in Settings > Privacy' : errText}`);
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
                    console.error('[VisionService] API returned error in response body:', data.error);
                    const code = data.error.code;
                    const message = data.error.message || '';

                    // Handle retriable errors:
                    // - HTTP codes: 502 (Bad Gateway), 503 (Service Unavailable), 429 (Rate Limit)
                    // - Message patterns: "busy", "Network connection lost", "timeout", "overloaded"
                    const isRetriable =
                        code === 502 ||
                        code === 503 ||
                        code === 429 ||
                        message.toLowerCase().includes('busy') ||
                        message.toLowerCase().includes('network connection') ||
                        message.toLowerCase().includes('timeout') ||
                        message.toLowerCase().includes('overload') ||
                        message.toLowerCase().includes('unavailable');

                    if (isRetriable) {
                        console.warn('[VisionService] Retriable error detected. Returning BUSY for retry later.');
                        return 'BUSY';
                    }
                    throw new Error(`API error: ${message || JSON.stringify(data.error)}`);
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

                    // 🆕 检测多个独立 JSON 对象的情况 (VLM 返回了多个 {...} {...} 而不是 { "id1": {...}, "id2": {...} })
                    // 特征：在 } 后面紧跟着 { 或换行后 {
                    const multiObjectPattern = /\}\s*\n?\s*\{/g;
                    if (multiObjectPattern.test(jsonStr)) {
                        console.log('[VisionService] Detected multiple separate JSON objects, attempting to merge...');

                        // 分割多个对象并解析
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
                                        const obj = JSON.parse(objStr);
                                        objects.push(obj);
                                    } catch (e) {
                                        console.warn('[VisionService] Failed to parse individual object:', objStr.substring(0, 100));
                                    }
                                }
                            }
                        }

                        if (objects.length > 0) {
                            console.log(`[VisionService] Successfully parsed ${objects.length} separate objects`);

                            // 合并为统一格式 - 用 推文ID 或顺序索引作为 key
                            const merged: any = {};
                            objects.forEach((obj, idx) => {
                                // 尝试提取推文 ID (可能在 "推文ID" 字段里)
                                let tweetId = obj['推文ID'] || obj['tweet_id'] || obj['id'];

                                // 清理 ID 格式（移除方括号和引号）
                                if (typeof tweetId === 'string') {
                                    tweetId = tweetId.replace(/[\[\]"]/g, '').trim();
                                }

                                // 如果没有 ID，用传入的实际推文 ID
                                if (!tweetId && idx < tweets.length) {
                                    tweetId = tweets[idx].id;
                                }

                                if (tweetId) {
                                    merged[tweetId] = obj;
                                }
                            });

                            // 替换 jsonStr 为合并后的 JSON
                            jsonStr = JSON.stringify(merged);
                            console.log('[VisionService] Merged objects:', Object.keys(merged));
                        }
                    }

                    // 0. 反转义：某些模型会多余地转义引号 (\" -> ")
                    // 检测特征：如果 JSON 里包含 \" 但不包含正常的 " (除了开头和结尾)
                    if (jsonStr.includes('\\"') && !jsonStr.slice(1, -1).includes('"')) {
                        console.log('[VisionService] Detected double-escaped JSON, unescaping...');
                        jsonStr = jsonStr.replace(/\\"/g, '"');
                    }
                    // 另一种情况：整个内容都是转义的
                    if (jsonStr.startsWith('{') && jsonStr.includes('\\"')) {
                        // 尝试替换所有 \" 为 "，但保护已经正确的结构
                        const testUnescaped = jsonStr.replace(/\\"/g, '"');
                        try {
                            JSON.parse(testUnescaped);
                            jsonStr = testUnescaped;
                            console.log('[VisionService] Unescaped double-escaped quotes successfully');
                        } catch {
                            // 如果反转义后仍然无法解析，保持原样
                        }
                    }

                    // 1. 基础清理：移除常见的 JSON 污染（如 Markdown 代码块标记在内部被误切）
                    // 已经在 substring 处理过了，主要是处理内部内容

                    // 1b. 移除 BOM 和其他不可见字符（可能在 JSON 开头）
                    let cleanedJson = jsonStr.replace(/^\uFEFF/, ''); // Remove BOM
                    cleanedJson = cleanedJson.replace(/^\s+/, ''); // Remove leading whitespace
                    cleanedJson = cleanedJson.trim();

                    // 2. 移除尾随逗号 (Trailing Commas)
                    cleanedJson = cleanedJson.replace(/,\s*([\]}])/g, '$1');

                    // 3. 移除单行/多行注释 (有些模型喜欢在 JSON 里写注释)
                    cleanedJson = cleanedJson.replace(/\/\/.*$/gm, '');
                    cleanedJson = cleanedJson.replace(/\/\*[\s\S]*?\*\//g, '');

                    // 4. 修复字符串内的控制字符 (Bad control character)
                    // 只处理引号内的内容，因为 JSON 结构本身可以有换行符
                    cleanedJson = cleanedJson.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match, content) => {
                        // 替换字符串值内的真实换行符为转义形式
                        let cleaned = content
                            .replace(/\n/g, '\\n')
                            .replace(/\r/g, '\\r')
                            .replace(/\t/g, '\\t')
                            .replace(/[\x00-\x1F]/g, ''); // 移除其他控制字符

                        // 🆕 修复无效转义序列 (如 \g, \H 等) - 把 \x 变成 x（移除反斜杠）
                        // 有效转义: \n, \r, \t, \\, \", \/, \b, \f, \uXXXX
                        cleaned = cleaned.replace(/\\([^nrtbf\\"\/u])/g, '$1');

                        return `"${cleaned}"`;
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

                    // 7. ID 重映射：检查返回的 ID 是否与实际 Tweet ID 匹配
                    // 如果不匹配，按顺序将结果映射到实际的 Tweet ID
                    const parsedKeys = Object.keys(parsed);
                    const actualIds = tweets.map(t => t.id);
                    const hasMatchingIds = parsedKeys.some(k => actualIds.includes(k));

                    // 检测是否使用了通用键名如 "Tweet 1", "Tweet 2", "image1", "Tweet_1" 等
                    const isGenericKeys = parsedKeys.some(k =>
                        /^(tweet|image|img|图片|推文)[_\s]*\d+$/i.test(k.trim())
                    );

                    // 过滤掉特殊键如 "多图集成"
                    const analysisKeys = parsedKeys.filter(k =>
                        !['多图集成', 'overall_summary', 'summary'].includes(k)
                    );

                    if ((!hasMatchingIds || isGenericKeys) && analysisKeys.length > 0) {
                        console.warn('[VisionService] Model returned incorrect/generic IDs. Remapping...');
                        console.log('[VisionService] Analysis keys:', analysisKeys, 'Actual IDs:', actualIds);

                        // 按键名中的数字排序
                        const sortedKeys = [...analysisKeys].sort((a, b) => {
                            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
                            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
                            return numA - numB;
                        });

                        const remapped: any = {};

                        // 特殊情况：如果只有 1 个 Tweet 但有多个分析结果，说明是多图分析
                        // 应该将所有结果合并到这个 Tweet 的 details 数组里
                        if (actualIds.length === 1 && sortedKeys.length > 1) {
                            console.log('[VisionService] Single tweet with multiple image analyses, merging...');
                            const singleTweetId = actualIds[0];

                            // 合并多图集成的总结（如果有）
                            const overallSummary = parsed['多图集成'] || parsed['overall_summary'] || '';

                            remapped[singleTweetId] = {
                                overall: overallSummary || '',
                                details: sortedKeys.map(key => parsed[key])
                            };
                        } else {
                            // 正常情况：多个 Tweet，按顺序映射
                            sortedKeys.forEach((fakeId, index) => {
                                if (index < actualIds.length) {
                                    remapped[actualIds[index]] = parsed[fakeId];
                                }
                            });
                        }
                        parsed = remapped;
                    }

                    // 8. 格式标准化：确保每个结果都有 overall 和 details 结构
                    const normalized: any = {};
                    for (const [tweetId, value] of Object.entries(parsed)) {
                        let data: any = value;

                        // 如果值是字符串（嵌套 JSON），尝试解析
                        if (typeof value === 'string') {
                            try {
                                data = JSON.parse(value);
                            } catch {
                                // 如果解析失败，将原始字符串作为 overall
                                data = { overall: value };
                            }
                        }

                        // 辅助函数：标准化单个分析结果为 {ocr, description, categories} 格式
                        const normalizeDetail = (item: any): { ocr: string; description: string; categories: string[] } => {
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

                            // 🆕 提取分类
                            const categories = parseCategories(typeInfo);

                            // 组合描述：类型 + 描述 + 亮点
                            let fullDesc = desc;
                            if (typeInfo) fullDesc = `[${typeInfo}] ${fullDesc}`;
                            if (highlights) fullDesc += `\n✨ ${highlights}`;

                            return {
                                ocr: typeof ocr === 'string' ? ocr : '',
                                description: fullDesc,
                                categories
                            };
                        };

                        // 标准化结构
                        if (data.overall !== undefined && Array.isArray(data.details)) {
                            // 已经有 overall 和 details 结构，只需标准化 details 内容
                            normalized[tweetId] = {
                                overall: data.overall,
                                details: data.details.map(normalizeDetail)
                            };
                        } else if (data.overall && data.details) {
                            // details 不是数组的情况
                            normalized[tweetId] = {
                                overall: data.overall,
                                details: [normalizeDetail(data.details)]
                            };
                        } else if (Array.isArray(data.images)) {
                            // 🆕 新格式：images 数组
                            // 按 index 排序并标准化
                            const sortedImages = [...data.images].sort((a, b) => (a.index || 0) - (b.index || 0));
                            const details = sortedImages.map(normalizeDetail);
                            const firstDesc = details[0]?.description || '';

                            normalized[tweetId] = {
                                overall: firstDesc,
                                details
                            };
                        } else if (data['图片索引0'] || data['图片索引1'] || Object.keys(data).some(k => k.startsWith('图片索引'))) {
                            // 🆕 处理旧格式的 "图片索引0", "图片索引1" 等
                            const imageKeys = Object.keys(data).filter(k => k.startsWith('图片索引')).sort();
                            const details = imageKeys.map(k => normalizeDetail(data[k]));
                            const firstDesc = details[0]?.description || '';

                            normalized[tweetId] = {
                                overall: firstDesc,
                                details
                            };
                        } else {
                            // 转换为标准格式 - 支持多种字段名（英文和中文）
                            const detail = normalizeDetail(data);

                            normalized[tweetId] = {
                                overall: detail.description,
                                details: [detail]
                            };
                        }
                    }

                    console.log('[VisionService] Normalized result:', normalized);
                    return normalized;
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

                    // 最后的挣扎：更加鲁棒的正则恢复
                    try {
                        console.log('[VisionService] Attempting improved emergency regex recovery...');

                        // 尝试提取所有顶层 JSON 对象，无论键名是什么
                        // 匹配模式: "ANY_KEY": { ... } （非贪婪，匹配到下一个顶层对象的开始）
                        const objectPattern = /"([^"]+)"\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
                        const extractedObjects: Array<{ key: string; content: string }> = [];
                        let objMatch;

                        while ((objMatch = objectPattern.exec(rawContent)) !== null) {
                            const key = objMatch[1];
                            const content = objMatch[2];
                            // 过滤掉明显的特殊键
                            if (!['集成洞察', '多图集成', 'overall_summary'].includes(key)) {
                                extractedObjects.push({ key, content });
                            }
                        }

                        console.log('[VisionService] Extracted objects:', extractedObjects.length, 'for', tweets.length, 'tweets');

                        if (extractedObjects.length > 0) {
                            const recovered: any = {};

                            // 如果只有一个推文但多个分析对象，合并为一个
                            if (tweets.length === 1 && extractedObjects.length >= 1) {
                                const details = extractedObjects.map(obj => {
                                    // 提取中文字段
                                    const descMatch = obj.content.match(/"(?:深度洞察|差异化描述|description)"\s*:\s*"([^"]+)"/);
                                    const ocrMatch = obj.content.match(/"(?:高精度 OCR|OCR|ocr)"\s*:\s*"([^"]*)"/);
                                    const typeMatch = obj.content.match(/"(?:类型|type)"\s*:\s*"([^"]+)"/);

                                    const desc = descMatch?.[1]?.replace(/\\n/g, '\n') || '';
                                    const typeInfo = typeMatch?.[1] || '';
                                    const categories = parseCategories(typeInfo);

                                    return {
                                        ocr: ocrMatch?.[1]?.replace(/\\n/g, '\n') || '',
                                        description: typeInfo ? `[${typeInfo}] ${desc}` : desc,
                                        categories
                                    };
                                });

                                // 尝试提取集成洞察作为 overall
                                const overallMatch = rawContent.match(/"(?:集成洞察|多图集成|overall_summary)"\s*:\s*"([^"]+)"/);

                                recovered[tweets[0].id] = {
                                    overall: overallMatch?.[1]?.replace(/\\n/g, '\n') || details[0]?.description || '',
                                    details
                                };
                            } else {
                                // 多个推文，按顺序映射
                                extractedObjects.forEach((obj, index) => {
                                    if (index < tweets.length) {
                                        const descMatch = obj.content.match(/"(?:深度洞察|差异化描述|description)"\s*:\s*"([^"]+)"/);
                                        const ocrMatch = obj.content.match(/"(?:高精度 OCR|OCR|ocr)"\s*:\s*"([^"]*)"/);
                                        const typeMatch = obj.content.match(/"(?:类型|type)"\s*:\s*"([^"]+)"/);

                                        const desc = descMatch?.[1]?.replace(/\\n/g, '\n') || '';
                                        const typeInfo = typeMatch?.[1] || '';
                                        const categories = parseCategories(typeInfo);

                                        recovered[tweets[index].id] = {
                                            overall: typeInfo ? `[${typeInfo}] ${desc}` : desc,
                                            details: [{
                                                ocr: ocrMatch?.[1]?.replace(/\\n/g, '\n') || '',
                                                description: desc,
                                                categories
                                            }]
                                        };
                                    }
                                });
                            }

                            if (Object.keys(recovered).length > 0) {
                                console.log('[VisionService] Emergency recovery successful:', recovered);
                                return recovered;
                            }
                        }
                    } catch (recoveryError) {
                        console.error('[VisionService] Recovery failed:', recoveryError);
                    }

                    // 🆕 尝试使用 textAnalysis 模型修复
                    console.log('[VisionService] All parsing attempts failed. Trying repair with text model...');
                    const repaired = await this.repairWithTextModel(rawContent, tweets, imageBase64List.length, settings);
                    if (repaired && Object.keys(repaired).length > 0) {
                        return repaired;
                    }

                    // 如果修复也失败了，返回 fallback
                    const fallback: any = {};
                    tweets.forEach(t => {
                        fallback[t.id] = {
                            overall: "视觉分析解析失败。原始响应：" + (rawContent ? rawContent.substring(0, 200) : '无响应'),
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

            console.log(`[VisionService] Fetching image: ${processedUrl.substring(0, 80)}...`);
            const response = await fetch(processedUrl);
            if (!response.ok) {
                console.warn(`[VisionService] Image fetch failed: ${response.status}`);
                return null;
            }
            const blob = await response.blob();
            console.log(`[VisionService] Image blob: type=${blob.type}, size=${blob.size} bytes`);

            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    // Validate the data URI format
                    if (result && result.startsWith('data:')) {
                        const mimeMatch = result.match(/^data:([^;]+);base64,/);
                        if (mimeMatch) {
                            console.log(`[VisionService] Valid data URI: mime=${mimeMatch[1]}, length=${result.length} chars`);
                        } else {
                            console.warn(`[VisionService] Invalid data URI format: ${result.substring(0, 50)}`);
                        }
                        resolve(result);
                    } else {
                        console.warn(`[VisionService] FileReader result is not a data URI`);
                        resolve(null);
                    }
                };
                reader.onerror = () => {
                    console.error(`[VisionService] FileReader error`);
                    resolve(null);
                };
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            console.error(`[VisionService] Image fetch error:`, err);
            return null;
        }
    }

    /**
     * 强制立即处理单个推文的视觉分析
     * 注意：这个方法不检查 enabled 状态，只要配置了 provider 和 model 就可以运行
     * 用于收藏时触发视觉分析
     */
    static async forceProcessTweet(tweetId: string) {
        const settings = await this.getSettings();
        const node = settings.workflowNodes.perception;

        // 不检查 enabled，只要配置了就可以运行

        const tweet = await db.tweets.get(tweetId);
        if (!tweet) return;

        // 检查推文是否有图片
        const hasImages = tweet.media?.some(m => m.type === 'image');
        if (!hasImages) {
            console.log(`[VisionService] Tweet ${tweetId} has no images, skipping vision analysis`);
            return;
        }

        // Resolve Config - 必须有 provider 和 apiKey
        const providerId = node.providerId || settings.defaultProviderId;
        const provider = settings.providers.find(p => p.id === providerId);
        if (!provider || !provider.apiKey) {
            console.log(`[VisionService] No valid provider configured for perception, skipping`);
            return;
        }

        // 检查是否配置了模型
        if (!node.model) {
            console.log(`[VisionService] No model configured for perception, skipping`);
            return;
        }

        console.log(`[VisionService] Forcing immediate perception analysis for ${tweetId}`);
        await this.processBatch([tweet], provider.apiKey, settings);
    }

    private static async getSettings(): Promise<AISettings> {
        return new Promise((resolve) => {
            chrome.storage.local.get(['aiSettings'], (res) => {
                resolve(getSafeAISettings(res.aiSettings));
            });
        });
    }

    /**
     * 🆕 使用 textAnalysis 模型修复 VLM 解析失败的响应
     * 当 VLM 返回的内容格式不对时，调用文本模型帮助提取结构化数据
     */
    private static async repairWithTextModel(
        rawContent: string,
        tweets: Tweet[],
        imageCount: number,
        settings: AISettings
    ): Promise<Record<string, { overall: string; details: Array<{ ocr: string; description: string; categories: string[] }> }> | null> {
        try {
            const node = settings.workflowNodes.textAnalysis;
            const providerId = node.providerId || settings.defaultProviderId;
            const provider = settings.providers.find(p => p.id === providerId);

            if (!provider || !provider.apiKey || !node.model) {
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
                    'Authorization': `Bearer ${provider.apiKey.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: node.model,
                    messages: [
                        { role: 'system', content: '你是一个 JSON 数据修复专家。只返回有效的 JSON，不要任何解释。' },
                        { role: 'user', content: repairPrompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 2048
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

            // 解析修复后的 JSON
            try {
                const firstBrace = repairContent.indexOf('{');
                const lastBrace = repairContent.lastIndexOf('}');

                if (firstBrace === -1 || lastBrace === -1) {
                    console.warn('[VisionService] No JSON found in repair response');
                    return null;
                }

                const jsonStr = repairContent.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(jsonStr);

                if (Object.keys(parsed).length === 0) {
                    console.warn('[VisionService] Repair returned empty object');
                    return null;
                }

                // 标准化结果
                const normalized: Record<string, { overall: string; details: Array<{ ocr: string; description: string; categories: string[] }> }> = {};

                for (const [tweetId, value] of Object.entries(parsed)) {
                    const data = value as any;

                    // 确保有正确的结构
                    if (data.overall !== undefined || data.details) {
                        normalized[tweetId] = {
                            overall: data.overall || '',
                            details: Array.isArray(data.details) ? data.details.map((d: any) => ({
                                ocr: d.ocr || '',
                                description: d.description || '',
                                categories: Array.isArray(d.categories) ? d.categories : parseCategories(d.categories || '')
                            })) : []
                        };
                    } else if (typeof data === 'string') {
                        // 如果值是纯字符串，作为 overall
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
            } catch (parseErr) {
                console.warn('[VisionService] Failed to parse repaired JSON:', parseErr);
                return null;
            }
        } catch (err) {
            console.error('[VisionService] Repair with text model failed:', err);
            return null;
        }
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
        const providerId = settings.workflowNodes.perception.providerId || settings.defaultProviderId;
        const provider = settings.providers.find(p => p.id === providerId);

        if (!provider || !provider.apiKey) {
            console.warn('[VisionService] No API keys configured');
            return;
        }

        const models = await this.fetchAvailableModels(provider.apiKey, provider.provider === 'openrouter' ? 'openrouter' : 'siliconflow');
        console.table(models);
    }

    /**
     * 重置所有图片分析状态，以便重新处理
     * Reset all image analysis status to trigger reprocessing
     * @returns 重置的推文数量
     */
    static async resetAllImageAnalysis(): Promise<number> {
        console.log('[VisionService] Resetting all image analysis status...');

        // 获取所有已完成分析的推文
        const completedTweets = await db.tweets
            .where('imageProcessStatus')
            .anyOf([ProcessStatus.Completed, ProcessStatus.Failed, ProcessStatus.Skipped])
            .filter(t => t.media?.some(m => m.type === 'image'))
            .toArray();

        if (completedTweets.length === 0) {
            console.log('[VisionService] No tweets to reset');
            return 0;
        }

        // 批量更新状态为 Pending
        const resetPromises = completedTweets.map(t =>
            db.tweets.update(t.id, {
                imageProcessStatus: ProcessStatus.Pending,
                // 清空旧的分析数据，以便写入新格式（带 categories）
                mediaAnalysis: undefined,
                visionDescription: undefined,
                ocrText: undefined,
                imageProcessedAt: undefined
            })
        );

        await Promise.all(resetPromises);

        console.log(`[VisionService] Reset ${completedTweets.length} tweets for reprocessing`);
        return completedTweets.length;
    }
}
