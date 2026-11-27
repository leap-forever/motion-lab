/**
 * 卡通替身（P1：极简几何人偶）—— 摄像头画面只提供动作，画面上画小人。
 *
 * 渲染坐标全部取自 33 个关键点，判定链路（hit.ts / features.ts）完全不动：
 * 平滑只发生在渲染这条支路上，判定仍吃原始关键点，手与替身的手天然重合。
 *
 * 两级平滑是观感核心（姿态数据只有推理帧率，默认 24fps）：
 *   1. PoseSmoother：推理帧之间的指数平滑（EMA），压掉模型抖动；
 *   2. 渲染帧之间的追赶插值（chase），把 24fps 的姿态拉成 60fps 的连续动作。
 */
import { LM, torsoSize, visible, type Point } from './landmarks';
import { LOGICAL_H, LOGICAL_W } from './stage';

/** 渲染帧向平滑目标追赶的比例：0.35 ≈ 每 rAF 帧追 35% */
const CHASE_K = 0.35;
/** EMA 时间常数：越大越跟手、越小越稳，10 是「跟手且不抖」的折中 */
const SMOOTH_TAU = 10;
/** 最多渲染两个替身，与 numPoses 默认值一致 */
const MAX_SLOTS = 2;

/** 追赶插值：a 向 b 靠拢 k 比例 */
export function chase(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** 帧率无关的指数平滑系数：dt 越大窗越宽（与 MotionTracker 的套路一致） */
export function smoothK(dtSec: number, tau: number = SMOOTH_TAU): number {
  const dt = Math.max(0.001, Math.min(0.2, dtSec));
  return 1 - Math.exp(-dt * tau);
}

/**
 * 单人姿态的指数平滑器。
 * 可见性不过关的点冻结旧值（MediaPipe 对被遮挡的肢体常给出飘忽坐标），
 * 丢人时保留最后一帧（外层用 fade 控制淡出，避免闪断）。
 */
export class PoseSmoother {
  private pts: Point[] | null = null;

  push(person: Point[] | null, dtSec: number): void {
    if (!person || person.length < 33) return; // 丢人：保留旧姿态
    const prev = this.pts;
    if (!prev || prev.length < 33) {
      this.pts = person.map((p) => ({ x: p.x, y: p.y }));
      return;
    }
    const k = smoothK(dtSec);
    this.pts = prev.map((p, i) => {
      const raw = person[i];
      if (!raw || !visible(raw)) return { x: p.x, y: p.y }; // 冻结不可见点
      return { x: chase(p.x, raw.x, k), y: chase(p.y, raw.y, k) };
    });
  }

  get(): Point[] | null {
    return this.pts;
  }

  reset(): void {
    this.pts = null;
  }
}

export interface AvatarStyle {
  skin: string;
  shirt: string;
  pants: string;
  glove: string;
  shoe: string;
  hair: string;
}

/** 双人两套配色，槽位按顺序取用 */
export const AVATAR_STYLES: AvatarStyle[] = [
  { skin: '#ffd9b3', shirt: '#4d96ff', pants: '#2b2140', glove: '#ffffff', shoe: '#ff8c42', hair: '#3b2b20' },
  { skin: '#f2c09a', shirt: '#6bcb77', pants: '#34304a', glove: '#ffffff', shoe: '#a66cff', hair: '#17141f' },
];

/** 地面线：与足球 GROUND_Y≈560、跳绳地面参考同一量级 */
const GROUND_LINE = LOGICAL_H * 0.78;

/** avatar 模式的自绘背景：天空渐变 + 草地色带（P1 统一一种，游戏滤镜会再罩色） */
export function drawBackdrop(ctx: CanvasRenderingContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  sky.addColorStop(0, '#8fd0ff');
  sky.addColorStop(1, '#eaf6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.fillStyle = '#b9e2a8';
  ctx.fillRect(0, GROUND_LINE, LOGICAL_W, LOGICAL_H - GROUND_LINE);
  ctx.fillStyle = '#a3d492';
  ctx.fillRect(0, GROUND_LINE, LOGICAL_W, 6);
}

interface Vec { x: number; y: number }

function at(pts: Point[], idx: number): Vec {
  const p = pts[idx];
  return { x: p.x * LOGICAL_W, y: p.y * LOGICAL_H };
}

function mid(pts: Point[], a: number, b: number): Vec {
  const p = at(pts, a);
  const q = at(pts, b);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/** 胶囊肢体：粗圆头线条一段就是一条「胳膊 / 腿」 */
function capsule(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, w: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** 画一个人偶：腿 → 躯干 → 手臂 → 手脚 → 影子画最底、头画最上 */
function drawPerson(ctx: CanvasRenderingContext2D, pts: Point[], style: AvatarStyle, fade: number): void {
  const u = torsoSize(pts) * LOGICAL_H; // 世界像素单位：躯干长度
  ctx.save();
  ctx.globalAlpha = fade;

  // 影子：脚下的椭圆，人越「跳起来」越浅（P1 固定透明度）
  const la = at(pts, LM.leftAnkle);
  const ra = at(pts, LM.rightAnkle);
  ctx.fillStyle = 'rgba(20,40,20,0.18)';
  ctx.beginPath();
  ctx.ellipse((la.x + ra.x) / 2, Math.max(la.y, ra.y) + u * 0.04, u * 0.45, u * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // 腿（先画，被躯干盖住根部）
  capsule(ctx, at(pts, LM.leftHip), at(pts, LM.leftKnee), u * 0.20, style.pants);
  capsule(ctx, at(pts, LM.leftKnee), at(pts, LM.leftAnkle), u * 0.16, style.pants);
  capsule(ctx, at(pts, LM.rightHip), at(pts, LM.rightKnee), u * 0.20, style.pants);
  capsule(ctx, at(pts, LM.rightKnee), at(pts, LM.rightAnkle), u * 0.16, style.pants);

  // 躯干：肩中点 → 髋中点
  capsule(ctx, mid(pts, LM.leftShoulder, LM.rightShoulder), mid(pts, LM.leftHip, LM.rightHip), u * 0.34, style.shirt);

  // 手臂
  capsule(ctx, at(pts, LM.leftShoulder), at(pts, LM.leftElbow), u * 0.15, style.shirt);
  capsule(ctx, at(pts, LM.leftElbow), at(pts, LM.leftWrist), u * 0.13, style.shirt);
  capsule(ctx, at(pts, LM.rightShoulder), at(pts, LM.rightElbow), u * 0.15, style.shirt);
  capsule(ctx, at(pts, LM.rightElbow), at(pts, LM.rightWrist), u * 0.13, style.shirt);

  // 手（手套圆）与脚（鞋椭圆）
  ctx.fillStyle = style.glove;
  for (const idx of [LM.leftWrist, LM.rightWrist]) {
    const p = at(pts, idx);
    ctx.beginPath();
    ctx.arc(p.x, p.y, u * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = style.shoe;
  for (const idx of [LM.leftAnkle, LM.rightAnkle]) {
    const p = at(pts, idx);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + u * 0.03, u * 0.10, u * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 头：皮肤圆 + 上半头发 + 两眼 + 微笑
  const nose = at(pts, LM.nose);
  const r = u * 0.21;
  ctx.fillStyle = style.skin;
  ctx.beginPath();
  ctx.arc(nose.x, nose.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.hair;
  ctx.beginPath();
  ctx.arc(nose.x, nose.y, r * 1.02, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#262033';
  for (const dx of [-0.36, 0.36]) {
    ctx.beginPath();
    ctx.arc(nose.x + r * dx, nose.y - r * 0.05, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#b25b4a';
  ctx.lineWidth = Math.max(1.5, u * 0.014);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(nose.x, nose.y + r * 0.28, r * 0.32, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  ctx.restore();
}

interface Slot {
  smoother: PoseSmoother;
  /** 渲染位置：每 rAF 帧向平滑目标追 35% */
  display: Point[] | null;
  /** 最近一次推理里这个槽位是否有人 */
  seen: boolean;
  /** 整体透明度：有人淡入、离场淡出 */
  fade: number;
}

/**
 * 替身渲染器。controller 在推理帧里 push(persons)，游戏在 draw 里调用
 * draw(ctx)（世界层坐标系，与骨架/物体同源）。avatar 模式关闭时传 null 即可。
 */
export class AvatarRenderer {
  private slots: Slot[] = Array.from({ length: MAX_SLOTS }, () => ({
    smoother: new PoseSmoother(),
    display: null as Point[] | null,
    seen: false,
    fade: 0,
  }));

  /** 每个推理帧调用一次；persons 是已镜像的多人骨架 */
  push(persons: Point[][], dtSec: number): void {
    for (let i = 0; i < MAX_SLOTS; i += 1) {
      const s = this.slots[i];
      const person = persons[i];
      s.seen = !!person && person.length >= 33;
      if (s.seen) s.smoother.push(person, dtSec);
    }
  }

  /** 每个渲染帧调用：渲染位置向平滑目标追赶 + 画人偶 */
  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < MAX_SLOTS; i += 1) {
      const s = this.slots[i];
      const target = s.smoother.get();
      if (!target) { s.display = null; s.fade = 0; continue; }
      if (!s.display) {
        s.display = target.map((p) => ({ x: p.x, y: p.y }));
      } else {
        s.display = s.display.map((p, j) => ({
          x: chase(p.x, target[j].x, CHASE_K),
          y: chase(p.y, target[j].y, CHASE_K),
        }));
      }
      s.fade = chase(s.fade, s.seen ? 1 : 0, 0.12);
      if (s.fade < 0.02) continue;
      drawPerson(ctx, s.display, AVATAR_STYLES[i % AVATAR_STYLES.length], s.fade);
    }
  }

  reset(): void {
    for (const s of this.slots) {
      s.smoother.reset();
      s.display = null;
      s.seen = false;
      s.fade = 0;
    }
  }
}
