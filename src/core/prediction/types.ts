/**
 * Prediction Types - AI 预测功能相关的接口定义
 */

export interface PredictionComponents {
    // --- 核心互动 (Core Interactions) ---
    favoriteProb: number;      // 点赞 (0.75)
    replyProb: number;         // 回复 (2.7) - 核心权重
    repostProb: number;        // 转发 (1.0)

    // --- 消费行为 (Consumption) ---
    clickProb: number;         // 点击/展开 (0.2)
    photoExpandProb: number;   // 图片查看 (0.3) [新增]
    videoViewProb: number;     // 视频观看 (0.8) [新增]
    dwellTimeProb: number;     // 停留时长 (0.1)

    // --- 深度转化 (Conversion) ---
    profileClickProb: number;  // 访问主页 (1.2)
    followProb: number;        // 关注作者 (1.5) [新增]
    shareProb: number;         // 分享推文 (0.5) [新增]

    // --- 负反馈 (Negative Feedback) ---
    negativeProb: number;         // 通用负反馈 (-10.0)
    notInterestedProb: number;    // 不感兴趣 (-5.0) [新增]
    blockProb: number;            // 拉黑 (-15.0) [新增]
    muteProb: number;             // 屏蔽 (-8.0) [新增]
    reportProb: number;           // 举报 (-20.0) [新增]

    // --- 其他 (Misc) ---
    quoteProb: number;            // 引用 (0.9) [新增]
}

export interface PredictionSignals {
    contentSimilarity: number;  // 文本语义相似度 (0-1)
    authorAffinity: number;     // 作者亲密度 (基于图谱交互) (0-1)
    velocityScore: number;      // 实时热度/传播速度 (0-1)
    qualityScore: number;       // AI 质量评分 (0-1)
    timeDecay: number;          // 时间衰减系数 (0-1)
}

export interface PredictionResult {
    tweetId: string;
    totalScore: number;         // 最终得分 (0-100)
    components: PredictionComponents;
    signals: PredictionSignals;
    explanation: string;        // AI 解释文本
    analyzedAt: number;         // 分析时间戳
}

export interface UserHistorySummary {
    centroidVector: number[] | null; // 用户近期的兴趣重心向量
    topAuthors: string[];            // 用户高频互动的作者 ID
    dislikedTags: string[];          // 用户不感兴趣的标签
    topKeywords: string[];           // [新增] 用户高频兴趣关键词 (降级匹配用)
}
