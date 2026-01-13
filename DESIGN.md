# ThatTweet Refactor - 架构设计文档 (DESIGN.md)

本文件定义了 **ThatTweet** 插件的重构核心设计准则、数据模型、项目结构及功能拆分方法。

---

## 1. 项目愿景 (Overview)
打造一个**高性能、隐私优先、AI 驱动**的推文采集与管理助手。通过本地存储 (IndexedDB) 和本地/云端 AI 能力，实现推文的自动化采集、智能评分、语义检索和日报生成。

---

## 2. 技术栈 (Tech Stack)
*   **构建工具**: Vite + `@crxjs/vite-plugin` (HMR 驱动，极致开发体验)
*   **前端框架**: React 19 + TypeScript
*   **样式方案**: Tailwind CSS v4 (原生 Vite 插件，极速编译)
*   **本地数据库**: Dexie.js (封装 IndexedDB，处理大数据量)
*   **数据压缩**: LZ-String (压缩原始数据快照，节省空间)
*   **状态管理**: Zustand (轻量级、跨组件状态共享)
*   **动画库**: Framer Motion (玻璃拟态 UI 与平滑过渡)

---

## 3. 目录架构规划 (Project Structure)

采用“入口-实现-核心”三层分离架构，既满足 Vite 模板的构建约定，又实现业务逻辑的高内聚低耦合。

```text
src/
├── pages/                    # 【Vite 入口层】构建起点，符合模板约定
│   ├── options/             # 管理后台入口 (index.html, index.tsx)
│   ├── popup/               # 快捷弹窗入口 (index.html, index.tsx)
│   ├── background/          # Service Worker 入口 (index.ts)
│   └── content/             # 内容注入入口 (index.tsx)
│
├── app/                      # 【UI 实现层】具体的视图实现
│   ├── options/             # Options 页面的逻辑视图 (Dashboard, Tabs)
│   ├── popup/               # Popup 页面的逻辑视图
│   ├── components/          # 全局公用组件 (TweetCard, ChatWindow, GlassCard)
│   ├── hooks/               # UI 交互/展示相关的 Hooks (useTheme, useList)
│   └── styles/              # 定义 Tailwind 4 变量与全局样式
│
├── core/                     # 【业务核心层】纯逻辑与核心引擎 (无 UI)
│   ├── storage/             # 数据持久化策略：Dexie 初始化、Repository 模式实现
│   ├── ai/                  # AI 处理流：队列管理 (Queue)、Prompt 模板、RAG 引擎
│   ├── analysis/            # 数据分析引擎：统计报表、热度算法
│   └── extractor/           # 采集引擎：DOM 解析逻辑、API 响应处理 (环境解耦)
│
├── shared/                   # 【公共资源层】全局共享定义
│   ├── types/               # 强类型定义 (Tweet, User, Message)
│   ├── constants/           # 存储键名、API 终端、错误码
│   └── utils/               # 纯工具函数 (LZ 压缩、日期格式化、日志封装)
│
└── assets/                   # 【静态资源】
    └── icons/               # 插件图标、状态图标
```

---

### 分层逻辑说明：
1.  **`src/pages` (环境入口)**: 仅负责简单的初始化（如 `ReactDOM.render`）和环境热链接。它不包含具体的业务逻辑，方便未来更换构建工具。
2.  **`src/app` (表现层)**: 所有的 React 组件都在这里。它依赖 `core` 提供的服务，但不关心数据是如何存储的。
3.  **`src/core` (逻辑层)**: 系统的“心脏”。这一层可以不依赖任何框架运行（甚至可以在 Node.js 或单元测试中运行）。
4.  **`extractor` 归入 `core`**: 采集逻辑被抽象为独立的 Engine。Content Script 只是它的载体，负责将网页环境注入给 Engine 进行处理。

---

## 4. 数据定义 (Data Schema)

### 4.1 关系模型设计
为了保证数据一致性（如作者改名后历史推文同步更新），采用分表设计。

### 4.2 核心接口定义 (TypeScript Interfaces)

