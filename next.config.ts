import type { NextConfig } from 'next';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Next.js 16 版的 motion-lab 配置。
 *
 * 原项目用 Vite 单独打包 SPA、再用 server/index.mjs 把「内容站 / 应用 / API」
 * 拼到一个端口。改造后这三层都由 Next.js App Router 承担：
 *   /              → 内容站首页（app/page.tsx，服务端组件，SEO 层）
 *   /app, /app/*   → React PWA 应用（客户端组件，摄像头 / WASM / Canvas）
 *   /api/*         → Route Handlers
 *
 * 构建时探测 public/ 里的离线大文件：齐全就把 NEXT_PUBLIC_LOCAL_MODELS 注入为 '1'，
 * src/lib/config.ts 会据此把 WASM / 模型 URL 从 CDN 切到同源路径。
 * 与原 vite.config.ts 的逻辑等价，只是换成 Next 的 env 注入通道。
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
if (hasLocalModels) console.log('[next] 检测到 public/ 离线资源 → 使用本地 WASM / 模型');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 把构建期探测结果注入到浏览器端 process.env.NEXT_PUBLIC_LOCAL_MODELS
  env: {
    NEXT_PUBLIC_LOCAL_MODELS: hasLocalModels ? '1' : '0',
  },
};

export default nextConfig;
