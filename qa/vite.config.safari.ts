import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, defineConfig({
    define: { __SAFARI_IOS__: true },
    server: { port: 5191, watch: { ignored: ['**/dist_safari/**'] } },
}));
