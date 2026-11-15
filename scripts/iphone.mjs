import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appId = 'io.github.xiezixka.thattweet.ThatTweetSafari';
const extensionId = `${appId}.Extension`;
const project = resolve(root, 'artifacts/device-project/ThatTweetSafari/ThatTweetSafari.xcodeproj');
const derived = resolve(root, 'artifacts/device-derived');
const app = resolve(derived, 'Build/Products/Debug-iphoneos/ThatTweetSafari.app');

export function makeDevicePlan(action, options = {}) {
    if (action === 'build') {
        if (!/^[A-Z0-9]{10}$/.test(options.team || '')) throw new Error('build 需要 --team，值为 Xcode 显示的 10 位 Team ID。');
        return [['xcodebuild', ['-project', project, '-scheme', 'ThatTweetSafari', '-configuration', 'Debug',
            '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-derivedDataPath', derived,
            `DEVELOPMENT_TEAM=${options.team}`, 'CODE_SIGN_STYLE=Automatic', 'IPHONEOS_DEPLOYMENT_TARGET=17.0', 'build']]];
    }
    if (action === 'install') {
        if (!/^[A-Za-z0-9-]{8,128}$/.test(options.device || '')) throw new Error('install 需要 --device，明确指定唯一的设备标识；不会自动选择手机。');
        return [['xcrun', ['devicectl', 'device', 'install', 'app', '--device', options.device, app]],
            ['xcrun', ['devicectl', 'device', 'process', 'launch', '--device', options.device, appId]]];
    }
    throw new Error('支持的命令：check、build --team TEAMID、install --device DEVICEID；加 --plan 只显示计划。');
}

export function validateDeviceAppInfo(info, extension) {
    if (info.CFBundleIdentifier !== appId || extension.CFBundleIdentifier !== extensionId) throw new Error('包标识不匹配，拒绝安装其他应用。');
    if (info.DTPlatformName !== 'iphoneos' || !info.CFBundleSupportedPlatforms?.includes('iPhoneOS')) throw new Error('需要真机包，不能把模拟器 .app 装到 iPhone。');
    if (extension.NSExtension?.NSExtensionPointIdentifier !== 'com.apple.Safari.web-extension') throw new Error('缺少 Safari Web Extension。');
}

function fullXcode(options) {
    const supplied = options.xcode;
    const selected = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout?.trim();
    return [supplied && (supplied.endsWith('/Contents/Developer') ? supplied : resolve(supplied, 'Contents/Developer')),
        process.env.DEVELOPER_DIR, selected, '/Applications/Xcode.app/Contents/Developer',
        '/Volumes/存储盘/开发工具/Xcode.app/Contents/Developer']
        .find(path => path && existsSync(resolve(path, 'usr/bin/xcodebuild')));
}

function run(command, args, env, capture = false) {
    const result = spawnSync(command, args, { env, ...(capture ? { encoding: 'utf8' } : { stdio: 'inherit' }) });
    if (result.status !== 0) throw new Error(capture ? result.stderr?.trim() || `${command} 未执行成功` : `${command} 执行失败，请检查签名、设备信任及构建输出。`);
    return result.stdout;
}

function readPlist(path, env) {
    return JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', path], env, true));
}

export function main(argv = process.argv.slice(2)) {
    const [action = 'check', ...args] = argv;
    const options = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--plan') options.plan = true;
        else if (['--team', '--device', '--xcode'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
            const name = args[i].slice(2);
            options[name] = args[++i];
        }
        else throw new Error(`不支持的参数：${args[i]}`);
    }
    if (action !== 'check') {
        const commands = makeDevicePlan(action, options);
        if (options.plan) { console.log(JSON.stringify({ dryRun: true, commands }, null, 2)); return; }
    }
    const developer = fullXcode(options);
    const env = developer ? { ...process.env, DEVELOPER_DIR: developer } : process.env;
    if (action === 'check') {
        const version = developer ? spawnSync('xcodebuild', ['-version'], { env, encoding: 'utf8' }) : null;
        const sdk = developer ? spawnSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version'], { env, encoding: 'utf8' }) : null;
        const report = { projectReady: existsSync(project), xcodeDeveloperDirectory: developer || null,
            xcodeVersion: version?.status === 0 ? version.stdout.trim() : null,
            iosSDKAvailable: sdk?.status === 0 ? sdk.stdout.trim() : null,
            setupNeeded: !developer || version?.status !== 0 || sdk?.status !== 0,
            deviceAppBuilt: existsSync(app), signing: '未读取账号或证书；需在 Xcode 中配置',
            targetIOS: '27.2', deviceList: '手机连接后使用 xcrun devicectl list devices；不自动配对或信任设备' };
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    if (!developer) throw new Error('尚未找到完整 Xcode。可用 --xcode 指向外接盘上的 Xcode.app；不会更改系统 xcode-select。');
    if (!existsSync(project)) throw new Error('缺少独立手机签名工程，见 IPHONE-USB.md。');
    if (action === 'install') {
        const extension = resolve(app, 'PlugIns/ThatTweetSafari Extension.appex');
        if (!existsSync(resolve(app, 'embedded.mobileprovision'))) throw new Error('缺少真机开发描述文件，请先在 Xcode 配置签名并构建。');
        validateDeviceAppInfo(readPlist(resolve(app, 'Info.plist'), env), readPlist(resolve(extension, 'Info.plist'), env));
        run('codesign', ['--verify', '--deep', '--strict', app], env);
    }
    // No -allowProvisioningUpdates, certificate creation, uninstall or global SDK switch.
    for (const [command, values] of makeDevicePlan(action, options)) run(command, values, env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
