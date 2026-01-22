/**
 * Prediction Service - 本地启发式推理引擎
 * 
 * 基于 xai-org/x-algorithm (Grok-based) 的逻辑简化复刻。
 * 利用本地 IndexedDB 中的向量、图谱和统计数据，模拟计算推文的潜在爆火概率。
 */

import { db, EmbeddingRecord } from '../storage/db';
import { embeddingService, dequantizeVector, cosineSimilarity } from '../../features/intelligence/services/embeddingService';
import { Tweet, ProcessStatus } from '../../shared/types/tweet';
import { PredictionResult, UserHistorySummary } from './types';
import { llmService } from '../../features/intelligence/services/llmService';

// ================================
// 常量配置 (算法权重)
// ================================
// ================================
// X-Algorithm Heavy Ranker (Enhanced Edition)
// ================================

// 动作权重表 (参考 X 算法 weights.yml)
const ACTION_WEIGHTS = {
    // --- 核心互动 ---
    FAVORITE: 0.5,      // 点赞 (降权，更看重回复)
    REPLY: 1.0,         // 回复 (强社交信号)
    REPOST: 0.8,        // 转发 (强传播信号)

    // --- 消费行为 ---
    CLICK: 0.1,         // 点击
    PHOTO_EXPAND: 0.2,  // 看图
    VIDEO_VIEW: 0.3,    // 看视频
    DWELL: 0.1,         // 停留

    // --- 深度转化 ---
    PROFILE: 0.5,       // 查户口
    FOLLOW: 2.0,        // 关注 (极高权重)
    SHARE: 1.5,         // 私信分享 (极高权重)
    QUOTE: 1.2,         // 引用转发

    // --- 负反馈 (惩罚更细分) ---
    NEGATIVE: -1.0,     // 通用负分 (Offset基准)
    NOT_INTERESTED: -5.0, // 明确不感兴趣
    MUTE: -10.0,        // 屏蔽
    BLOCK: -20.0,       // 拉黑
    REPORT: -50.0       // 举报 (直接死刑)
};

// 负分偏移量 (确保总分非负并有平滑梯度)
const SCORING_OFFSET = 0.5;

const HALF_LIFE_HOURS = 12; // 稍微延长半衰期，让优质深度内容留存更久

