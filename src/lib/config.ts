/**
 * 资源来源配置。
 *
 * 原站的做法（从它的 assets-DwOKvwpk.js 里能直接读到）：
 *   - WASM 和 .task 模型自托管在 /mediapipe/wasm/、/models/，URL 带 ?v=内容hash；
 *   - 每份 WASM 还登记了一个 registry.npmmirror.com 镜像，国内用户优先走镜像；
 *   - Service Worker 把两份都缓存下来，所以装过一次之后断网也能玩。
 *
 * 教学版默认走公共 CDN（开箱即跑、不用先下 20MB），
 * 想完整体验「离线」就跑 `npm run models` 把文件落到 public/，
 * 再用 VITE_LOCAL_MODELS=1 npm run build 切换到本地路径。
 */
export const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
export const MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';

export type PoseModel = 'lite' | 'full' | 'heavy';

export const MODEL_FILES: Record<PoseModel, string> = {
  lite: 'pose_landmarker_lite.task',
  full: 'pose_landmarker_full.task',
  heavy: 'pose_landmarker_heavy.task',
};

export const LOCAL = import.meta.env.VITE_LOCAL_MODELS === '1';

/** FilesetResolver 需要的目录，里面必须同时有 simd 与 nosimd 两套 wasm */
export const WASM_BASE = LOCAL ? '/mediapipe/wasm' : `${VISION_CDN}/wasm`;

export function modelUrl(model: PoseModel): string {
  const file = MODEL_FILES[model];
  if (LOCAL) return `/models/${file}`;
  const variant = model === 'heavy' ? 'pose_landmarker_heavy' : model === 'full' ? 'pose_landmarker_full' : 'pose_landmarker_lite';
  return `${MODEL_CDN}/${variant}/float16/1/${file}`;
}

/** 三档模型的体积（字节），来自原站构建清单，用于 UI 提示下载耗时 */
export const MODEL_BYTES: Record<PoseModel, number> = {
  lite: 5_777_746,
  full: 9_398_198,
  heavy: 30_664_242,
};

export const VISION_MODULE_URL = LOCAL
  ? '/mediapipe/vision_bundle.mjs'
  : `${VISION_CDN}/vision_bundle.mjs`;
