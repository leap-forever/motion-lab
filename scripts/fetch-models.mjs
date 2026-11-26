/**
 * 可选：把 MediaPipe 的 WASM 与姿态模型下载到 public/，实现真正离线。
 * 下载后用 `VITE_LOCAL_MODELS=1 npm run build && npm run start` 切换。
 *
 * 约 31MB，第一次跑要几分钟。文件来源：
 *   - @mediapipe/tasks-vision 1.1.1 的 WASM（jsdelivr 上的 npm 包内容）
 *   - Google MediaPipe 官方 pose_landmarker_lite 模型
 * 两者都不是站点自有素材，授权分别见各自仓库/模型页；本项目仅作教学用途。
 */
import { execFileSync } from 'node:child_process';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const FILES = [
  [`${VISION}/vision_bundle.mjs`, 'public/mediapipe/vision_bundle.mjs'],
  [`${VISION}/wasm/vision_wasm_internal.js`, 'public/mediapipe/wasm/vision_wasm_internal.js'],
  [`${VISION}/wasm/vision_wasm_internal.wasm`, 'public/mediapipe/wasm/vision_wasm_internal.wasm'],
  [`${VISION}/wasm/vision_wasm_nosimd_internal.js`, 'public/mediapipe/wasm/vision_wasm_nosimd_internal.js'],
  [`${VISION}/wasm/vision_wasm_nosimd_internal.wasm`, 'public/mediapipe/wasm/vision_wasm_nosimd_internal.wasm'],
  [MODEL, 'public/models/pose_landmarker_lite.task'],
];

for (const [url, local] of FILES) {
  const dest = join(ROOT, local);
  await mkdir(dirname(dest), { recursive: true });
  let exists = false;
  try { exists = (await stat(dest)).size > 1000; } catch { /* 没有就下 */ }
  if (exists) { console.log(`skip  ${local}`); continue; }
  const tmp = `${dest}.part`;
  process.stdout.write(`get   ${local} … `);
  try {
    execFileSync('curl', [
      '-sS', '-L', '--fail', '--retry', '3', '--retry-delay', '2',
      '--max-time', '300', '-o', tmp, url,
    ], { stdio: 'pipe' });
    await rename(tmp, dest);
    console.log(`${((await stat(dest)).size / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    console.log(`FAIL  ${String(err.message || err).slice(0, 140)}`);
  }
}
console.log('\n完成。切到本地模型：VITE_LOCAL_MODELS=1 npm run build && npm run start');