export class PredictionService {
    /**
     * 计算单条推文的预测得分
     */
    async predict(tweet: Tweet, userSummary: UserHistorySummary): Promise<PredictionResult> {
        const now = Date.now();

        // 1. 物理层：提取基础信号
        const record = await db.embeddings.get(tweet.id);
        const tweetVector = record ? dequantizeVector(record.vector, record.vectorMin, record.vectorMax) : null;

        let contentSim = 0.25; // Default (Level 3)

        // Level 1: Vector Similarity (精准)
        if (tweetVector && userSummary.centroidVector) {
            contentSim = cosineSimilarity(tweetVector, userSummary.centroidVector);
        }
        // Level 2: Keyword Matching (降级)
        else if (userSummary.topKeywords && userSummary.topKeywords.length > 0) {
            const tweetText = (tweet.text || '').toLowerCase();
            let matchCount = 0;
            for (const keyword of userSummary.topKeywords) {
                if (tweetText.includes(keyword.toLowerCase())) {
                    matchCount++;
                }
            }
            // 简单的 Jaccard 模拟：命中词数 / (总词数 + 命中词数) 的变体
            // 这里为了简单，直接用 命中数 * 0.1 作为相似度，上限 0.8
            contentSim = Math.min(matchCount * 0.15, 0.8);
            if (contentSim < 0.1) contentSim = 0.1; // 惩罚完全不相关的
        }

        const authorAffinity = await this.calculateAuthorAffinity(tweet.authorId);
        const qualityScore = (tweet.aiScore !== undefined) ? (tweet.aiScore / 100) : 0.5;

        // --- NEW: Smart Velocity & Confidence Logic ---
        // 1. Calculate velocity with awareness of data density
        const velocityScore = this.calculateVelocity(tweet, qualityScore);

        // 2. Data Confidence Factor: 
        // How much can we trust the current engagement numbers?
        const history = tweet.metricsHistory || [];
        const ageMs = Date.now() - (new Date(tweet.createdAt).getTime() || tweet.savedAt || Date.now());
        const ageMin = ageMs / (1000 * 60);

        // Confidence grows with scale of time and number of samples
        // If we have > 3 points and > 30 mins, we are very confident in the data trend
        const timeConfidence = Math.min(ageMin / 60, 1.0); // 1 hour for full time confidence
        const sampleConfidence = Math.min(history.length / 5, 1.0); // 5 points for full sample confidence
        const dataConfidence = (timeConfidence * 0.4) + (sampleConfidence * 0.6);

        const timeDecay = this.calculateTimeDecay(tweet.createdAt);

        // 质量与负面信号探测
        const isDisliked = userSummary.dislikedTags?.some(tag => tweet.tags?.includes(tag));
        const isLowQuality = qualityScore < 0.3;

        // 2. 推理层：模拟 19 种动作概率 (Heuristic Probabilities)
        // Adjust weights based on dataConfidence: 
        // If dataConfidence is low, trust ContentSim/Quality more.
        // If dataConfidence is high, trust Velocity (Real Numbers) more.

        // -- 核心互动 --
        const favoriteProb = Math.min(
            (contentSim * (0.6 - dataConfidence * 0.2)) +
            (authorAffinity * 0.3) +
            (qualityScore * (0.4 - dataConfidence * 0.2)) +
            (velocityScore * (dataConfidence * 0.5)),
            1.0
        );

        const replyProb = Math.min(
            authorAffinity * 1.2 +
            (contentSim * 0.3 * (1 - dataConfidence)) +
            (tweet.replyCount > 5 ? 0.2 : 0),
            1.0
        );

        // Repost is a strong viral signal, highly dependent on actual velocity if we have data
        const repostProb = Math.min(
            (velocityScore * (0.4 + dataConfidence * 0.6)) +
            (contentSim * (0.4 * (1 - dataConfidence))),
            1.0
        );

        // -- 消费行为 --
        const hasClickableMedia = tweet.media && tweet.media.length > 0;
        const hasVideo = tweet.media?.some(m => m.type === 'video');
        const textLen = tweet.text?.length || 0;

        const clickProb = 0.1 + (hasClickableMedia ? 0.4 : 0);
        const photoExpandProb = hasClickableMedia ? 0.6 : 0;
        const videoViewProb = hasVideo ? 0.7 : 0;
        const dwellTimeProb = Math.min(textLen / 280, 1.0); // 简单线性模拟

        // -- 深度转化 --
        const profileClickProb = Math.min(authorAffinity * 0.8 + (contentSim * 0.3), 1.0); // 好奇
        const followProb = Math.min((contentSim * 0.6) + (qualityScore * 0.4), 1.0); // 内容征征
        const shareProb = Math.min((repostProb * 0.8) + (favoriteProb * 0.2), 1.0); // 想分享的欲望
        const quoteProb = repostProb * 0.6; // 引用是高阶转发

        // -- 负反馈 --
        const negativeProb = isDisliked ? 0.8 : 0.05;
        const notInterestedProb = (isDisliked || isLowQuality) ? 0.6 : 0.01;
        const muteProb = (isDisliked && authorAffinity < 0.1) ? 0.3 : 0;
        const blockProb = (isDisliked && authorAffinity < 0.1) ? 0.1 : 0;
        const reportProb = 0.0; // 本地暂不模拟举报

        // 3. 计算层：Standard Weighted Scorer

        let scoreSum = 0;

        // 正向加权
        scoreSum += favoriteProb * ACTION_WEIGHTS.FAVORITE;
        scoreSum += replyProb * ACTION_WEIGHTS.REPLY;
        scoreSum += repostProb * ACTION_WEIGHTS.REPOST;

        scoreSum += clickProb * ACTION_WEIGHTS.CLICK;
        scoreSum += photoExpandProb * ACTION_WEIGHTS.PHOTO_EXPAND;
        scoreSum += videoViewProb * ACTION_WEIGHTS.VIDEO_VIEW;
        scoreSum += dwellTimeProb * ACTION_WEIGHTS.DWELL;

        scoreSum += profileClickProb * ACTION_WEIGHTS.PROFILE;
        scoreSum += followProb * ACTION_WEIGHTS.FOLLOW;
        scoreSum += shareProb * ACTION_WEIGHTS.SHARE;
        scoreSum += quoteProb * ACTION_WEIGHTS.QUOTE;

        // 负向加权 (直接减)
        scoreSum += negativeProb * ACTION_WEIGHTS.NEGATIVE;
        scoreSum += notInterestedProb * ACTION_WEIGHTS.NOT_INTERESTED;
        scoreSum += muteProb * ACTION_WEIGHTS.MUTE;
        scoreSum += blockProb * ACTION_WEIGHTS.BLOCK;
        scoreSum += reportProb * ACTION_WEIGHTS.REPORT;

        // X算法核心技巧：Offset Score (平滑处理)
        let finalRawScore = scoreSum;
        if (finalRawScore < 0) {
            finalRawScore = 0;
        }

        // 加上亲密度红利 (社交保底)
        finalRawScore += authorAffinity * 2.5;

        // 时间衰减 (应用 X 的衰减逻辑)
        let finalScore = finalRawScore * timeDecay * 15; // 缩放系数
        const totalScore = Math.min(Math.max(Math.round(finalScore), 0), 100);

        // 4. 生成解释
        const authorName = (typeof tweet.author === 'object')
            ? (tweet.author as any).handle
            : (tweet.authorName || tweet.author || 'unknown');

        const explanation = this.generateExplanation({
            score: totalScore,
            contentSim,
            authorAffinity,
            velocityScore,
            qualityScore,
            authorName
        });

        return {
            tweetId: tweet.id,
            totalScore,
            components: {
                favoriteProb,
                replyProb,
                repostProb,
                clickProb,
                photoExpandProb, // New
                videoViewProb,   // New
                dwellTimeProb,
                profileClickProb,
                followProb,      // New
                shareProb,       // New
                quoteProb,       // New
                negativeProb,
                notInterestedProb, // New
                muteProb,          // New
                blockProb,         // New
                reportProb         // New
            },
            signals: {
                contentSimilarity: contentSim,
                authorAffinity,
                velocityScore,
                qualityScore,
                timeDecay
            },
            explanation,
            analyzedAt: now,
            source: 'local',
            futureEstimates: this.calculateFutureEstimates(tweet, {
                totalScore,
                velocity: velocityScore,
                quality: qualityScore
            })
        };
    }