```typescript
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
}

export interface MediaItem {
  type: 'image' | 'video' | 'gif';
  url: string;
  previewUrl?: string;
}

// --- 推文核心表 (Tweet) ---
export interface Tweet {
  // --- 基础关联 ---
  id: string;                  // 推文唯一的 rest_id
  authorId: string;            // 关联 UserCache.id (外键)
  text: string;                // 推文正文
  tweetUrl: string;            // 推文 URL
  createdAt: string | number;  // 发推时间
  source: CaptureSource;       // 采集来源

  // --- 个人管理 ---
  savedAt: number;             // 保存时间 (ms)
  isBookmarked: boolean;       // 是否加星收藏
  isArchived: boolean;         // 是否已归档
  tags: string[];              // 用户手动打的标签
  note?: string;               // 用户笔记

  // --- 互动统计 ---
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
  aiTags?: string[];           // AI 自动生成的标签
  aiCategory?: string;         // AI 智能分类 (技术, 资讯, 生活等)
  aiStatus: ProcessStatus;     // AI 处理状态
  aiProcessedAt?: number;      // AI 处理完成时间

  // --- 图像视觉数据 ---
  ocrText?: string;            // 图片中的文字内容
  visionDescription?: string;  // 图片的视觉描述
  imageProcessStatus: ProcessStatus; // 图像处理状态
  imageProcessedAt?: number;   // 图像处理完成时间

  // --- 原始数据快照 ---
  // 存储 LZ-String 压缩后的推文原始 API JSON 字符串
  rawZip?: string;             
}
```

---

## 5. 设计准则 (Design Principles)
1.  **不污染原网页**: 注入的 CSS 必须带命名空间，避免破坏 X 的布局。
2.  **异步优先**: 所有重量级任务（AI、分析、大数据写入）必须在 `background` 异步执行。
3.  **优雅降级**: AI 挂了不能影响基础浏览，网络断了采集数据先存在本地队列。
4.  **极致视觉**: 保持玻璃拟态风格，所有交互必须有动效反馈。

---

## 6. 存储层实现详情 (Storage Implementation)

### 6.1 Repository 模式
为了屏蔽底层 IndexedDB 的复杂性，系统采用 Repository 模式。所有数据操作统一通过 `TweetRepository` 进行，实现以下核心逻辑：
*   **事务性写入**: 推文与作者信息的更新被包裹在同一个数据库事务中，确保数据的一致性。
*   **自动压缩**: 原始 API 响应在存入 `rawZip` 字段前，自动使用 `LZ-String (UTF16)` 进行压缩。
*   **视图关联 (Auto-Join)**: 查询推文时，Repository 负责自动关联 `UserCache` 表，返回完整的 `TweetWithUser` 对象。

### 6.2 索引设计
为了支撑高性能的筛选和统计，我们在 `db.ts` 中定义了以下关键索引：
*   `savedAt`: 支撑推文列表的时间倒序展示。
*   `aiStatus`: 支撑 AI 处理队列的实时筛选，无需全量扫描。
*   `*tags`: 多值索引，支持用户对推文标签的极速搜索。
---

## 7. 采集核心实现 (Data Extraction - The Interceptor)

### 7.1 三脚本协作数据流
系统采用“MAIN World 注入 -> ISOLATED World 转发 -> Background 持久化”的链路，确保在不破坏原网站安全性的前提下捕获完整数据。

1.  **Injected Script (MAIN World)**:
    *   **拦截层**: 重写 `window.fetch` 和 `XMLHttpRequest.prototype.send`。
    *   **解析层**: 拦截到请求后，通过 `response.clone().text()` 读取流，调用 `Normalizer` 进行递归扫描。
    *   **传输层**: 使用 `window.dispatchEvent(new CustomEvent('thattweet-tweet-data'))` 将结果抛出。
2.  **Content Script (ISOLATED World)**:
    *   **注入驱动**: 页面加载后动态插入 `<script type="module">` 加载构建好的 `injected.js`。
    *   **事件监听**: 捕获 `thattweet-tweet-data` 事件。
    *   **消息中转**: 使用 `chrome.runtime.sendMessage` 将数据打回插件后台。
