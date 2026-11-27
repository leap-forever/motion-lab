/**
 * 资源来源配置。
 *
 * 原站的做法（从它的 assets-DwOKvwpk.js 里能直接读到）：
 *   - WASM 和 .task 模型自托管在 /mediapipe/wasm/、/models/，URL 带 ?v=内容hash；
 *   - 每份 WASM 还登记了一个 registry.npmmirror.com 镜像，国内用户优先走镜像；
 *   - Service Worker 把两份都缓存下来，所以装过一次之后断网也能玩。
 *
 * 教学版默认走公共 CDN（开箱即跑、不用先下几十 MB）。
 * `npm run offline` 把全套资源落到 public/ 后，vite.config.ts 会在构建时
 * 注入 __LOCAL_MODELS__=true，这里就自动切到同源路径，无需手动设环境变量。
 * 想强制回 CDN：VITE_LOCAL_MODELS=0 npm run build。
 */
export const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
export const MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';

export type PoseModel = 'lite' | 'full' | 'heavy';

export const MODEL_FILES: Record<PoseModel, string> = {
  lite: 'pose_landmarker_lite.task',
  full: 'pose_landmarker_full.task',
  heavy: 'pose_landmarker_heavy.task',
};

/**
 * 本地化开关。
 * next.config.ts 在构建期探测 public/ 离线资源，把结果注入为
 * NEXT_PUBLIC_LOCAL_MODELS（'1' / '0'）—— Next.js 会把它打进浏览器端。
 * 想强制回 CDN：NEXT_PUBLIC_LOCAL_MODELS=0 npm run build。
 */
const envLocal = process.env.NEXT_PUBLIC_LOCAL_MODELS;
export const LOCAL = envLocal === '1';

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

/**
 * 命中判定调参。原来散在四个游戏里的 r+74 / r+30 / r+44 和 sprite 的
 * r*2.4 / r*2.3 / r*2.2 收拢到这里，让「绘制多大」与「判定多大」同源。
 *
 * hitMode 由设置面板选择：
 *   - legacy（默认）：判定半径 = r + tolerance×躯干缩放，保留原来的宽松手感；
 *   - aligned：判定半径 = spriteScale/2 × r，严格等于视觉半径，所见即所得。
 */
export type HitMode = 'legacy' | 'aligned';

export interface HitTuning {
  /** drawSprite 的宽高 = r × spriteScale，因此视觉半径 = spriteScale/2 × r */
  spriteScale: number;
  /** legacy 模式的额外宽松量（世界像素，会随躯干缩放） */
  tolerance: number;
}

interface HitConfig {
  /** 与 EMPTY_FEATURES.torso / torsoSize 的默认体态一致 */
  BASE_TORSO: number;
  /** torso / BASE_TORSO 的上下限，防止贴镜头或站极远时失控 */
  TORSO_CLAMP: readonly [number, number];
  /** slashHits 的手速阈值（躯干长度/秒）与「手在画面上半区」限制 */
  slashSpeed: number;
  slashMaxY: number;
  fruitSlash: HitTuning;
  bubblePop: HitTuning;
  soccerKick: HitTuning;
}

export const HIT: HitConfig = {
  BASE_TORSO: 0.25,
  TORSO_CLAMP: [0.5, 2],
  slashSpeed: 1.6,
  slashMaxY: 0.75,
  fruitSlash: { spriteScale: 2.4, tolerance: 74 },
  bubblePop: { spriteScale: 2.3, tolerance: 30 },
  soccerKick: { spriteScale: 2.2, tolerance: 44 },
};