    /**
     * 根据当前数据与 AI 信号，估算未来增长曲线 (1d, 7d, 30d)
     */
    private calculateFutureEstimates(tweet: Tweet, signals: { totalScore: number, velocity: number, quality: number }) {
        const { totalScore, velocity, quality } = signals;

        // 基础倍率计算 (结合传播速度与质量)
        // 核心直觉：爆发力(Velocity)决定 1d，质量(Quality)决定 7d 和 30d
        const favBase = tweet.favoriteCount || 10;
        const viewBase = tweet.viewCount || favBase * 20;
        const rtBase = tweet.retweetCount || Math.round(favBase * 0.1);
        const replyBase = tweet.replyCount || Math.round(favBase * 0.05);

        // 增长潜力因子 (基于 Score)
        const potential = 1 + (totalScore / 100) * 5; // 0-100 分对应 1-6 倍增长潜力

        const estimate = (days: number, power: number) => {
            // 使用饱和增长模型：Initial + Ceiling * (1 - e^-kt)
            // 这里简化为：Base * (1 + Potential * 衰减函数)
            // 衰减函数取决于 Quality
            const decay = Math.log10(days + 1) / Math.log10(31); // 0-1 的时间进度感
            const growthFactor = 1 + (potential * Math.pow(decay, 1 / (quality + 0.5)));

            return {
                fav: Math.round(favBase * growthFactor),
                view: Math.round(viewBase * (growthFactor * 1.2)), // 观看量通常增长更快
                rt: Math.round(rtBase * growthFactor),
                replies: Math.round(replyBase * growthFactor)
            };
        };

        return {
            '1d': estimate(1, velocity),
            '7d': estimate(7, quality),
            '30d': estimate(30, quality)
        };
    }

