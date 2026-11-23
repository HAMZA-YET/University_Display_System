// Built frontend for the disposable loopback API; never changes production settings.
import { preview } from 'vite';
import { fileURLToPath } from 'node:url';

const baseline = process.argv.includes('--baseline');
const server = await preview({
  configFile: false,
  root: fileURLToPath(new URL('../../frontend', import.meta.url)),
  ...(baseline ? { build: { outDir: fileURLToPath(new URL('../../node_modules/.cache/member3-design-baseline/dist', import.meta.url)) } } : {}),
  preview: {
    host: '127.0.0.1', port: baseline ? 5188 : 5187, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:5017', changeOrigin: false } },
  },
});
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.httpServer.close(() => process.exit(0)));
