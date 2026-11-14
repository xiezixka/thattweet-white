import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function findProjects(folder) {
    return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
        const path = resolve(folder, entry.name);
        return entry.name.endsWith('.xcodeproj') ? [path] : entry.isDirectory() ? findProjects(path) : [];
    });
}
const projects = findProjects(resolve(root, 'artifacts/safari-ios'));
if (projects.length !== 1) throw new Error('需要唯一的 Safari Xcode 项目，请先运行 npm run package:safari。');
const listed = spawnSync('xcodebuild', ['-project', projects[0], '-list', '-json'], { encoding: 'utf8' });
if (listed.status !== 0) { console.error(listed.stderr); process.exit(listed.status ?? 1); }
const info = JSON.parse(listed.stdout);
const scheme = info.project.schemes.find(name => name.includes('ThatTweetSafari') && !/extension/i.test(name));
if (!scheme) throw new Error('未找到 iOS 宿主应用 Scheme。');
mkdirSync(resolve(root, 'artifacts/ios-derived'), { recursive: true });
writeFileSync(resolve(root, 'artifacts/ios-derived/project-info.json'), JSON.stringify({ project: projects[0], scheme }, null, 2));
const result = spawnSync('xcodebuild', ['-project', projects[0], '-scheme', scheme, '-sdk', 'iphonesimulator',
    '-configuration', 'Debug', '-derivedDataPath', resolve(root, 'artifacts/ios-derived'),
    'IPHONEOS_DEPLOYMENT_TARGET=17.0', 'CODE_SIGNING_ALLOWED=NO', 'build'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