    /**
     * 真正的 AI 深度分析 (Deep Dive)
     * 调用 llmService.generateJSON('forecast', ...)
     */
    async aiAnalyze(tweet: Tweet, userSummary: UserHistorySummary): Promise<PredictionResult | null> {
        try {
            // 复用 Batch 逻辑，将其视为单条 batch
            const batchResults = await this.aiAnalyzeBatch([tweet], userSummary);

            // 返回该推文的结果
            if (batchResults[tweet.id]) {
                return batchResults[tweet.id];
            }

            // 如果 AI 返回了结果单 ID 不匹配（罕见情况，可能 AI 幻觉了 ID），
            // 尝试返回第一个 value（因为只需 1 条）
            const keys = Object.keys(batchResults);
            if (keys.length > 0) {
                return batchResults[keys[0]];
            }

            return null;
        } catch (error) {
            console.error('[PredictionService] AI Analyze Failed:', error);
            return null;
        }
    }

    /**
     * AI 批量深度分析 (Batch Deep Dive)
     * 同时分析多条推文，提高 Token 利用率并进行横向对比
     */
    async aiAnalyzeBatch(tweets: Tweet[], userSummary: UserHistorySummary): Promise<Record<string, PredictionResult>> {
        try {
            const settings = await llmService.getSettings();
            if (!settings.workflowNodes.forecast?.enabled) {
                console.warn('[PredictionService] Forecast node is disabled.');
                return {};
            }

            console.log('[PredictionService] Starting Batch Forecast for', tweets.length, 'tweets');

            // 准备变量
            let variables: any = {
                ai_style_focus: settings.aiStyleFocus || 'General Interest'
            };

            if (tweets.length === 1) {
                // 🚀 单推模式：提供更直接的字段，解决 ID 匹配问题
                const t = tweets[0];
                const createdAtTs = typeof t.createdAt === 'string' ? new Date(t.createdAt).getTime() : Number(t.createdAt || Date.now());
                const velocity = this.calculateVelocity(t);
                let trendContext = velocity > 0.8 ? "VIRAL ALERT" : velocity > 0.5 ? "Accelerating" : "Steady";

                variables = {
                    ...variables,
                    author: (typeof t.author === 'object' ? (t.author as any).name : t.authorName) || 'unknown',
                    text: t.text || '',
                    stats: `Lik:${t.favoriteCount},RT:${t.retweetCount},Rep:${t.replyCount},Views:${t.viewCount || 0}`,
                    trend: trendContext,
                    growth_history: JSON.stringify((t.metricsHistory || []).map(h => ({
                        age: `${((h.capturedAt - createdAtTs) / 3600000).toFixed(1)}h`,
                        lik: h.favoriteCount,
                        view: h.viewCount
                    })))
                };
            } else {
                // 批量模式：保留原有的 JSON 数组格式
                const batchInput = tweets.map(t => {
                    const createdAtTs = typeof t.createdAt === 'string' ? new Date(t.createdAt).getTime() : Number(t.createdAt || Date.now());
                    return {
                        id: t.id,
                        author: (typeof t.author === 'object' ? (t.author as any).name : t.authorName) || 'unknown',
                        text: t.text?.substring(0, 300) || '',
                        stats: `L:${t.favoriteCount},V:${t.viewCount}`,
                        trend: this.calculateVelocity(t) > 0.5 ? "Rising" : "Flat",
                        history: t.metricsHistory?.slice(-3).map(h => `${((h.capturedAt - createdAtTs) / 3600000).toFixed(1)}h:${h.favoriteCount}`)
                    };
                });
                variables.tweet_batch_json = JSON.stringify(batchInput, null, 2);
            }

            console.log('[PredictionService] AI INPUT:', variables);
            const aiResponse = await llmService.generateJSON('forecast', variables);
            console.log('[PredictionService] AI OUTPUT:', aiResponse);

            if (!aiResponse) throw new Error('AI returned empty result');

            const resultMap: Record<string, PredictionResult> = {};

            for (const tweet of tweets) {
                // 🔍 智能匹配结果
                let analysis = aiResponse[tweet.id];

                // 单推模式：AI 可能直接返回结果对象，而不是 { id: result } 的格式
                if (!analysis && tweets.length === 1) {
                    // 检查 aiResponse 本身是否就是结果对象（扁平返回）
                    if (aiResponse.totalScore !== undefined || aiResponse.daily_simulation) {
                        analysis = aiResponse; // 直接使用整个响应
                    } else {
                        // 尝试取第一个 value（适用于 AI 用随机 ID 包裹的情况）
                        const keys = Object.keys(aiResponse);
                        if (keys.length > 0) {
                            const firstValue = aiResponse[keys[0]];
                            if (typeof firstValue === 'object' && firstValue !== null) {
                                analysis = firstValue;
                            }
                        }
                    }
                }

                if (analysis && (analysis.totalScore !== undefined || analysis.daily_simulation)) {
                    const prediction: PredictionResult = {
                        tweetId: tweet.id,
                        totalScore: analysis.totalScore || 0,
                        components: {
                            favoriteProb: analysis.probabilities?.like || 0,
                            replyProb: analysis.probabilities?.reply || 0,
                            repostProb: analysis.probabilities?.repost || 0,
                            clickProb: analysis.probabilities?.click || 0,
                            photoExpandProb: 0.5,
                            videoViewProb: 0.5,
                            dwellTimeProb: 0.5,
                            profileClickProb: analysis.probabilities?.profile || 0,
                            followProb: 0.5,
                            shareProb: analysis.probabilities?.share || 0,
                            quoteProb: 0.3,
                            negativeProb: 0.05,
                            notInterestedProb: 0,
                            muteProb: 0,
                            blockProb: 0,
                            reportProb: 0
                        },
                        signals: {
                            contentSimilarity: analysis.signals?.contentSimilarity || 0,
                            authorAffinity: analysis.signals?.authorAffinity || 0,
                            velocityScore: analysis.signals?.velocityScore || 0,
                            qualityScore: analysis.signals?.qualityScore || 0,
                            timeDecay: 1.0
                        },
                        explanation: analysis.explanation || 'AI analysis complete.',
                        analyzedAt: Date.now(),
                        source: 'ai',
                        growthForecast: analysis.growth_forecast ? {
                            next24h: analysis.growth_forecast.next_24h,
                            next7d: analysis.growth_forecast.next_7d,
                            next30d: analysis.growth_forecast.next_30d,
                            verdict: analysis.growth_forecast.verdict
                        } : (analysis.daily_simulation ? {
                            // 从 30 天数组中自动提取关键节点
                            next24h: analysis.daily_simulation[0],
                            next7d: analysis.daily_simulation[6] || analysis.daily_simulation[analysis.daily_simulation.length - 1],
                            next30d: analysis.daily_simulation[29] || analysis.daily_simulation[analysis.daily_simulation.length - 1],
                            verdict: (analysis.totalScore || 0) > 80 ? 'Viral Spike' : (analysis.totalScore || 0) > 50 ? 'Steady Growth' : 'Steady'
                        } : undefined),
                        dailySimulation: analysis.daily_simulation ? analysis.daily_simulation.map((sim: any, idx: number, arr: any[]) => {
                            // 强制实施“单调递增”和“基位保护”逻辑
                            const sanitized = { ...sim };
                            const prev = idx > 0 ? arr[idx - 1] : null;

                            // 1. 基位保护：不得低于采样时的当前值
                            sanitized.views = Math.max(sanitized.views || 0, tweet.viewCount || 0);
                            sanitized.likes = Math.max(sanitized.likes || 0, tweet.favoriteCount || 0);
                            sanitized.retweets = Math.max(sanitized.retweets || 0, tweet.retweetCount || 0);
                            sanitized.replies = Math.max(sanitized.replies || 0, tweet.replyCount || 0);

                            // 2. 连续性保护：Day N 必须 >= Day N-1 (防止 AI 中途数据缩水)
                            if (prev) {
                                sanitized.views = Math.max(sanitized.views || 0, prev.views || 0);
                                sanitized.likes = Math.max(sanitized.likes || 0, prev.likes || 0);
                                sanitized.retweets = Math.max(sanitized.retweets || 0, prev.retweets || 0);
                                sanitized.replies = Math.max(sanitized.replies || 0, prev.replies || 0);
                            }
                            return sanitized;
                        }) : undefined,
                        // Fallback local calc if AI fails to provide forecast
                        futureEstimates: !analysis.growth_forecast ? this.calculateFutureEstimates(tweet, {
                            totalScore: analysis.totalScore || 0,
                            velocity: analysis.signals?.velocityScore || 0,
                            quality: analysis.signals?.qualityScore || 0
                        }) : undefined
                    };

                    resultMap[tweet.id] = prediction;

                    // Persist to DB - Do NOT overwrite aiReason/aiSummary to keep original capture insights
                    db.tweets.update(tweet.id, {
                        prediction: prediction,
                        aiScore: prediction.totalScore, // We can update score to most accurate deep score
                        aiStatus: ProcessStatus.Completed,
                        aiProcessedAt: Date.now()
                    }).catch(console.error);
                };
            }

            return resultMap;

        } catch (error) {
            console.error('[PredictionService] AI Batch Analyze Failed:', error);
            return {};
        }
    }

