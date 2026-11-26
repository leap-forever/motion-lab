/**
 * 主循环控制器 —— 把采集、节流、推理、特征、游戏、渲染串成一条线。
 *
 * 原站 PlayPage-_ETwNuvX.js 里也有个差不多的大 class（phase / raf /
 * last / framing / stats…）。这里保留同样职责，但把每层拆到独立文件，
 * 方便单独读、单独改。
 *
 *   rAF(60Hz)  ←→  摄像头(约30Hz)  ←→  推理(受 FrameGate 限制)
 *   三者时钟不同步是常态，所以推理结果用 MotionTracker 平滑后再喂游戏，
 *   游戏渲染仍跟 rAF 走，画面不会因为推理慢而掉帧。
 */
import { openCamera, measureFps, probeSimd, probeWebGL2, type CameraHandle } from './camera';
import { FrameGate } from './frameGate';
import { PoseDetector } from './vision';
import { MotionTracker, slashHits, EMPTY_FEATURES, type BodyFeatures } from './features';
import { mirrored, type Point } from './landmarks';
import { analyseLighting, checkFraming } from './framing';
import { Stage } from './stage';
import type { PoseModel } from './config';
import { FruitSlash } from '../games/fruitSlash';

export interface Settings {
  model: PoseModel;
  targetFps: number;
  showSkeleton: boolean;
  cameraId?: string;
  numPoses: number;
}

export const DEFAULT_SETTINGS: Settings = {
  model: 'lite', targetFps: 24, showSkeleton: true, numPoses: 2,
};

const SETTINGS_KEY = 'motion-lab:settings';

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export type Phase = 'idle' | 'loading' | 'running' | 'finished' | 'error';

export interface RuntimeState {
  phase: Phase;
  message: string;
  camFps: number;
  inferFps: number;
  delegate: string;
  simd: boolean;
  gpu: string;
  poseModel: PoseModel;
  score: number;
  timeLeft: number;
  combo: number;
  feedback: string;
  framing: string;
  lighting: string;
  error: string;
  persons: number;
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { presentedFrames?: number }) => void) => number;
};

export class PlayController {
  private canvas: HTMLCanvasElement;
  private video: HTMLVideoElement;
  private settings: Settings;
  private onState: (patch: Partial<RuntimeState>) => void;
  private onFinish: (score: number, durationMs: number) => void;

  private cam: CameraHandle | null = null;
  private detector = new PoseDetector();
  private gate = new FrameGate();
  private tracker = new MotionTracker();
  private stage: Stage | null = null;
  private game: FruitSlash | null = null;
  private raf = 0;
  private last = 0;
  private lastInfer = 0;
  private lastReport = 0;
  private lastLighting = 0;
  private lastVideoTime = -1;
  private hasRVFC = false;
  private features: BodyFeatures = { ...EMPTY_FEATURES };
  private persons: Point[][] = [];
  private inferWindow: number[] = [];
  private sampleCanvas: HTMLCanvasElement | null = null;
  private running = false;

  constructor(opts: {
    canvas: HTMLCanvasElement;
    video: HTMLVideoElement;
    settings: Settings;
    onState: (patch: Partial<RuntimeState>) => void;
    onFinish: (score: number, durationMs: number) => void;
  }) {
    this.canvas = opts.canvas;
    this.video = opts.video;
    this.settings = opts.settings;
    this.onState = opts.onState;
    this.onFinish = opts.onFinish;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const say = (message: string) => this.onState({ phase: 'loading', message });

    try {
      const [simd, gpu] = await Promise.all([probeSimd(), Promise.resolve(probeWebGL2())]);
      this.onState({ simd, gpu: gpu.ok ? (gpu.software ? `${gpu.renderer}（软渲染）` : gpu.renderer || 'WebGL2') : '不可用' });

      say('请求摄像头权限…');
      this.cam = await openCamera(this.settings.cameraId, this.video);

      say('测量摄像头真实帧率…');
      const camFps = await measureFps(this.video, 900);
      this.onState({ camFps: Math.round(camFps) });
      if (camFps < 12) say(`摄像头只有 ${Math.round(camFps)} fps，动作可能跟不上`);

      this.detector = new PoseDetector();
      await this.detector.load({
        model: this.settings.model,
        numPoses: this.settings.numPoses,
        onStage: (_s, message) => say(message),
      });
      this.onState({ delegate: this.detector.delegate || 'CPU', poseModel: this.settings.model });

      this.stage = new Stage(this.canvas);
      this.game = new FruitSlash();
      this.gate.reset();
      this.tracker.reset();
      this.attachFrameClock();

      this.onState({ phase: 'running', message: '就绪，挥手切水果！' });
      this.last = performance.now();
      this.lastInfer = this.last;
      this.raf = requestAnimationFrame(this.loop);
    } catch (err) {
      this.running = false;
      this.onState({ phase: 'error', error: String((err as Error)?.message || err), message: '启动失败' });
      this.stop();
    }
  }

