export type AIProvider = 'siliconflow' | 'deepseek' | 'openai' | 'anthropic' | 'custom';

export interface AISettings {
    // 1. API Configuration (General)
    apiKey: string;
    baseUrl: string;
    model: string;

    // 2. Image Recognition
    imageKeys: string; // 一行一个
    ocrEnabled: boolean;
    visionEnabled: boolean;
    maxImagesPerTweet: number;

    // 3. AI Chat (Contemplation)
    chatApiKey: string;
    chatBaseUrl: string;
    chatModel: string;

    // 4. RAG (Embeddings & Retrieval)
    ragEnabled: boolean;
    ragApiKey: string;
    embeddingModel: string;
    embeddingUrl: string;
    rerankerModel: string;
    rerankerUrl: string;

    // 5. Automation & Tags
    autoAnalyze: boolean;
    batchSize: number;
    rateLimitMs: number;
    categories: string[];

    // 6. Backup
    autoBackupEnabled: boolean;
    backupFolderId?: string;
    backupFolderName?: string;

    // 7. Custom Prompts
    promptAnalysis: string;
    promptSummary: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'xiaomi/mimo-v2-flash:free',

    imageKeys: '',
    ocrEnabled: false,
    visionEnabled: false,
    maxImagesPerTweet: 2,

    chatApiKey: '',
    chatBaseUrl: 'https://openrouter.ai/api/v1',
    chatModel: 'xiaomi/mimo-v2-flash:free',

    ragEnabled: false,
    ragApiKey: '',
    embeddingModel: 'BAAI/bge-m3',
    embeddingUrl: 'https://api.siliconflow.cn/v1/embeddings',
    rerankerModel: 'BAAI/bge-reranker-v2-m3',
    rerankerUrl: 'https://api.siliconflow.cn/v1/rerank',

    autoAnalyze: true,
    batchSize: 25,
    rateLimitMs: 1000,
    categories: ['技术', '资讯', '观点', '教程', '工具', '灵感', '娱乐', '其他'],

    autoBackupEnabled: false,

    promptAnalysis: `分析以下推文，返回 JSON 格式评估结果。

评分标准 (1-100)：
- 原创观点：+30分（基础分50）
- 包含数据、代码、实质内容：+25分
- 时效性/新闻性：+20分
- AI生成内容（明显机器痕迹）：-20分
- 纯转发/水贴/无实质内容：-30分

分类选项：技术、资讯、观点、教程、工具、灵感、娱乐、其他

严格按照以下 JSON 格式返回，不要添加任何其他内容：
{"score": 75, "category": "技术", "reason": "简短评价理由"}

推文内容：
{tweet_text}
作者：@{author}`,

    promptSummary: `为以下推文生成简洁摘要（50字以内），提取核心信息。

推文内容：
{tweet_text}
作者：@{author}

只返回摘要内容，不要添加任何其他说明。`
};
