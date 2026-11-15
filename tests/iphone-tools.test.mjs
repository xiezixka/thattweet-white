import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDevicePlan, validateDeviceAppInfo } from '../scripts/iphone.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('device install needs an explicit unambiguous target and cannot uninstall apps', () => {
    for (const device of [undefined, '', 'my phone', '$(touch unsafe)', '../other']) assert.throws(() => makeDevicePlan('install', { device }), /--device/);
    const plan = makeDevicePlan('install', { device: '00008110-EXAMPLE1234' });
    assert.equal(plan.length, 2);
    assert.ok(plan.every(([cmd]) => cmd === 'xcrun'));
    assert.ok(plan[0][1].includes('install'));
    assert.ok(plan[1][1].includes('launch'));
    assert.ok(!JSON.stringify(plan).includes('uninstall'));
});

test('signed build uses external project storage without automatic account or provisioning changes', () => {
    assert.throws(() => makeDevicePlan('build', { team: 'invalid team' }), /Team ID/);
    const [[command, args]] = makeDevicePlan('build', { team: 'ABCDEF1234' });
    assert.equal(command, 'xcodebuild');
    assert.ok(args.includes('DEVELOPMENT_TEAM=ABCDEF1234'));
    assert.ok(!args.includes('-allowProvisioningUpdates'));
    assert.ok(args[args.indexOf('-derivedDataPath') + 1].includes('/artifacts/device-derived'));
});

test('installer rejects simulator builds and unrelated bundle IDs', () => {
    const app = { CFBundleIdentifier: 'io.github.xiezixka.thattweet.ThatTweetSafari', DTPlatformName: 'iphoneos', CFBundleSupportedPlatforms: ['iPhoneOS'] };
    const extension = { CFBundleIdentifier: `${app.CFBundleIdentifier}.Extension`, NSExtension: { NSExtensionPointIdentifier: 'com.apple.Safari.web-extension' } };
    validateDeviceAppInfo(app, extension);
    assert.throws(() => validateDeviceAppInfo({ ...app, DTPlatformName: 'iphonesimulator' }, extension), /模拟器/);
    assert.throws(() => validateDeviceAppInfo({ ...app, CFBundleIdentifier: 'other.app' }, extension), /标识/);
    assert.throws(() => validateDeviceAppInfo(app, { ...extension, NSExtension: {} }), /Safari/);
});

test('CLI plan parses options without executing signing or requiring an installed Xcode', () => {
    const path = fileURLToPath(new URL('../scripts/iphone.mjs', import.meta.url));
    const r = spawnSync(process.execPath, [path, 'build', '--team', 'ABCDEF1234', '--xcode', '/path with spaces/Xcode.app', '--plan'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const plan = JSON.parse(r.stdout);
    assert.equal(plan.dryRun, true);
    assert.ok(plan.commands[0][1].includes('DEVELOPMENT_TEAM=ABCDEF1234'));
    const bad = spawnSync(process.execPath, [path, 'install', '--plan'], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /--device/);
});
