/**
 * 关键点 → 动作特征。
 *
 * 模型只给 33 个坐标，游戏不直接吃坐标：
 *   1. 所有位移先除以 torsoSize（躯干长度），站远站近、大人小孩才可比；
 *   2. 再除以 dt，得到「每秒多少个躯干长度」的速度；
 *   3. 最后做指数平滑，压掉关键点抖动。
 * 原站的 sim-*.js / poses-*.js 也是这个套路（poses chunk 里甚至存了
 * stand / T / Y / squat / wave 等姿势的角度模板）。
 */
import { HIT } from './config';
import { LM, centre, torsoSize, visible, type Point } from './landmarks';
import type { Slash } from '../games/types';

export interface BodyFeatures {
  present: boolean;
  /** 左右手速度，单位：躯干长度/秒 */
  handSpeed: [number, number];
  wrist: [Point | null, Point | null];
  /** 抬手高度，单位：躯干长度 */
  armLift: [number, number];
  jump: number;
  squat: number;
  lean: number;
  feetApart: number;
  centre: { x: number; y: number };
  torso: number;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export const EMPTY_FEATURES: BodyFeatures = {
  present: false, handSpeed: [0, 0], wrist: [null, null], armLift: [0, 0],
  jump: 0, squat: 0, lean: 0, feetApart: 0.5, centre: { x: 0.5, y: 0.5 }, torso: 0.25,
};

function raw(pts: Point[] | null, prev: Point[] | null, dt: number): BodyFeatures {
  if (!pts || pts.length < 33) return { ...EMPTY_FEATURES };
  const torso = torsoSize(pts);
  const c = centre(pts);
  const wrists: [Point, Point] = [pts[LM.leftWrist], pts[LM.rightWrist]];
  const prevWrists: [Point | undefined, Point | undefined] = [
    prev?.[LM.leftWrist], prev?.[LM.rightWrist],
  ];

  const handSpeed: [number, number] = [0, 0];
  const armLift: [number, number] = [0, 0];
  for (let i = 0; i < 2; i += 1) {
    const w = wrists[i];
    const shoulder = pts[i === 0 ? LM.leftShoulder : LM.rightShoulder];
    if (!w || !shoulder) continue;
    armLift[i] = clamp((shoulder.y - w.y) / torso, -1, 2);
    const pw = prevWrists[i];
    if (pw && dt > 0) {
      handSpeed[i] = Math.min(10, Math.hypot(w.x - pw.x, w.y - pw.y) / torso / dt);
    }
  }

  const ls = pts[LM.leftShoulder], rs = pts[LM.rightShoulder];
  const lh = pts[LM.leftHip], rh = pts[LM.rightHip];
  const la = pts[LM.leftAnkle], ra = pts[LM.rightAnkle];
  const shoulderX = ls && rs ? (ls.x + rs.x) / 2 : 0.5;
  const hipX = lh && rh ? (lh.x + rh.x) / 2 : 0.5;
  const legLen = (lh && la ? Math.hypot(lh.x - la.x, lh.y - la.y) : torso * 1.8) / torso;
  const prevC = prev && prev.length >= 33 ? centre(prev) : c;
  const vertical = dt > 0 ? (prevC.y - c.y) / torso / dt : 0;

  return {
    present: true,
    handSpeed,
    wrist: [visible(wrists[0]) ? wrists[0] : null, visible(wrists[1]) ? wrists[1] : null],
    armLift,
    jump: clamp(vertical / 1.8),
    squat: clamp((1.9 - legLen) / 0.8),
    lean: clamp((shoulderX - hipX) / torso, -2, 2),
    feetApart: la && ra ? clamp(Math.abs(la.x - ra.x) / torso, 0, 3) : 0.5,
    centre: c,
    torso,
  };
}

export class MotionTracker {
  private prev: Point[] | null = null;
  private smooth: BodyFeatures = { ...EMPTY_FEATURES };

  push(pts: Point[] | null, dtSec: number): BodyFeatures {
    const dt = Math.max(0.001, Math.min(0.2, dtSec));
    const r = raw(pts, this.prev, dt);
    // 指数平滑：与帧率无关，比「取最近 3 帧平均」稳
    const k = 1 - Math.exp(-dt * 12);
    const s = this.smooth;
    this.smooth = {
      ...r,
      handSpeed: [mix(s.handSpeed[0], r.handSpeed[0], k), mix(s.handSpeed[1], r.handSpeed[1], k)],
      armLift: [mix(s.armLift[0], r.armLift[0], k), mix(s.armLift[1], r.armLift[1], k)],
      jump: mix(s.jump, r.jump, k),
      squat: mix(s.squat, r.squat, k),
      lean: mix(s.lean, r.lean, k),
      feetApart: mix(s.feetApart, r.feetApart, k),
      centre: { x: mix(s.centre.x, r.centre.x, k), y: mix(s.centre.y, r.centre.y, k) },
      torso: mix(s.torso, r.torso, k),
    };
    this.prev = pts && pts.length >= 33 ? pts.map((p) => ({ ...p })) : null;
    return this.smooth;
  }

  reset(): void {
    this.prev = null;
    this.smooth = { ...EMPTY_FEATURES };
  }
}

/**
 * 切水果游戏用：任意一只手速度越过阈值，且手在画面上半区。
 * from 取上一推理帧的同名手腕，供游戏做线段扫掠；没有上一帧时为 null。
 */
export function slashHits(f: BodyFeatures, prevPerson: Point[] | null = null): Slash[] {
  const out: Slash[] = [];
  for (let i = 0; i < 2; i += 1) {
    const w = f.wrist[i];
    if (w && f.handSpeed[i] > HIT.slashSpeed && w.y < HIT.slashMaxY) {
      const idx = i === 0 ? LM.leftWrist : LM.rightWrist;
      const prev = prevPerson?.[idx];
      out.push({
        x: w.x,
        y: w.y,
        power: Math.min(1, f.handSpeed[i] / 5),
        hand: i as 0 | 1,
        from: prev && visible(prev) ? { x: prev.x, y: prev.y } : null,
      });
    }
  }
  return out;
}
