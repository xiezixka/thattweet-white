# 数据线连接前的准备

更新：2026-11-15。手机目标：iOS 27.2。此文档配合独立的 Safari 手机版使用。

## 当前准备情况

Safari 扩展资源、原生启用说明、构建和验收资料已经准备。手机签名工程保存在项目的 `artifacts/device-project/ThatTweetSafari/ThatTweetSafari.xcodeproj`；它是独立副本，后续的 Team、签名和本地配置只在这个工程里修改，不影响电脑 Chrome。

这台 Mac 是 Apple silicon、macOS 27.0，已通过 App Store 安装 Xcode 27.2，实际位置为 `/Applications/Xcode.app`。本项目的 DerivedData 和新生成的 iPhone 系统调试缓存已放在外接「存储盘」。设备缓存原路径保留了链接，进行本机开发时请保持外接盘连接。Xcode 仍可能在系统盘创建其他缓存。

Apple 的兼容表列出 Xcode 27.2 包含 iOS 27.2 SDK，支持 macOS 26.6 及以上。当前本机已完成首次启动及 iOS 27.2 SDK 配置，许可协议、账号验证和开发者信任均由本人确认；没有购买开发者计划。

也可以从 Mac App Store 免费获取 Xcode，无需购买开发者会员。内置盘空间不足时，可用 App Store 的「下载并安装大型 App 到独立存储盘」选择 APFS 外接盘；该方式的实际应用路径以安装结果为准，不一定是上述建议目录。获取过程可能要求普通 Apple 账号登录验证，由本人完成。

## 免费个人签名

本人设备测试可以先使用普通 Apple 账号在 Xcode 中建立 Personal Team；无需先付费。Apple 为免费个人团队签发的描述文件有效期为 7 天，到期后需要重新构建、签名和安装。免费团队还有设备数、应用数及能力限制；本扩展的实际签名结果仍需在 Xcode 中核实，不把普通应用可安装视为扩展已签名成功。

续签时保留同一 Team、应用及扩展 Bundle ID，更新已有应用；不要先卸载或清除 Safari 数据。续签前仍应把聊天、笔记等完整备份保存到「文件」。免费签名用于本人测试，TestFlight 或 App Store 分发属于其他流程。

## Xcode 准备好后

只读检查，不修改系统 Xcode 选择、不读取 Apple 账号或私钥：

```sh
npm run iphone:check -- --xcode "/Applications/Xcode.app"
```

在 Xcode 中打开上述手机工程。用你自己的 Apple 账号配置应用和扩展两个 Target 的 Signing & Capabilities，保持两者 Team 一致。后续升级保留这个工程及应用身份，避免重新生成工程后误换 Bundle ID。

当前生成工程的应用标识为 `io.github.xiezixka.thattweet.ThatTweetSafari`，扩展为 `io.github.xiezixka.thattweet.ThatTweetSafari.Extension`。它们与电脑 Chrome 扩展身份分离。安装脚本会检查这两个准确标识。

## 手机接线后

1. 数据线连接 Mac 与 iPhone，解锁手机；由你在手机上确认“信任此电脑”。
2. 按 Xcode / Device Hub 提示完成配对和开发者模式。开发者模式可能需要重启与输入手机密码，由你本人操作。
3. 在 Xcode 中选这部手机和自己的签名 Team。账号、许可、签名或钥匙串确认由你本人处理，不需要把密码或 API Key 发给助手。
4. 我先检查设备和签名，再构建、安装、打开应用。随后由你在 iPhone 启用 Safari 扩展、授权 x.com，开始真实采集、AI 和数据恢复验收。

## 已准备的命令

查看设备使用 Apple 官方命令 `xcrun devicectl list devices`。设备身份信息只用于本机安装，不提交到 GitHub。

先演练计划，下面 Team 和设备标识都是示例：

```sh
npm run iphone:build -- --team ABCDEF1234 --plan
npm run iphone:install -- --device 00008110-EXAMPLE1234 --plan
```

准备完成后使用实际值，去掉 `--plan` 执行：

```sh
npm run iphone:build -- --team YOURTEAMID --xcode "/Applications/Xcode.app"
npm run iphone:install -- --device YOUR-DEVICE-ID --xcode "/Applications/Xcode.app"
```

构建不会自动创建 Apple 证书或申请描述文件；缺少签名配置时会停止，需要在 Xcode 中完成配置。安装命令会核对应用及扩展身份、真机平台、描述文件和代码签名，拒绝模拟器包；必须明确指定设备，不自动挑选手机，不包含卸载或清空数据操作。

已通过参数校验、计划演练、包身份检查，以及当前 iPhone 16 Pro Max / iOS 27.2 的真实签名、安装和启动。Safari 功能的验收状态见 [真机验收记录](qa/SAFARI-IOS-ACCEPTANCE.md)，不能把安装成功视为全部功能通过。

## 接线后的验收顺序

先验证应用打开及中文说明，再验证 Safari 扩展启用和网站权限；随后依次验证一条纯文本采集、一条带图采集、一次 AI 分析、一次流式聊天与引用、笔记切换与历史、导出到「文件」后恢复。最后检查断网、切换后台、横竖屏和接近真实的数据量。

手机数据使用独立存储，迁移通过明确选择的完整备份进行。电脑原插件、白色版与数据继续保留；原版普通备份没有包含的聊天、笔记不会凭空出现在手机中。

## 官方依据

- [Xcode 与 SDK 兼容表](https://developer.apple.com/xcode/system-requirements)
- [设备开发者模式](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
- [设备命令行工具](https://developer.apple.com/documentation/xcode/interacting-with-devices-using-the-command-line)
- [Xcode 组件下载与安装](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components)
- [Xcode 免费下载入口](https://developer.apple.com/xcode/resources/)
- [免费个人团队及 7 天签名限制](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [App Store 安装大型应用到外接盘](https://support.apple.com/guide/app-store/fir06754f864/mac)
