import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Offline UI checks only: no installed extension, account, or production data.
export default defineConfig({
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    server: { host: '127.0.0.1', port: 5187, strictPort: true, watch: { ignored: ['**/dist_chrome/**', '**/dist_firefox/**'] } },
});
