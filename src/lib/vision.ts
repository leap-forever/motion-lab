/**
 * MediaPipe Tasks Vision 封装。
 *
 * 原站把整个 WASM glue（约 97KB 的 Emscripten 运行时）打进了自己的
 * vision-CD0XLpSO.js，模型 .task 单独自托管。教学版用 CDN 动态 import，
 * 逻辑等价但更好读：
 *
 *   FilesetResolver.forVisionTasks(wasmDir)  → 里面自动探测 SIMD，
 *       选 vision_wasm_internal.wasm 或 vision_wasm_nosimd_internal.wasm
 *   PoseLandmarker.createFromOptions({ runningMode:'VIDEO', delegate })
 *   → detectForVideo(video, 单调递增的时间戳)
 *
 * 关键坑（原站也踩过）：
 *   - VIDEO 模式的时间戳必须严格递增，否则 MediaPipe 直接抛异常；
 *   - delegate:'GPU' 依赖 WebGL2，软渲染/禁用显卡时会失败，必须 catch 后回落 CPU；
 *   - 模型下载失败会返回 HTML 错误页，要检查 Content-Type（本地化脚本里做了）。
 */
import { modelUrl, WASM_BASE, VISION_MODULE_URL, type PoseModel } from './config';
import type { Point } from './landmarks';

interface LandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): {
    poseLandmarks?: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
  };
  close(): void;
}

interface VisionModule {
  FilesetResolver: { forVisionTasks: (base: string) => Promise<unknown> };
  PoseLandmarker: {
    createFromOptions: (fileset: unknown, opts: Record<string, unknown>) => Promise<LandmarkerLike>;
  };
}

export type LoadStage = 'module' | 'wasm' | 'model' | 'ready' | 'error';

export interface LoadOptions {
  model: PoseModel;
  /** 单人给 2、双人给 3：多留一个检测槽位，两人靠近时不容易丢 */
  numPoses?: number;
  onStage?: (stage: LoadStage, message: string) => void;
}

export class PoseDetector {
  private landmarker: LandmarkerLike | null = null;
  private lastTs = 0;
  model: PoseModel = 'lite';
  delegate: 'GPU' | 'CPU' | null = null;

  get ready(): boolean { return this.landmarker !== null; }

  async load(opts: LoadOptions): Promise<void> {
    const report = opts.onStage ?? (() => {});
    this.close();

    report('module', '加载 tasks-vision ESM 模块…');
    let mod: VisionModule;
    try {
      // VISION_MODULE_URL 是运行期绝对 URL（同源 /mediapipe/... 或 CDN），
      // 加上 vite-ignore / webpackIgnore：让任何打包器都别尝试静态解析这条 import。
      mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ VISION_MODULE_URL) as unknown as VisionModule;
    } catch (err) {
      report('error', '推理模块加载失败');
      throw new Error(`tasks-vision 模块加载失败：${String(err)}`);
    }

    report('wasm', '解析 WASM 目录（自动选 SIMD / nosimd）…');
    let fileset: unknown;
    try {
      fileset = await mod.FilesetResolver.forVisionTasks(WASM_BASE);
    } catch (err) {
      report('error', 'WASM 初始化失败');
      throw new Error(`WASM 初始化失败：${String(err)}`);
    }

    report('model', `下载 ${opts.model} 姿态模型…`);
    const create = (delegate: 'GPU' | 'CPU') =>
      mod.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl(opts.model), delegate },
        runningMode: 'VIDEO',
        numPoses: opts.numPoses ?? 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });

    try {
      this.landmarker = await create('GPU');
      this.delegate = 'GPU';
    } catch (err) {
      console.warn('[vision] GPU delegate 不可用，回落 CPU', err);
      try {
        this.landmarker = await create('CPU');
        this.delegate = 'CPU';
      } catch (err2) {
        report('error', '模型加载失败');
        throw new Error(`姿态模型加载失败：${String(err2)}`);
      }
    }

    this.model = opts.model;
    report('ready', `就绪 · ${this.delegate} · ${opts.model}`);
  }

  /** 返回每个人一组 33 点；调用方负责镜像、平滑、特征提取 */
  detect(video: HTMLVideoElement, nowMs: number): Point[][] {
    if (!this.landmarker) return [];
    const ts = Math.max(Math.round(nowMs), this.lastTs + 1);
    this.lastTs = ts;
    try {
      const result = this.landmarker.detectForVideo(video, ts);
      return (result.poseLandmarks ?? []).map((person) =>
        person.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 })),
      );
    } catch (err) {
      console.warn('[vision] 本帧推理失败', err);
      return [];
    }
  }

  close(): void {
    try { this.landmarker?.close(); } catch { /* 忽略重复释放 */ }
    this.landmarker = null;
    this.lastTs = 0;
    this.delegate = null;
  }
}
