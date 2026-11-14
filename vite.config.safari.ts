import { resolve } from 'node:path';
import { mergeConfig, defineConfig } from 'vite';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base';
import manifest from './manifest.json';
import { readFileSync, writeFileSync } from 'node:fs';

export default mergeConfig(baseConfig, defineConfig({
    define: { __SAFARI_IOS__: true },
    plugins: [{
        name: 'safari-ios-resources',
        transformIndexHtml: html => html.replace('<html ', '<html data-platform="safari-ios" '),
        writeBundle() {
            // CRXJS removes Firefox's MV2-only key while producing MV3 output;
            // Safari explicitly accepts it for its nonpersistent background page.
            const path = resolve(__dirname, 'dist_safari/manifest.json');
            const output = JSON.parse(readFileSync(path, 'utf8'));
            output.background.persistent = false;
            writeFileSync(path, JSON.stringify(output, null, 2));
        },
    }, crx({
        // A nonpersistent document preserves canvas image processing on iOS.
        browser: 'firefox',
        manifest: {
            ...baseManifest,
            name: 'ThatTweet Safari',
            background: { scripts: ['src/pages/background/index.ts'], persistent: false, type: 'module' },
            host_permissions: [...manifest.host_permissions, 'https://pbs.twimg.com/*'],
            optional_host_permissions: ['https://*/*'],
        } as ManifestV3Export,
        contentScripts: { injectCss: true },
    })],
    build: { ...baseBuildOptions, target: 'safari17', outDir: resolve(__dirname, 'dist_safari') },
}));
