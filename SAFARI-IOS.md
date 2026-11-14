# ThatTweet Safari iPhone 版 4.6.1

基于白色版 4.5.7 的独立 iOS 分支。目标为 iOS 17 及以上的 Safari；保留原有采集、收藏、AI 工作流、OCR/图片分析、统计、作者分析、检索、图谱、模拟、画廊、聊天和笔记入口。**编译通过不等于这些功能已在 iPhone 真机全部验收。**

## 独立与数据边界

- 本目录、`dist_safari`、Xcode 项目、iPhone 应用及扩展存储与电脑 Chrome 安装目录分离。
- 不卸载、停用、替换电脑插件；不读写电脑插件用户数据库，不自动传输聊天或 API Key。
- 不自动同步。手机可从文件导入普通推文备份或本分支导出的完整备份。旧版普通备份不含聊天与笔记，不能补出未导出的内容。
- Safari 扩展仅采集 Safari 中获准访问的 X 网页，不能读取 X 原生 App。

## 构建与安装

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build:safari
npm run package:safari
```

最后一步需要完整 Xcode；脚本优先查找 Apple 新版 `safari-web-extension-packager`，兼容旧名 `safari-web-extension-converter`。使用 `--ios-only --copy-resources` 创建独立项目，目标已存在时退出以保护签名与用户修改。需要另存时：`npm run package:safari -- artifacts/safari-ios-new`。

本机没有 Xcode 时，可从 GitHub 的 **Safari iOS build** 工作流下载 `ThatTweet-Safari-iOS-Xcode`。工作流使用 Xcode 生成真实项目并编译不签名的 iPhone 模拟器应用。`ThatTweet-Safari-iOS-Simulator` 是模拟器包，**不能安装到真实 iPhone**；资源 ZIP 也不能直接当作 IPA 安装。

真机步骤：

1. 在 Mac 安装完整 Xcode，打开生成的 `ThatTweetSafari.xcodeproj`。
2. 在应用和扩展两个 Target 的 Signing & Capabilities 中选择自己的开发 Team，配置唯一 Bundle ID；保持后续安装使用同一身份，避免更换身份导致读不到原存储。
3. 连接 iPhone，按 Xcode 提示完成开发设备设置，在真机上运行应用。
4. 按应用说明在 iPhone 设置中启用 Safari 扩展，并允许访问 x.com。不同 iOS 版本设置路径可能不同。
5. 在 Safari 打开 x.com 登录，从扩展弹窗打开管理页。配置 AI 服务商与每个需要的工作流模型。自定义接口使用 HTTPS，保存/测试时按 Safari 提示授权该服务商域名。

通过 TestFlight/App Store 分发需要 Apple 开发者计划、签名和审核；仓库没有签名私钥、Apple 凭据或用户 API Key。

## 手机适配

- 「沉思」在窄屏分为历史与资料、聊天、笔记三个可切换区域，功能不依赖鼠标拖拽或悬停；资料可点选附加到聊天。
- 保留白色默认主题、深色切换与全部导航入口，适配动态视口、安全区域和触屏输入。编辑/预览在窄屏上下排列。
- 不依赖 Safari 不支持的文件系统选择器。Markdown 通过普通文件输入导入、下载导出；不会伪称已直接写入用户选择的文件。
- Safari 的后台为非持久页面，保留 canvas 图片处理，使用 alarms 和页面恢复事件处理队列。iOS 仍可暂停后台，不能保证锁屏或切换 App 后定时继续运行。
- 超过 10 分钟仍处于 Processing 的任务标记为 Failed，保留原内容，需手动收藏触发重试。不自动重新付费请求一个可能已被服务商计费的中断任务。
- 设置的定期备份在手机端为本机恢复快照。快照与应用在同一设备，卸载或清除数据会丢失，不能代替导出到「文件」的备份。

## 备份与导入

手机「实验室 → 记忆皮层」先点「生成完整备份」，再点「保存备份文件」完成导出。显式保存链接避免在异步生成后自动触发下载；弹窗、按作者导出和恢复快照也采用这个流程。完整导出，含推文、作者、聊天消息、引用、每个会话笔记、独立笔记、所有 `fallingPenHistory_` 笔记历史。默认不含 API Key；勾选包含 AI 配置才导出凭据，应私密保存。

导入前保留本机快照。已有推文 ID 保留当前内容；同 ID 的不同聊天另存副本，冲突的独立笔记另建会话，不覆盖当前内容；历史版本合并。已配置的手机 AI 服务商优先保留。导入失败不会清空已有数据；两个存储系统不能做同一事务，新增推文可能已导入，保留原备份并重试后核对。

导出后请实际打开下载文件；导入后重新加载管理页，核对推文数、会话数、消息、引用、笔记与历史，再考虑处理任何旧版。旧电脑版的聊天、笔记迁移仍是独立待办，本分支没有操作这些数据。

## 验收范围

自动化测试覆盖空模型保护、模型选择竞态、队列唤醒、完整备份、错误格式拒绝、导入冲突保留、中断识别、按 AI 域名授权。另进行 Chrome/Firefox/Safari 三构建、资源引用和本地窄屏交互检查。具体执行结果见 `qa/SAFARI-IOS-ACCEPTANCE.md`。

真机待验收：签名安装、Safari 权限、X 实际采集入库、真实 AI/OCR/流式聊天、锁屏恢复、真实文件下载与导入、图片/图谱内存表现，以及全部原有功能的完整链路。无法用桌面视口模拟代替这些检查。

## Apple 依据

- [Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Optimizing your web extension for Safari](https://developer.apple.com/documentation/safariservices/optimizing-your-web-extension-for-safari)
