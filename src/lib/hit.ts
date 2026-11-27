/**
 * 命中判定 —— 纯几何，不依赖 canvas / WASM / DOM，因此可以直接单测。
 *
 * 本项目的「碰撞」不是刚体相撞，而是「一个带抖动的采样点是否落进触发区域」：
 *   - 关键点由 MediaPipe 给出，归一化 0..1 且只在推理帧更新（默认 24fps）；
 *   - 物体存的是 1280×720 世界像素坐标，形状只有一个半径 r。
 *
 * 所以这里只提供点/线段与圆、点与矩形的判定，没有宽相、没有碰撞层、
 * 也没有冲量求解。线段判定用「上一推理帧 → 当前推理帧」扫掠，补上低推理
 * 帧率下手部跨过物体造成的漏判（tunneling）。
 */
import { HIT, type HitMode, type HitTuning } from './config';
import { LOGICAL_H, LOGICAL_W } from './stage';

export interface Vec2 {
  x: number;
  y: number;
}

/** 归一化关键点 → 世界像素；x/y 分别缩放，与 stage.ts 的逻辑矩形一致 */
export function toWorld(p: Vec2): Vec2 {
  return { x: p.x * LOGICAL_W, y: p.y * LOGICAL_H };
}

/** 点是否落在圆内（含边界） */
export function circleHit(p: Vec2, center: Vec2, r: number): boolean {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return dx * dx + dy * dy <= r * r;
}

export interface Contact {
  /** 首次接触在 [from,to] 上的参数，0..1 */
  t: number;
  /** 首次接触点（世界像素） */
  x: number;
  y: number;
}

/**
 * 线段 [from,to] 与圆是否相交。
 *
 * 解 |from + t·d - c|² = r² 的二次方程 a·t² + b·t + c0 = 0：
 *   - a≈0（同一推理帧被多个 rAF 帧复用时）退化为点判定；
 *   - c0<=0 表示起点已在圆内；
 *   - 命中条件为两根与 [0,1] 有交集：t2>=0 && t1<=1。
 * 返回首次接触参数，方便日后把粒子打在接触点；未命中返回 null。
 */
export function segmentCircleHit(
  from: Vec2, to: Vec2, center: Vec2, r: number,
): Contact | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const a = dx * dx + dy * dy;

  if (a < 1e-9) {
    return circleHit(from, center, r) ? { t: 0, x: from.x, y: from.y } : null;
  }

  const c0 = fx * fx + fy * fy - r * r;
  if (c0 <= 0) return { t: 0, x: from.x, y: from.y };

  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c0;
  if (disc < 0) return null;

  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  if (t2 < 0 || t1 > 1) return null;

  const t = Math.max(0, Math.min(1, t1));
  return { t, x: from.x + dx * t, y: from.y + dy * t };
}

/** 矩形包含判定；省略的边视为无限远。用严格不等号，保持与原有判定一致 */
export interface RectBounds {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export function insideRect(p: Vec2, b: RectBounds): boolean {
  return (b.left === undefined || p.x > b.left)
    && (b.right === undefined || p.x < b.right)
    && (b.top === undefined || p.y > b.top)
    && (b.bottom === undefined || p.y < b.bottom);
}

/**
 * 躯干缩放系数：站得近（torso 大）时手部定位误差在屏幕上更大，容差同步放大。
 * 默认体态 torso=0.25 时恰为 1，保证 legacy 模式与优化前数值完全一致。
 */
export function torsoFactor(torso: number): number {
  const [lo, hi] = HIT.TORSO_CLAMP;
  // 关键点偶发无效值时退回默认体态，别让容差变成 NaN 把本帧判定全废掉
  if (!Number.isFinite(torso) || torso <= 0) return 1;
  return Math.max(lo, Math.min(hi, torso / HIT.BASE_TORSO));
}

/**
 * 命中半径。
 *   - legacy：r + 容差×躯干缩放，复现原来的宽松手感（判定比看到的大一圈）；
 *   - aligned：spriteScale/2 × r，严格等于绘制出来的视觉半径，所见即所得。
 */
export function hitRadius(r: number, cfg: HitTuning, torso: number, mode: HitMode): number {
  if (mode === 'aligned') return cfg.spriteScale / 2 * r;
  return r + cfg.tolerance * torsoFactor(torso);
}
