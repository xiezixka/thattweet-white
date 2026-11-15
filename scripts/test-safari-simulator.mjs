import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resultPath = resolve(root, 'artifacts/ios-host-tests.xcresult');
const { project, scheme } = JSON.parse(readFileSync(resolve(root, 'artifacts/ios-derived/project-info.json'), 'utf8'));
const listed = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' });
if (listed.status !== 0) { console.error(listed.stderr); process.exit(listed.status ?? 1); }
const devices = Object.entries(JSON.parse(listed.stdout).devices)
    .filter(([runtime]) => runtime.includes('.iOS-')).flatMap(([, rows]) => rows);
const device = devices.find(d => d.isAvailable && d.name.startsWith('iPhone'));
if (!device) throw new Error('No available iPhone simulator runtime; UI acceptance was not run.');
const tested = spawnSync('xcodebuild', ['-project', project, '-scheme', scheme,
    '-destination', `platform=iOS Simulator,id=${device.udid}`, '-parallel-testing-enabled', 'NO',
    '-derivedDataPath', resolve(root, 'artifacts/ios-derived'), '-resultBundlePath', resultPath,
    '-only-testing:ThatTweetSafariUITests/ThatTweetSafariUITests/testChineseSetupContent',
    'IPHONEOS_DEPLOYMENT_TARGET=17.0', 'CODE_SIGNING_ALLOWED=NO', 'test'], { stdio: 'inherit' });
mkdirSync(resolve(root, 'artifacts/ios-ui-evidence'), { recursive: true });
const exported = spawnSync('xcrun', ['xcresulttool', 'export', 'attachments', '--path', resultPath,
    '--output-path', resolve(root, 'artifacts/ios-ui-evidence')], { stdio: 'inherit' });
process.exit(tested.status === 0 && exported.status === 0 ? 0 : 1);
