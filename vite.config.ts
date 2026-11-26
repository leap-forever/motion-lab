import { defineConfig } from 'vite';

/**
 * 原站用 Vite 把应用切成上百个带 hash 的 chunk（每个游戏一个 lazy chunk）。
 * 这里保留同样的「内容站 / 应用」分离思路，但故意不拆 chunk：
 * 教学项目里，能一口气读完比拆得漂亮更重要。
 *
 * 开发模式：Vite 在 5173，后端 API 在 8787，用 proxy 拼成同源。
 * 生产模式：npm run build 之后由 server/index.mjs 单端口同时托管
 *           内容站静态页(/) + 应用壳(/app) + /api。
 */
export default defineConfig({
  // 不装 @vitejs/plugin-react：Vite 内置的 esbuild 足以把 .tsx 转成 automatic JSX
  esbuild: { jsx: 'automatic' },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
