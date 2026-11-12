import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// --mode mobile 이면 서버 없이 도는 휴대폰용으로 묶는다 (글꼴과 내장 효과음을 같이 넣는다)
const root = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  const local = mode === 'mobile';
  return {
  root: path.resolve(__dirname),
  define: { 'import.meta.env.VITE_LOCAL': JSON.stringify(local ? '1' : '') },
  base: local ? './' : '/',
  publicDir: local ? path.join(root, 'public') : false,
  plugins: [
    react(),
    {
      name: 'infocut-sfx',
      apply: 'build',
      closeBundle() {
        if (!local) return;
        const out = path.join(root, 'mobile', 'www', 'sfx');
        fs.mkdirSync(out, { recursive: true });
        for (const f of fs.readdirSync(path.join(root, 'assets', 'sfx'))) if (f.endsWith('.wav')) fs.copyFileSync(path.join(root, 'assets', 'sfx', f), path.join(out, f));
      },
    },
  ],
  build: { outDir: local ? path.join(root, 'mobile', 'www') : path.resolve(__dirname, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5179, proxy: { '/api': 'http://127.0.0.1:5178', '/files': 'http://127.0.0.1:5178', '/asset': 'http://127.0.0.1:5178', '/fonts': 'http://127.0.0.1:5178' } },
};
});