3.  **Background Service Worker**:
    *   **入库中心**: 接收批量推文，调用 `TweetRepository.saveTweet` 开启事务写入。
    *   **任务触发**: 写入成功后，将推文 ID 压入 AI 处理队列。

### 7.2 解析策略与经验图谱 (Normalization Strategy)
基于对 X/Twitter GraphQL 结构的深度调研，`Normalizer` 实现了以下高级逻辑：
*   **多路径自动探测**: 涵盖 `TweetWithVisibilityResults`、`tweet_results.result` 以及传统的 `legacy` 层级。
*   **长推文 (Notes) 自动补完**: 优先扫描 `note_tweet_results` 路径，解决普通 `full_text` 字段会被截断的问题。
*   **富媒体降噪**: 
    *   **图片**: 自动移除 `_normal` 后缀并购建 `?format=jpg&name=large` 链接获取原图。
    *   **视频**: 自动对比所有 `video_info.variants` 的码率 (Bitrate)，确保抓取最高清的版本。
*   **作者信息去重**: 全量扫描 `user_results`，确保作者的头像、粉丝数等信息在 `UserCache` 中保持单例且最新。

---

## 8. AI 处理框架 (AI Processing Framework)

系统设计了一套异步、插件化的 AI 处理链路，支持多服务商切换与结构化数据生产。

### 8.1 多服务商适配器 (Adapter Pattern)
为了解决不同 AI 提供商（SiliconFlow, DeepSeek, OpenAI）接口细微差异及环境兼容性，系统采用了**适配器模式**：
*   **统一接口**: 定义 `AIProviderAdapter`，规定所有适配器必须实现 `analyze()` 方法并返回标准化的 `AIAnalysisResult` 对象。
*   **原生 Fetch 驱动**: 考虑到 Chrome 扩展 Service Worker 复杂的 CSP 限制，底层放弃了第三方 SDK，改用原生 `fetch` 实现直连，确保了极高的网络稳定性。
*   **协议通吃**: 通过 `OpenAIAdapter` 实现了对所有兼容 OpenAI 格式的服务商（如硅基流动、DeepSeek 官方）的统一支持。

### 8.2 智能队列管理 (Queue Strategy)
AI 分析是一个伴随网络波动的“慢任务”，系统通过 `AIJobQueue` 实现自动化调度：
1.  **分批扫描**: 每次从 IndexedDB 中取出 N 条 `aiStatus === 'pending'` 的推文进行批处理。
2.  **视觉依赖感知**: 
    - 如果启用了 OCR 或视觉模型，AI 总结任务将自动“挂起”，直到图像处理流水线完成并写回 `visionDescription` 或 `ocrText`。
    - 这确保了 AI “看到”图片后，生成的总结更加精准。
3.  **限速与重试**: 
    - **互斥锁**: `isProcessing` 状态位防止后台任务由于间隔太短而堆叠引发浏览器卡顿。
    - **指数退避**: 任务失败后进入重试周期，防止瞬时触发 API 频率限制。

### 8.3 AI 即 API (Structured Data Strategy)
系统核心目标是产生“可程序化”的数据，而非简单的聊天回复：
*   **强制 JSON 模式**: 请求中包含 `response_format: { type: "json_object" }`，强制 AI 输出。
*   **Schema 约束**: 通过 Prompt 指令集约束 AI 必须产出包含 `summary` (摘要), `tags` (标签数组), `score` (评分), `category` (分类) 的标准 JSON，极大简化了前端展示逻辑。

---

## 9. 安全与权限 (Security & Permissions)

作为 Manifest V3 扩展，系统严格遵循最新的安全规范：
*   **主机权限 (Host Permissions)**: 在 `manifest.json` 中明确声明 API 域名，获取跨域 `fetch` 权限。
*   **CSP 策略**: 针对 Service Worker 设置 `connect-src`，确保在严格的内容安全策略下 AI 请求不被拦截。
*   **隔离原则**: Interceptor 运行在 MAIN world 以获取 API 数据，但业务逻辑留在 ISOLATED world 和 Background，确保用户隐私与代码安全。
