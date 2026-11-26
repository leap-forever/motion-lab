import { defineConfig } from 'vite';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 原站用 Vite 把应用切成上百个带 hash 的 chunk（每个游戏一个 lazy chunk）。
 * 这里保留同样的「内容站 / 应用」分离思路，但故意不拆 chunk：
 * 教学项目里，能一口气读完比拆得漂亮更重要。
 *
 * 开发模式：Vite 在 5173，后端 API 在 8787，用 proxy 拼成同源。
 * 生产模式：npm run build 之后由 server/index.mjs 单端口同时托管
 *           内容站静态页(/) + 应用壳(/app) + /api。
 */

/**
 * 构建时探测 public/ 里有没有完整的离线资源。
 * 有的话就把 __LOCAL_MODELS__ 注入为 true，src/lib/config.ts 会自动把
 * WASM / 模型 URL 从 CDN 切到同源路径 —— 下完文件直接 build 即可，
 * 不用记 VITE_LOCAL_MODELS=1，也不会出现「文件下了却还在走 CDN」。
 * 用 process.cwd() 而不是 import.meta.url：Vite 会先把 config 打包到临时文件，
 * 在那里 import.meta.url 指向的不是项目目录。
 */
const ROOT = process.cwd();
const REQUIRED: Array<[string, number]> = [
  ['public/models/pose_landmarker_lite.task', 4_000_000],
  ['public/mediapipe/vision_bundle.mjs', 100_000],
  ['public/mediapipe/wasm/vision_wasm_internal.wasm', 10_000_000],
  ['public/mediapipe/wasm/vision_wasm_nosimd_internal.wasm', 10_000_000],
];
const hasLocalModels = REQUIRED.every(([rel, minBytes]) => {
  const file = join(ROOT, rel);
  return existsSync(file) && statSync(file).size >= minBytes;
});
if (hasLocalModels) console.log('[vite] 检测到 public/ 离线资源 → 使用本地 WASM / 模型');

export default defineConfig({
  // 不装 @vitejs/plugin-react：Vite 内置的 esbuild 足以把 .tsx 转成 automatic JSX
  esbuild: { jsx: 'automatic' },
  define: {
    __LOCAL_MODELS__: JSON.stringify(hasLocalModels),
  },
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
