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
        const velocityScore = this.calculateVelocity(tweet);
        const timeDecay = this.calculateTimeDecay(tweet.createdAt);

        // 质量与负面信号探测
        const qualityScore = (tweet.aiScore !== undefined) ? (tweet.aiScore / 100) : 0.5;
        const isDisliked = userSummary.dislikedTags?.some(tag => tweet.tags?.includes(tag));
        const isLowQuality = qualityScore < 0.3;

        // 2. 推理层：模拟 19 种动作概率 (Heuristic Probabilities)

        const hasClickableMedia = tweet.media && tweet.media.length > 0;
        const hasVideo = tweet.media?.some(m => m.type === 'video');
        const textLen = tweet.text?.length || 0;

        // -- 核心互动 --
        const favoriteProb = Math.min((contentSim * 0.5) + (authorAffinity * 0.4) + (qualityScore * 0.1), 1.0);
        const replyProb = Math.min(authorAffinity * 1.5 + (tweet.replyCount > 5 ? 0.2 : 0), 1.0);
        const repostProb = Math.min(velocityScore * 1.5 + (contentSim * 0.3), 1.0);

        // -- 消费行为 --
        const clickProb = 0.1 + (hasClickableMedia ? 0.4 : 0);
        const photoExpandProb = hasClickableMedia ? 0.6 : 0;
        const videoViewProb = hasVideo ? 0.7 : 0;
        const dwellTimeProb = Math.min(textLen / 280, 1.0); // 简单线性模拟

        // -- 深度转化 --
        const profileClickProb = Math.min(authorAffinity * 0.8 + (contentSim * 0.3), 1.0); // 好奇
        const followProb = Math.min((contentSim * 0.6) + (qualityScore * 0.4), 1.0); // 内容征服
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
        // 这里的逻辑是：如果总分很低（全是负反馈），也不要让它变成负无穷，而是映射到一个低分区间
        let finalRawScore = scoreSum;
        if (finalRawScore < 0) {
            finalRawScore = 0; // 简单截断，或者用 sigmoid 映射
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
            source: 'local'
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

            // 简化输入以节省 Token (Enriched with Dynamic Context)
            const batchInput = tweets.map(t => {
                // Calculate trend description
                let trendContext = "Normal growth.";
                const velocity = this.calculateVelocity(t); // Re-use the smart velocity logic
                if (velocity > 0.8) trendContext = "VIRAL ALERT: Extremely high engagement velocity.";
                else if (velocity > 0.5) trendContext = "Accelerating: Engagement is picking up speed.";
                else if (t.createdAt && (Date.now() - new Date(t.createdAt).getTime() > 1000 * 60 * 60 * 24 * 30) && velocity > 0.2) {
                    trendContext = "Resurrected: Old tweet suddenly gaining new traction.";
                }

                // Append Visual Context
                const visionContext = t.visionDescription ? `[Visual Content: ${t.visionDescription.substring(0, 100)}...]` : "";

                return {
                    id: t.id,
                    author: (typeof t.author === 'object' ? (t.author as any).name : t.authorName) || 'unknown',
                    text: t.text ? t.text.substring(0, 500) : '',
                    stats: `Lik:${t.favoriteCount},RT:${t.retweetCount},Rep:${t.replyCount}`,
                    trend: trendContext,
                    vision: visionContext, // New Field
                    media: t.media?.map(m => m.type).join(',') || 'none'
                };
            });

            const variables = {
                tweet_batch_json: JSON.stringify(batchInput, null, 2),
                ai_style_focus: settings.aiStyleFocus || 'General Interest'
            };

            console.log('[PredictionService] BATCH INPUT:', JSON.stringify(variables, null, 2));

            const aiResponse = await llmService.generateJSON('forecast', variables);

            console.log('[PredictionService] BATCH OUTPUT:', aiResponse);

            if (!aiResponse) {
                throw new Error('AI returned empty result');
            }

            const resultMap: Record<string, PredictionResult> = {};

            for (const tweet of tweets) {
                const analysis = aiResponse[tweet.id];
                if (analysis) {
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
                        source: 'ai'
                    };

                    resultMap[tweet.id] = prediction;

                    // Persist to DB
                    db.tweets.update(tweet.id, {
                        aiScore: prediction.totalScore,
                        aiReason: prediction.explanation,
                        aiSummary: prediction.explanation,
                        prediction: prediction,
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
    private calculateVelocity(tweet: Tweet): number {
        const createdDate = new Date(tweet.createdAt);
        const createdTs = isNaN(createdDate.getTime()) ? (tweet.savedAt || Date.now()) : createdDate.getTime();
        const ageMs = Date.now() - createdTs;
        const ageMin = Math.max(ageMs / (1000 * 60), 1);

        // 1. 平均速度 (Average Velocity)
        const engagement = (tweet.favoriteCount || 0) + (tweet.retweetCount || 0) * 3 + (tweet.replyCount || 0) * 2;
        const avgVelocity = engagement / ageMin;

        // 2. 瞬时速度 (Instant Velocity) - 基于 MetricsHistory
        let instantVelocity = 0;
        let acceleration = 0; // 加速度

        if (tweet.metricsHistory && tweet.metricsHistory.length >= 2) {
            // 取最近两个快照
            const last = tweet.metricsHistory[tweet.metricsHistory.length - 1];
            const prev = tweet.metricsHistory[tweet.metricsHistory.length - 2];

            const timeDeltaMin = (last.capturedAt - prev.capturedAt) / (1000 * 60);

            if (timeDeltaMin > 0) {
                const engLast = last.favoriteCount + last.retweetCount * 3 + last.replyCount * 2;
                const engPrev = prev.favoriteCount + prev.retweetCount * 3 + prev.replyCount * 2;

                // 瞬时速度 (每分钟互动增量)
                instantVelocity = Math.max(0, engLast - engPrev) / timeDeltaMin;
            }
        }

        // 3. 最终速度取两个维度的最高值 (捕捉"虽老但火"的情况)
        // 瞬时速度给予更高权重，因为它是当下正在发生的事实
        const finalVelocity = Math.max(avgVelocity, instantVelocity * 2);

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
