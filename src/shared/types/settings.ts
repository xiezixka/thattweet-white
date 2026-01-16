export type AIProvider = 'siliconflow' | 'deepseek' | 'openai' | 'anthropic' | 'custom';

export interface AISettings {
    // 1. API Configuration (General)
    apiKey: string;
    baseUrl: string;
    model: string;

    // 2. Image Recognition (Multi-modal)
    visionProvider: 'siliconflow' | 'openrouter';
    imageKeys: string;
    siliconFlowApiKeys: string[]; // 持久化的多 Key 列表
    visionApiKeyOpenRouter: string;
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

    // 3.1 Profile AI (Independent)
    profileApiKey: string;
    profileBaseUrl: string;
    profileModel: string;

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
    promptProfile: string;

    // 8. Personal Preference
    aiStyleFocus: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'xiaomi/mimo-v2-flash:free',

    visionProvider: 'siliconflow',
    imageKeys: '',
    siliconFlowApiKeys: [],
    visionApiKeyOpenRouter: '',
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

    // New: Profile AI (Dedicated)
    profileApiKey: '',
    profileBaseUrl: 'https://openrouter.ai/api/v1',
    profileModel: 'mistralai/mistral-7b-instruct:free',

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
1. **分类研判**：在观察每张图前，先快速判断其类型（如：技术架构图、代码截图、数据看板、设计 UI、实景照片、文档扫描等）。
2. **差异化描述**：
    - **技术/架构图**：提取逻辑路径、核心组件、指标说明及它们之间的依赖关系。
    - **代码/配置**：精准识别语言与框架，浓缩功能逻辑，提取关键的 API 或配置参数。
    - **数据图表**：分析趋势（上升/平稳/波动）、峰值点及数据背后反映的业务洞察。
    - **UI/平面设计**：解析视觉重心、设计规范、交互意图及亮点。
    - **实拍/活动**：捕捉人物行为、现场关键细节及传递的核心情报。
3. **高精度 OCR**：准确提取图中所有文本，保留自然的排版逻辑。
4. **多图集成 (Overall)**：若推文有多图，请识别其逻辑联系（对比、步骤、细节放大等），给出高度集成的洞察总结。

### 映射关系：
{tweet_mapping}

### 约束条件 (极其重要)：
- 必须严格以标准 JSON 格式返回。
- ！！关键：JSON 的键名必须是上述映射关系中提供的具体【Tweet ID】，禁止直接使用 "tweet_id" 作为键名！！
- ！！注意：如果 OCR 或描述中包含双引号，请务必使用 \\\" 进行转义，确保 JSON 可解析！！
- 内容必须使用中文。
- 描述应当包含“深度洞察”而非仅仅是“画面陈述”。

### 正确的输出示例：
{
  "1234567890123456789": {
     "overall": "针对该推文所有图片的深度洞察总结",
     "details": [
        { "ocr": "文字内容", "description": "深度价值描述" }
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

只返回摘要内容，不要添加任何说明。`,

    promptProfile: `Role: You are an advanced social media anthropologist and psychologist.
Task: Deeply analyze the following {count} high-impact tweets to construct a precise multidimensional psychological portrait of the author.

[RAW DATA - TOP TWEETS]
{context}

[ANALYSIS FRAMEWORK]
Please decode the author based on details:
1. **Cognitive Pattern**: How do they process information? (e.g., Analytical, Intuitive, Empirical, Emotional)
2. **Value System**: What do they value? (e.g., Innovation, Tradition, aesthetics, efficiency, social justice)
3. **Expression Style**: Tone (Witty, Academic, Cynical, Warm), Lexicon (Professional jargon, Slang, Poetry).

[OUTPUT REQUIREMENTS]
1. **Summary (100-150 words)**: Don't just list topics. Synthesize a coherent narrative about WHO this person is. Describe their digital persona vividly. Use analogies if helpful.
2. **Keywords (3-5)**: Create definitive, high-level archetype tags. Avoid generic tags like "Tech". Use specific ones like "SaaS Philosopher", "AI Accelerationist", "Design Purist".
3. **Language**: Output MUST be in Chinese (Simplified).

[FORMAT]
Return ONLY a valid JSON object:
{
  "summary": "...",
  "keywords": ["tag1", "tag2", "tag3"]
}`
};