    /**
     * 生成用户历史摘要 (兴趣中心、高频作者)
     */
    async getUserSummary(limit: number = 32): Promise<UserHistorySummary> {
        // 增加 history_seq_len 到 32，匹配 Phoenix 配置
        const topTweets = await db.tweets
            .where('isBookmarked').equals(1)
            .or('aiScore').above(80)
            .limit(limit)
            .toArray();

        if (topTweets.length === 0) {
            return { centroidVector: null, topAuthors: [], dislikedTags: [], topKeywords: [] };
        }

        // 2. 计算重心向量 (Centroid)
        const vectors: number[][] = [];
        const authorCounts = new Map<string, number>();

        for (const t of topTweets) {
            const emb = await db.embeddings.get(t.id);
            if (emb) {
                vectors.push(dequantizeVector(emb.vector, emb.vectorMin, emb.vectorMax));
            }
            authorCounts.set(t.authorId, (authorCounts.get(t.authorId) || 0) + 1);
        }

        let centroidVector: number[] | null = null;
        if (vectors.length > 0) {
            const dim = vectors[0].length;
            centroidVector = new Array(dim).fill(0);
            for (const v of vectors) {
                for (let i = 0; i < dim; i++) {
                    centroidVector[i] += v[i];
                }
            }
            for (let i = 0; i < dim; i++) {
                centroidVector[i] /= vectors.length;
            }
        }

        // 3. 排序高频作者
        const topAuthors = Array.from(authorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0])
            .slice(0, 5);

