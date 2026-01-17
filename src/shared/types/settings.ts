export type AIProvider = 'siliconflow' | 'deepseek' | 'openai' | 'anthropic' | 'openrouter' | 'custom';

// 基础服务商配置模版 (Static Template)
export interface AIProviderConfig {
    id: AIProvider;
    name: string;
    icon: string; // lucide icon name or image url
    defaultBaseUrl: string;
    models: string[]; // 预设模型列表
    isVisionSupported: boolean;
}

export const PROVIDER_PRESETS: Record<string, AIProviderConfig> = {
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        icon: 'https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/deepseek-color.png',
        defaultBaseUrl: 'https://api.deepseek.com',
        models: ['deepseek-chat', 'deepseek-coder'],
        isVisionSupported: false
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        icon: 'https://openai.com/favicon.ico',
        defaultBaseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        isVisionSupported: true
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        icon: 'https://anthropic.com/favicon.ico',
        defaultBaseUrl: 'https://api.anthropic.com/v1',
        models: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229'],
        isVisionSupported: true
    },
    siliconflow: {
        id: 'siliconflow',
        name: 'SiliconFlow',
        icon: 'https://siliconflow.cn/favicon.ico',
        defaultBaseUrl: 'https://api.siliconflow.cn/v1',
        models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'],
        isVisionSupported: true
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'https://openrouter.ai/favicon.ico',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        models: ['google/gemini-2.0-flash-exp:free', 'mistralai/mistral-7b-instruct:free'],
        isVisionSupported: true
    },
    custom: {
        id: 'custom',
        name: 'Custom',
        icon: '',
        defaultBaseUrl: '',
        models: [],
        isVisionSupported: true
    }
};

// 用户配置的服务商实例 (简化版: 只存 URL + Key)
export interface AIServiceProvider {
    id: string; // UUID
    provider: AIProvider;
    name: string; // 用户自定义名称 "我的 DeepSeek"
    baseUrl: string;
    apiKey: string;

    // 连通性状态
    status: 'idle' | 'checking' | 'connected' | 'error';
    latency?: number; // ms
    lastChecked?: number; // timestamp
    errorMsg?: string;

    // 动态获取的模型列表 (缓存)
    cachedModels?: string[];
    modelsCachedAt?: number;
}

// 工作流节点配置 (每个节点选择 Provider + Model + Prompt)
export interface WorkflowNodeConfig {
    providerId: string; // 指向 AIServiceProvider.id, 空字符串表示使用全局默认
    model: string; // 选中的模型名
    prompt?: string; // 节点特定的系统指令
    enabled?: boolean; // 是否启用此节点
}

export interface AISettings {
    // === 1. 服务商库 (Provider Pool) ===
    providers: AIServiceProvider[];
    defaultProviderId: string; // 全局默认服务商

    // === 2. 工作流节点配置 (Workflow Nodes) ===
    workflowNodes: {
        // -- Input & Perception --
        perception: WorkflowNodeConfig; // 感知层 (视觉 + OCR 文字提取)

        // -- Processing & Analysis --
        textAnalysis: WorkflowNodeConfig; // 语义分析 / 质量定级
        profile: WorkflowNodeConfig; // 用户画像分析

        // -- Interaction --
        chat: WorkflowNodeConfig;    // 沉思对话
        salon: WorkflowNodeConfig;   // 深度沙龙 (Expert)
    };

    // === 3. Automation & System Core ===
    autoAnalyze: boolean;
    batchSize: number;
    rateLimitMs: number;
    categories: string[];
    aiStyleFocus: string;

    // === 4. Backup ===
    autoBackupEnabled: boolean;
    backupFolderId?: string;
    backupFolderName?: string;

    // === 5. RAG (Embeddings & Retrieval) ===
    ragEnabled: boolean;
    ragApiKey: string;
    embeddingModel: string;
    embeddingUrl: string;
    rerankerModel: string;
    rerankerUrl: string;

    // === Legacy & Internal (Minimized) ===
    visionEnabledAt: number;
    maxImagesPerTweet: number;
    visionBatchSize: number;
}

// Backward Compatibility: AIInstance is an alias for AIServiceProvider
export type AIInstance = AIServiceProvider;

// Default Workflow Node Config
const DEFAULT_NODE_CONFIG: WorkflowNodeConfig = {
    providerId: '', // Empty means follow global default
    model: '',
    enabled: true
};

