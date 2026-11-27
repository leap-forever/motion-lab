import type { HitMode } from '../lib/config';
import type { BodyFeatures } from '../lib/features';
import type { Point } from '../lib/landmarks';
import type { Stage } from '../lib/stage';

export interface Slash {
  /** 归一化坐标 0..1 */
  x: number; y: number; power: number;
  /** 对应 features.wrist 的下标，用来取上一推理帧的同名关键点 */
  hand: 0 | 1;
  /** 该手上一推理帧的位置；null 表示首帧/刚恢复，退化为点判定 */
  from: Point | null;
}

export interface GameFrame {
  dt: number;
  now: number;
  features: BodyFeatures;
  /** 每个人 33 点，已镜像 */
  points: Point[][];
  /** 本帧识别到的「挥手」点；只在推理帧重算，其余 rAF 帧沿用 */
  slashes: Slash[];
  /** 本帧对应的推理帧序号。同一姿态被多个 rAF 帧复用，用它做命中去重 */
  poseSeq: number;
  /** 命中判定模式：宽松（默认）/ 与视觉一致 */
  hitMode: HitMode;
  /** 上一推理帧的第 0 人骨架（已镜像）；线段扫掠靠它消除低帧率隧穿 */
  prevPerson: Point[] | null;
  showSkeleton: boolean;
}

/** 一个游戏只需要实现这层接口，就能挂进统一的主循环 */
export interface Game {
  readonly durationSec: number;
  readonly stars: readonly [number, number, number];
  readonly score: number;
  readonly timeLeft: number;
  readonly combo: number;
  readonly finished: boolean;
  readonly feedback: string;
  update(frame: GameFrame): void;
  draw(stage: Stage): void;
  dispose(): void;
}
