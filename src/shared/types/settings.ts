export type AIProvider = 'siliconflow' | 'deepseek' | 'openai' | 'anthropic' | 'custom';

export interface AISettings {
    // 1. API Configuration (General)
    apiKey: string;
    baseUrl: string;
    model: string;

    // 2. Image Recognition (SiliconFlow Multi-modal)
    imageKeys: string;
    siliconFlowApiKeys: string[]; // 持久化的多 Key 列表
    ocrEnabled: boolean;
    visionEnabled: boolean;
    visionModel: string;
    ocrModel: string;
    visionEnabledAt: number;     // 时间戳：只处理此时间之后的推文
    maxImagesPerTweet: number;
    visionBatchSize: number;     // 单次 API 调用处理的推文数量

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
    promptVision: string;

    // 8. Personal Preference
    aiStyleFocus: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'xiaomi/mimo-v2-flash:free',

    imageKeys: '',
    siliconFlowApiKeys: [],
    ocrEnabled: false,
    visionEnabled: false,
    visionModel: 'vendor/google/siglip-so400b-patch14-384',
    ocrModel: 'vendor/google/siglip-so400b-patch14-384',
    visionEnabledAt: 0,
    maxImagesPerTweet: 4,
    visionBatchSize: 3,

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

    aiStyleFocus: '技术干货、深度见解、实操教程、行业趋势',

    promptVision: `请化身为一名“多维视觉侦察专家 (Visual Intelligence Expert)”。你的任务是接收一组推文关联图片，并根据用户的“核心偏好”提取具有极高情报价值的信息。

[用户核心偏好]
{ai_style_focus}

### 执行指令：
1. **分类研判**：在观察每张图前，先快速判断其类型（如：技术架构、代码片段、数据看板、设计UI、实拍场景、文档截图等）。
2. **差异化描述**：
    - **技术/架构图**：提取流程节点、关键指标、以及元素间的链路关系。
    - **代码/配置**：识别确切的编程语言，提取核心逻辑或关键的配置参数。
    - **数据图表**：不仅描述形状，更要分析出“增长/下降趋势”、“峰值点”及“背后反映的结论”。
    - **UI/平面设计**：分析视觉重心、设计风格、布局亮点，尝试推测其交互意图。
    - **实拍/活动**：捕捉主体人物、正在发生的事件细节、以及环境传递的核心氛围。
3. **高精度 OCR**：完整、准确地提取图中所有关键文字，保持基本的排版逻辑。
4. **多图互联 (Overall)**：如果推文包含多图，请识别其内在联系（如：步骤演示、不同视角、对比关系），并给出一个高度集成的洞察总结。

### 映射关系：
{tweet_mapping}

### 约束条件：
- 必须严格以标准 JSON 格式返回，禁止任何 Markdown 标记或额外解释。
- 内容必须使用中文。
- 描述应当包含“洞察”而非仅仅是“陈述”。

### 强制 JSON 格式：
{
  "tweet_id": {
     "overall": "针对该推文所有图片的深度洞察总结",
     "details": [
        { "ocr": "文字内容", "description": "针对性的深度价值描述" }
     ]
  }
}`,

    promptAnalysis: `请作为一名深耕互联网多年的“信息策展人”，对以下推文进行质量定级。

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
{"id": "{tweet_id}", "score": 数字, "category": "分类", "reason": "基于定级规范和个人偏好的评价理由"}

推文内容：
{tweet_text}
作者：@{author}`,

    promptSummary: `为以下推文及关联图片分析数据（OCR文字/视觉描述）生成一个简洁且信息丰富的摘要（50字以内）。
如果包含图片分析数据，请将其核心信息（如图片传达的关键图表结论或重要文字）融入摘要中，确保摘要涵盖推文的完整意图。

推文内容：
{tweet_text}
作者：@{author}

只返回摘要内容，不要添加任何说明。`
};
