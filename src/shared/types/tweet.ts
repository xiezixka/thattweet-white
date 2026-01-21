/**
 * 推文相关基础枚举与接口定义
 */

// --- 基础枚举 ---
export enum ProcessStatus {
  Pending = 'pending',       // 等待处理
  Processing = 'processing', // 处理中
  Completed = 'completed',   // 已完成
  Failed = 'failed',         // 失败
  Skipped = 'skipped'        // 跳过 (如无图片)
}

export enum CaptureSource {
  Manual = 'manual',       // 手动点击保存
  AutoScroll = 'auto',     // 自动滚动采集
  Interceptor = 'api',     // 刷网页时 API 自动捕获
  DomScan = 'dom_scan',    // DOM 扫描
  Import = 'import'        // 从外部导入
}

// --- 用户信息表 (UserCache) ---
// 真正实现：一个作者只存一份数据，改名/改头像全局生效
export interface UserCache {
  id: string;               // 对应 Twitter 的 rest_id (数字字符串)
  handle: string;           // @username
  name: string;             // 显示名称
  avatar: string;           // 头像链接
  description?: string;     // 个人简介
  followersCount?: number;  // 粉丝数
  verified?: boolean;       // 是否认证
  updatedAt: number;        // 最后一次更新信息的时间
  aiProfile?: {
    summary: string;        // AI 生成的人物画像文本
    keywords: string[];     // 提取的关键词标签
    sentiment?: string;     // 新增：情绪调性评价
    semantic?: string;      // 新增：深度语义研判
    lastAnalyzedAt: number; // 上次分析的时间戳
    tweetCountAtAnalysis: number; // 上次分析时，该作者存了多少条推文
  }
}

export interface MediaItem {
  type: 'image' | 'video' | 'gif';
  url: string;
  previewUrl?: string;
}

export interface MetricSnapshot {
  capturedAt: number;        // 采集时间戳
  favoriteCount: number;     // 点赞
  retweetCount: number;      // 转发
  replyCount: number;        // 回复
  viewCount: number;         // 浏览
  quoteCount?: number;       // 引用 (可选)
}

// --- 推文核心表 (Tweet) ---
export interface Tweet {
  // --- 基础关联 ---
  id: string;                  // 推文唯一的 rest_id
  authorId: string;            // 关联 UserCache.id (外键)

  // --- 旧版兼容：嵌入式作者信息 ---
  author?: string | UserCache;   // @handle (旧版字段) 或 UserCache 对象
  authorName?: string;         // 显示名称 (旧版字段)
  authorAvatarUrl?: string;    // 头像链接 (旧版字段)

  text: string;                // 推文正文
  tweetUrl: string;            // 推文 URL
  createdAt: string | number;  // 发推时间
  source: CaptureSource;       // 采集来源
  // ...
  savedAt: number;             // 保存时间 (ms)
  isBookmarked: boolean;       // 是否加星收藏
  isArchived: boolean;         // 是否已归档
  tags: string[];              // 用户手动打的标签
  note?: string;               // 用户笔记
  // ...
  favoriteCount: number;       // 点赞数
  retweetCount: number;        // 转发数
  replyCount: number;          // 回复数
  viewCount: number;           // 浏览量

  // --- 媒体内容 ---
  media: MediaItem[];          // 媒体列表

  // --- 关联上下文 ---
  conversationId?: string;     // 会话 ID (用于串联 Thread)
  replyToId?: string;          // 回复的目标推文 ID
  replyToUser?: string;        // 回复的目标用户

  // --- AI 增强数据 ---
  aiScore?: number;            // 智能评分 (0-100)
  aiSummary?: string;          // AI 摘要
  aiReason?: string;           // AI 评价理由 (新)
  aiTags?: string[];           // AI 自动生成的标签
  aiCategory?: string;         // AI 智能分类
  aiStatus: ProcessStatus;     // AI 处理状态
  aiProcessedAt?: number;      // AI 处理完成时间
  prediction?: any;            // 完整的 AI 预测结果对象 (PredictionResult)

  // --- 图像视觉数据 ---
  ocrText?: string;            // 图片中的文字内容 (所有图片合并)
  visionDescription?: string;  // 图片的视觉描述 (整体总结)
  mediaAnalysis?: Array<{      // 每一张图片的单独分析 (按索引对应)
    ocr?: string;
    description?: string;
    categories?: string[];       // 🆕 图片分类 (支持多分类)
  }>;
  imageProcessStatus: ProcessStatus; // 图像处理状态
  imageProcessedAt?: number;   // 图像处理完成时间

  // --- 原始数据快照 ---
  // 存储 LZ-String 压缩后的推文原始 API JSON 字符串
  rawZip?: string;

  // --- 动态趋势数据 (History Tracking) ---
  metricsHistory?: MetricSnapshot[]; // 历史互动数据快照
}

/**
 * 视图层专用的推文对象 (JOIN 模型)
 * 当从存储层读取数据准备展示在 React 列表时，Repository 会自动关联对应的 author 对象。
 */
export type TweetWithUser = Tweet & {
  author: UserCache;
};