export const DEFAULT_AI_SETTINGS: AISettings = {
    // === 1. 服务商库 Defaults ===
    providers: [],
    defaultProviderId: '',

    // === 2. 工作流节点配置 Defaults ===
    workflowNodes: {
        perception: {
            ...DEFAULT_NODE_CONFIG,
            enabled: false,
            prompt: `请仔细观察这些图片并完成以下任务：

1. **描述内容**：用 2-3 句话准确描述每张图片中你实际看到的内容。如实描述，不要猜测或编造。

2. **提取文字**：如果图片中包含文字，请准确提取出来。如果没有文字，返回空字符串。

3. **图片类型**：判断图片属于什么类型（如：照片、截图、插画、设计图等）。

**输出格式（必须是有效的JSON）**：
{
  "image_1": {
    "type": "图片类型",
    "description": "你看到的具体内容描述",
    "ocr": "提取的文字内容"
  }
}

**重要**：
- 只描述你真正看到的内容，不要编造
- 如果看不清或不确定，请说"无法确定"
- 使用中文回答`
        },
        textAnalysis: {
            ...DEFAULT_NODE_CONFIG,
            prompt: `请作为一名深耕互联网多年的“信息策展人”，对以下推文进行质量定级。

[用户关注偏好]
用户当前最关注：{ai_style_focus}
(请在评估时，将符合上述偏好的内容优先视作高价值资产。)

定级规范：
- S级 (90-100): 能够引发深思的独到见解、极其详尽的干货、或具有不可替代性的原始资源。
- A级 (70-89): 逻辑清晰、信息增量明显、或对特定领域有实际参考作用。
- B级 (40-69): 正常的资讯流通、泛泛而谈的观点、或缺乏深度的日常记录。
- C级 (40以下): 营销垃圾、AI 幻觉内容、纯粹的情绪宣泄或极低密度的水贴。

核心考量点：
1. 这种内容值得用户在三个月后重新翻出来阅读吗？
2. 图片/OCR 提取的内容是否提供了关键的支撑证据或更深层的信息？请务必结合提供的图像分析数据进行综合研判。
3. 内容是“博主深耕的结果”还是“简单的搬运/机器人批量生成”？

分类选项：技术、资讯、观点、教程、工具、灵感、娱乐、其他

严格按照以下 JSON 格式返回，不要添加任何其他内容：
{"id": "{tweet_id}", "score": 数字, "category": "分类", "reason": "评价理由"}`
        },
        profile: {
            ...DEFAULT_NODE_CONFIG,
            prompt: `Role: You are a Master Social Media Profiler & Psychologist.
Task: Construct a sharp, high-resolution psychological portrait of the author based on their Twitter/X feed.

[DATA SOURCE]
Analysis based on {count} top tweets:
{context}

[ANALYSIS DIMENSIONS]
1. **Cognitive Architecture**: Are they a strategic thinker (macro), a tactical executor (micro), or a connector? How do they construct logic?
2. **Hidden Motivations**: Why do they tweet? (Status seeking, Altruism, Venting, Community building?)
3. **Persona Texture**: The unique "flavor" of their digital presence (e.g., Cynical Rationalist, Warm Evangelist, Anxious Overachiever).

[OUTPUT REQUIREMENTS]
1. **Summary (Deep Insight)**: 80-120 words. CUT THE FLUFF. Do not say "This user focuses on...". Instead, define their essence. Example: "A ruthless pragmatist who dissects industry hype with surgical precision. Their content is driven by a desire to democratize knowledge..."
2. **Keywords (Archetypes)**: 3-5 sharp tags defining their persona (e.g., #DigitalStoic, #GrowthHacker, #GentleMentor).
3. **Sentiment (Emotional Baseline)**: Describe their emotional temperature and stance (e.g., "Calm but authoritative," "Manic and creative").
4. **Semantic (Intellectual Structure)**: Analyze the depth and consistency of their thought framworks.

[CONSTRAINT]
- Language: Professional, Sophisticated Chinese (Simplified).
- Tone: Clinical, Insightful, Direct.

[FORMAT]
Return ONLY a valid JSON object:
{
  "summary": "...",
  "keywords": ["tag1", "tag2", "tag3"],
  "sentiment": "...",
  "semantic": "..."
}`
        },
        chat: { ...DEFAULT_NODE_CONFIG },
        salon: { ...DEFAULT_NODE_CONFIG }
    },

    autoAnalyze: true,
    batchSize: 25,
    rateLimitMs: 1000,
    categories: ['技术', '资讯', '观点', '教程', '工具', '灵感', '娱乐', '其他'],
    aiStyleFocus: '技术干货、深度见解、实操教程、行业趋势',

    ragEnabled: false,
    ragApiKey: '',
    embeddingModel: 'BAAI/bge-m3',
    embeddingUrl: 'https://api.siliconflow.cn/v1/embeddings',
    rerankerModel: 'BAAI/bge-reranker-v2-m3',
    rerankerUrl: 'https://api.siliconflow.cn/v1/rerank',

    autoBackupEnabled: false,
    visionEnabledAt: 0,
    maxImagesPerTweet: 4,
    visionBatchSize: 3
};

/**
 * 确保配置对象结构完整 (Safe Merge)
 */
export function getSafeAISettings(loaded: any): AISettings {
    if (!loaded) return DEFAULT_AI_SETTINGS;

    const settings = { ...DEFAULT_AI_SETTINGS, ...loaded };

    // 深层合并工作流节点
    settings.workflowNodes = {
        ...DEFAULT_AI_SETTINGS.workflowNodes,
        ...(loaded.workflowNodes || {})
    };

    // 确保 providers 是数组
    if (!Array.isArray(settings.providers)) {
        settings.providers = [];
    }

    return settings as AISettings;
}
