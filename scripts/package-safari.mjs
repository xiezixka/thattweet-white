import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resources = resolve(root, 'dist_safari');
const output = resolve(root, process.argv[2] || 'artifacts/safari-ios');
if (!existsSync(resolve(resources, 'manifest.json'))) throw new Error('先运行 npm run build:safari。');
const manifest = JSON.parse(readFileSync(resolve(resources, 'manifest.json'), 'utf8'));
if (manifest.background?.persistent !== false || manifest.background?.service_worker) throw new Error('iOS 构建必须使用非持久后台页面。');
const tool = ['safari-web-extension-packager', 'safari-web-extension-converter'].find(name =>
    spawnSync('xcrun', ['--find', name], { encoding: 'utf8' }).status === 0);
if (!tool) {
    console.error('未找到 Safari 打包工具。请安装完整 Xcode；也可从 GitHub Safari iOS 工作流下载已生成的 Xcode 项目。');
    process.exit(1);
}
if (existsSync(resolve(output, 'ThatTweetSafari'))) throw new Error('目标项目已存在。请指定新的输出目录以保留签名和用户修改。');
mkdirSync(output, { recursive: true });
const result = spawnSync('xcrun', [tool, resources, '--project-location', output,
    '--app-name', 'ThatTweetSafari', '--bundle-identifier', 'io.github.xiezixka.thattweet.safari',
    '--swift', '--ios-only', '--copy-resources', '--no-open', '--no-prompt'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
