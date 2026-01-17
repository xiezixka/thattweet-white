import { resolve } from 'path';
import { mergeConfig, defineConfig } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base'

const outDir = resolve(__dirname, 'dist_chrome');

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: {
          ...(baseManifest as any),
          background: {
            service_worker: 'src/pages/background/index.ts',
            type: 'module'
          },
          web_accessible_resources: [
            ...((baseManifest as any).web_accessible_resources || []),
            {
              resources: ['src/core/extractor/injected.ts'],
              matches: ['https://twitter.com/*', 'https://x.com/*'],
            }
          ]
        } as ManifestV3Export,
        browser: 'chrome',
        contentScripts: {
          injectCss: true,
        }
      })
    ],
    build: {
      ...baseBuildOptions,
      outDir
    },
  })
)