        // 4. 提取高频关键词 (简单的分词统计) - 降级策略
        const wordCounts = new Map<string, number>();
        const stopWords = new Set(['the', 'and', 'is', 'in', 'to', 'of', 'a', 'for', 'on', 'with', 'at', 'this', 'that', 'it', 'https', 't.co', 'rt', 'co', 'http', 'but', 'so', 'if', 'or', 'as', 'be', 'are', 'was', 'by', 'an']);

        for (const t of topTweets) {
            if (!t.text) continue;
            // 简单按空格分词，移除标点
            const words = t.text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
            for (const w of words) {
                if (w.length > 3 && !stopWords.has(w)) {
                    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
                }
            }
        }

        const topKeywords = Array.from(wordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0])
            .slice(0, 30); // 取前 30 个高频词

        return {
            centroidVector,
            topAuthors,
            dislikedTags: [],
            topKeywords
        };
    }

    /**
     * 计算作者亲密度 (基于图谱)
     */
    private async calculateAuthorAffinity(authorId: string): Promise<number> {
        // 查找与该作者的所有交互边
        const edges = await db.graphEdges
            .where('target').equals(authorId)
            .filter(edge => edge.type === 'reply' || edge.type === 'retweet' || edge.type === 'author')
            .toArray();

        if (edges.length === 0) return 0.05; // 基础值

        // 累加权重：Reply 权重高于 Retweet
        const totalWeight = edges.reduce((sum, edge) => {
            let w = edge.weight || 1;
            if (edge.type === 'reply') w *= 2;
            return sum + w;
        }, 0);

        return Math.min(Math.log10(totalWeight + 1) / 2, 1.0);
    }

    /**
     * 计算传播速度 (Velocity)
     */
    /**
     * 计算传播速度 (Velocity) - 动态趋势版
     * 结合平均速度与瞬时加速度
     */
    private calculateVelocity(tweet: Tweet, qualityScore: number = 0.5): number {
        const createdDate = new Date(tweet.createdAt);
        const createdTs = isNaN(createdDate.getTime()) ? (tweet.savedAt || Date.now()) : createdDate.getTime();
        const ageMs = Date.now() - createdTs;
        const ageMin = Math.max(ageMs / (1000 * 60), 1);

        // 1. 平均速度 (Average Velocity)
        const engagement = (tweet.favoriteCount || 0) + (tweet.retweetCount || 0) * 3 + (tweet.replyCount || 0) * 2;
        const avgVelocity = engagement / ageMin;

        // 2. 瞬时速度 (Instant Velocity) - 基于 MetricsHistory
        let instantVelocity = 0;

        const history = tweet.metricsHistory || [];
        if (history.length >= 2) {
            // 取最近两个快照
            const last = history[history.length - 1];
            const prev = history[history.length - 2];

            const timeDeltaMin = (last.capturedAt - prev.capturedAt) / (1000 * 60);

            // 过滤采样噪声：如果两次采样间隔过短（< 1.5分钟），瞬时速度不可靠
            if (timeDeltaMin > 1.5) {
                const engLast = last.favoriteCount + last.retweetCount * 3 + last.replyCount * 2;
                const engPrev = prev.favoriteCount + prev.retweetCount * 3 + prev.replyCount * 2;

                // 瞬时速度 (每分钟互动增量)
                instantVelocity = Math.max(0, engLast - engPrev) / timeDeltaMin;
            }
        }

        // 3. 补齐逻辑：理论潜在速度 (Potential Velocity for Cold Start)
        // 如果发布时间很短 (< 30min) 且数据点不多，给予一个基于质量的“爆发潜力”初速度
        let potentialVelocity = 0;
        if (ageMin < 30 && history.length < 3) {
            // 优质内容即使没有数据，也具备更高的初始动能预期
            potentialVelocity = qualityScore * 5;
        }

        // 4. 最终速度取三个维度的加权/最大值
        // 瞬时速度权重最高，平均速度次之，潜在速度作为冷启动保底
        const finalVelocity = Math.max(
            avgVelocity,
            instantVelocity * 1.5,
            potentialVelocity
        );

        // 归一化 (经验值：每分钟10个互动视为极快)
        // 使用 Logistic 函数平滑映射到 0-1
        // x=5 -> 0.5, x=20 -> 0.95
        return this.sigmoid((finalVelocity - 5) * 0.5);
    }

    /**
     * 时间衰减公式
     */
    private calculateTimeDecay(createdAt: string | number): number {
        const createdDate = new Date(createdAt);
        const createdTs = isNaN(createdDate.getTime()) ? Date.now() : createdDate.getTime();
        const ageHours = (Date.now() - createdTs) / (1000 * 60 * 60);

        // 半衰期公式
        let decay = Math.pow(2, -ageHours / HALF_LIFE_HOURS);

        // 24小时后加速降权
        if (ageHours > 72) decay *= 0.1; // 3 天后极速降权

        return decay;
    }

    private sigmoid(x: number): number {
        return 1 / (1 + Math.exp(-x));
    }

    private generateExplanation(data: any): string {
        const { score, contentSim, authorAffinity, velocityScore, authorName } = data;

        let reason = '';
        if (score > 85) reason = '极高级别信号。该推文正处在社交关系与实时爆发力的交汇点。';
        else if (score > 60) reason = '优质内容。与你的近期兴趣高度契合，具备稳健的增长轨迹。';
        else if (score > 30) reason = '常规更新。基于你对作者 @' + authorName + ' 的长期关注。';
        else reason = '弱信号。内容新鲜度或匹配度较低。';

        const signals = [];
        if (contentSim > 0.8) signals.push('语义共鸣');
        if (authorAffinity > 0.6) signals.push('强交互关系');
        if (velocityScore > 0.4) signals.push('爆发前兆');

        return `${reason}${signals.length > 0 ? '\n关键路径：' + signals.join('、') : ''}`;
    }
}

export const predictionService = new PredictionService();