  /** 摄像头每送来一帧，通知 FrameGate（带帧号，最准） */
  private attachFrameClock(): void {
    const v = this.video as VideoWithRVFC;
    if (typeof v.requestVideoFrameCallback === 'function') {
      this.hasRVFC = true;
      const cb = (_now: number, meta: { presentedFrames?: number }) => {
        if (!this.running) return;
        this.gate.frame(performance.now(), meta.presentedFrames ?? null);
        v.requestVideoFrameCallback!(cb);
      };
      v.requestVideoFrameCallback(cb);
    }
  }

  private loop = (now: number): void => {
    if (!this.running || !this.game || !this.stage) return;
    const dt = Math.max(0.001, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;

    // 没有 RVFC 的浏览器：用 currentTime 变化近似「新帧到达」
    if (!this.hasRVFC && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      this.gate.frame(now, null);
    }

    if (this.gate.due(now, this.settings.targetFps)) {
      const dtInfer = Math.max(0.001, (now - this.lastInfer) / 1000);
      this.lastInfer = now;
      const raw = this.detector.detect(this.video, now);
      // 自拍镜像：玩家往左挥，屏幕上的手也往左
      this.persons = raw.map(mirrored);
      this.features = this.tracker.push(this.persons[0] ?? null, dtInfer);
      this.inferWindow.push(now);
    }

    // 光照每 400ms 算一次（扫描 64×36 缩略图，很便宜）
    if (now - this.lastLighting > 400) {
      this.lastLighting = now;
      const light = this.sampleLighting();
      if (light) this.onState({ lighting: light });
      const framing = checkFraming(this.persons[0] ?? [], { near: true });
      this.onState({ framing: framing.ok ? '站位 OK' : framing.text });
    }

    this.game.update({
      dt, now,
      features: this.features,
      points: this.persons,
      slashes: slashHits(this.features),
      showSkeleton: this.settings.showSkeleton,
    });
    this.game.draw(this.stage);

    // 状态回传节流：别让 React 每帧 re-render
    if (now - this.lastReport > 160) {
      this.lastReport = now;
      this.inferWindow = this.inferWindow.filter((t) => now - t < 1000);
      this.onState({
        score: this.game.score,
        timeLeft: Math.ceil(this.game.timeLeft),
        combo: this.game.combo,
        feedback: this.game.feedback,
        inferFps: this.inferWindow.length,
        camFps: Math.round(this.gate.camFps || 0),
        persons: this.persons.length,
      });
    }

    if (this.game.finished) {
      this.running = false;
      this.onState({ phase: 'finished', message: '本局结束' });
      this.onFinish(this.game.score, Math.round(this.game.durationSec * 1000));
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private sampleLighting(): string | null {
    try {
      if (!this.sampleCanvas) {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 36;
        this.sampleCanvas = c;
      }
      const ctx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(this.video, 0, 0, 64, 36);
      const info = analyseLighting(ctx.getImageData(0, 0, 64, 36));
      return info.issue ? info.text : '';
    } catch {
      return null;
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.cam?.stop();
    this.cam = null;
    this.detector.close();
    this.stage?.dispose();
    this.stage = null;
    this.game?.dispose();
    this.game = null;
    if (this.video.srcObject) this.video.srcObject = null;
  }
}
