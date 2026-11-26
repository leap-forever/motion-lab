import type { BodyFeatures } from '../lib/features';
import type { Point } from '../lib/landmarks';
import type { Stage } from '../lib/stage';

export interface Slash {
  /** 归一化坐标 0..1 */
  x: number; y: number; power: number;
}

export interface GameFrame {
  dt: number;
  now: number;
  features: BodyFeatures;
  /** 每个人 33 点，已镜像 */
  points: Point[][];
  /** 本帧识别到的「挥手」点 */
  slashes: Slash[];
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
