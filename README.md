# ThatTweet 白色优化版 · 4.5.5

基于 [mu-zi-lee/thattweet-vite](https://github.com/mu-zi-lee/thattweet-vite) 的 4.5.4 源码（提交 `8b0c37c`）维护，保留原有推文采集、本地管理、图谱、AI 与笔记功能。

本版默认使用白色背景，可在「实验室 → 系统信息 → 颜色主题」切回深色。主题适用于管理页和弹窗；媒体预览保留深色遮罩，图片原始颜色不变。白色主题样式不注入 X 网页。

主要修复：后台休眠后的队列唤醒、旧设置合并、预测字段错误、弹窗备份下载、导入后的图谱恢复、清空数据遗漏向量缓存、缺失的中英文翻译。图谱、统计和编辑器改为按需加载，并补充键盘/触控导航入口与列表、设置页的窄屏布局。

## 本地构建

使用 Node.js 22 或更高版本。本维护分支以 npm 和 `package-lock.json` 为准。

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build:chrome
```

Chrome 打开 `chrome://extensions`，开启开发者模式，选择「加载已解压的扩展程序」，选择项目的 `dist_chrome` 目录。不要直接选择源代码根目录或 ZIP 文件。

## 从原版迁移

新加载的扩展拥有独立的数据空间。先在原版「实验室 → 记忆皮层」下载备份，再到新版同一位置上传恢复。确认推文、作者和标签恢复后再停用原版。迁移验收前保留原版，不要卸载。包含配置的备份可能含 API 密钥，应保存在自己的电脑中，不要提交到仓库。

## 验收与预览

```sh
npm run preview:ui
```

打开 `http://127.0.0.1:5187/qa/preview.html` 或 `http://127.0.0.1:5187/qa/popup.html`。这是独立的离线验收入口，使用模拟扩展 API 和示例数据库，不读取已安装扩展的数据，也不进入生产构建。

[验收记录与限制](qa/ACCEPTANCE.md) · [桌面列表](qa/evidence/feed-desktop.png) · [窄屏列表](qa/evidence/feed-mobile.png) · [主题设置](qa/evidence/settings-desktop.png)

真实 X 采集、用户 API 服务、浏览器长期后台行为仍需安装扩展后在真实账号环境确认；离线检查不代表这些外部链路已经通过。

---

以下保留上游模板说明供参考；本分支的环境、依赖安装和验收命令以上文为准。

<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1> 基于 React + Vite + TypeScript + TailwindCSS 的<br/>极简 Chrome/Firefox 浏览器扩展模板</h1>

<h5>
本模板仓库是我开发的 Chrome 扩展 <a target="_blank" rel="noopener noreferrer" href="https://chrome.google.com/webstore/detail/supatabs/icbcnjlaegndjabnjbaeihnnmidbfigk">Supatabs</a> 的副产品。
<br />
如果你习惯于打开大量标签页，或者是 OneTab 用户，请务必前往 <a target="_blank" rel="noopener noreferrer" href="https://chrome.google.com/webstore/detail/supatabs/icbcnjlaegndjabnjbaeihnnmidbfigk">此处</a> 查看！
</h5>

<h5>Supatabs 是该模板可开发内容的示例和展示。（实际上你可以开发任何你想要的东西 🚀）</h5>

</div>

## 目录

- [简介](#intro)
- [特性](#features)
- [使用方法](#usage)
  - [快速入门](#gettingStarted) 
  - [自定义](#customization)
  - [发布](#publish)
- [技术文档](#tech)
- [致谢](#credit)
- [贡献](#contributing)


## 简介 <a name="intro"></a>
本模板旨在为使用 React、Typescript 和 Tailwind CSS 创建 Chrome/Firefox 扩展提供极简的快速启动方案。

它默认包含了所有可能的页面，如 **新标签页 (new tab)**、**开发者面板 (dev panel)**、**弹出窗口 (pop up)** 等，以及相应的 manifest 配置。
你可能需要根据需求自定义或删除某些页面（参见下文文档）。

你可以为 Chrome 和 Firefox 构建基于 manifest v3 的产物文件。

如果你正在寻找一种以 React 为核心的方式来访问本地存储，我还实现了一个 chrome local/sync storage hook。该 hook 与此模板配合良好。[在此查看](https://gist.github.com/JohnBra/c81451ea7bc9e77f8021beb4f198ab96)。

## 特性 <a name="features"></a>
- [React 19](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [i18n (可选)](https://developer.chrome.com/docs/extensions/reference/api/i18n)
- [使用 polyfill 进行跨浏览器开发 (可选)](https://github.com/mozilla/webextension-polyfill?tab=readme-ov-file#basic-setup-with-module-bundlers)
- [ESLint](https://eslint.org/)
- [Chrome 扩展 Manifest Version 3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Github Action](https://github.com/JohnBra/vite-web-extension/actions/workflows/ci.yml) 用于构建并压缩你的扩展（手动触发）

## 使用方法 <a name="usage"></a>

### 快速入门 <a name="gettingStarted"></a>

#### 开发与构建
本模板附带 Chrome 和 Firefox 的构建配置。在不指定浏览器目标的情况下运行 `dev` 或 `build` 命令，默认将为 Chrome 构建。

1. 克隆此仓库或点击 "Use this template"
2. 修改 `manifest.json` 中的 `name` 和 `description`
3. 运行 `yarn` 或 `npm i` (检查 node 版本 >= 16)
4. 运行 `yarn dev[:chrome|:firefox]`，或 `npm run dev[:chrome|:firefox]`

运行 `dev` 命令将构建你的扩展并监听源文件的更改。更改源文件将自动刷新对应的 `dist_<chrome|firefox>` 文件夹。

若要创建优化的生产版本，请运行 `yarn build[:chrome|:firefox]`，或 `npm run build[:chrome|:firefox]`。

#### 加载你的扩展
针对 Chrome
1. 打开 - Chrome 浏览器
2. 访问 - [chrome://extensions](chrome://extensions)
3. 开启 - 开发者模式 (Developer mode)
4. 点击 - 加载已解压的扩展程序 (Load unpacked extension)
5. 选择 - 本项目中的 `dist_chrome` 文件夹 (在运行 dev 或 build 之后)

针对 Firefox
1. 打开 - Firefox 浏览器
2. 访问 - [about:debugging#/runtime/this-firefox](about:debugging#/runtime/this-firefox)
3. 点击 - 临时载入附加组件 (Load temporary Add-on)
4. 选择 - 本项目 `dist_firefox` 文件夹中的任何文件 (例如 `manifest.json`) (在运行 dev 或 build 之后)

### 自定义 <a name="customization"></a>

#### 添加 / 删除页面
模板包含了所有扩展页面（如新标签页、开发工具、弹出窗口、侧边栏等）的源代码。你可能需要根据需求进行自定义。

例如，你不希望在打开新标签页时激活自定义的新标签页：
1. 删除 `src/pages` 中的 `newtab` 目录及其内容
2. 删除 `manifest.json` 中的 `chrome_url_overrides: { newtab: 'src/pages/newtab/index.html' },`

某些页面（如“侧边栏 Side Panel”）在 Chrome 和 Firefox 中的工作方式并不完全相同。虽然此模板包含侧边栏的源代码，但它不会自动包含在构建产物中，以防止跨浏览器构建警告。

若要为 Chrome 添加侧边栏，请在 `manifest.json` 中添加以下内容：

```typescript
{
  "manifest_version": 3,
  // ...
  "permissions": [
    "activeTab",
    "sidePanel" // <-- 侧边栏权限
  ],
  // ...
  "side_panel": {
    "default_path": "src/pages/panel/index.html" // <-- 告知 vite 在构建中包含它
  },
  // ...
}
```

如果你需要声明 manifest 页面之外的页面（例如自定义的 `app` 页面），请在 `pages` 目录中创建一个新文件夹，并添加对应的 `.html`、`.tsx` 和 `.css` 文件（参考 `options/*` 示例进行复制）。然后在 `vite.config.base.ts` 文件的 `build.rollupOptions.input` 下包含根 html，如下所示：

```typescript
// ...
build: {
   rollupOptions: {
      input: {
         app: resolve(pagesDir, "app", "index.html"),
      },
      output: {
         entryFileNames: (chunk) => `src/pages/${chunk.name}/index.js`,
      },
   },
}
// ...
```

#### 样式
`src/pages/*` 目录中的 CSS 文件不是必须的。保留它们是为了方便你结合 Tailwind CSS 使用。**你可以随意删除它们**。

Tailwind 可以根据 [文档](https://tailwindcss.com/docs/theme) 进行配置、主题化和扩展。

#### 国际化 (i18n)
若要启用国际化，请将 `vite.config.base.ts` 中的 `localize` 标志设置为 `true`。

模板包含一个 `locales` 目录，其中包含基本的英文 i18n 设置。启用 i18n 后，扩展的名称和描述将从英文翻译文件中提取，而不是直接从 manifest 中提取。

按照 [官方文档](https://developer.chrome.com/docs/extensions/reference/api/i18n#description) 的说明添加其他语言翻译并在扩展中获取它们。

如果你不需要 i18n，可以暂时忽略 `locales` 目录，除非 `localize` 标志设置为 `true`，否则它不会被复制到构建文件夹中。

### 发布扩展到 Chrome 应用商店 (CWS)<a name="publish"></a>
若要将扩展上传到 Chrome 商店，你必须将其打包（zip），然后上传到 Chrome Web Store 中的对应项目。

此仓库包含一个 Github Action 工作流，用于创建 [优化的生产构建和 zip 文件](https://github.com/JohnBra/vite-web-extension/actions/workflows/ci.yml)。

要运行该工作流，请执行以下操作：
1. 转到从此模板派生的仓库中的 **"Actions"** 选项卡
2. 在左侧边栏中点击 **"Build and Zip Chrome Extension"**
3. 点击 **"Run Workflow"** 并选择 main 分支，然后点击 **"Run Workflow"** 按钮
4. 刷新页面并点击最近的一次运行
5. 在摘要页面的 **"Artifacts"** 部分，点击生成的 **"vite-web-extension-chrome"**
6. 按照 [此处](https://developer.chrome.com/docs/webstore/publish/) 的说明将此文件上传到 Chrome Web Store

# 技术文档 <a name="tech"></a>
- [Vite](https://vitejs.dev/)
- [Vite 插件](https://vitejs.dev/guide/api-plugin.html)
- [基于 Manifest V3 的 Chrome 扩展](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome 扩展 i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n#description)
- [使用 webextension-polyfill 进行跨浏览器开发](https://github.com/mozilla/webextension-polyfill?tab=readme-ov-file#webextension-browser-api-polyfill)
- [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin)
- [Rollup](https://rollupjs.org/guide/en/)
- [Tailwind CSS 4](https://tailwindcss.com/docs/configuration)

# 贡献 <a name="contributing"></a>
欢迎开启 PR 或提出 issue！
