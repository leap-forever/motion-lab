/**
 * 游戏注册表 —— 把 game id 映射到具体的 Game 实现。
 *
 * 控制器不关心具体是哪个游戏，只要拿到 id 就能从这里造一个实例，
 * 新增游戏只需实现 Game 接口并在这里登记一行。
 */
import type { Game } from './types';
import { FruitSlash } from './fruitSlash';
import { JumpRope } from './jumpRope';
import { SoccerKick } from './soccerKick';
import { BubblePop } from './bubblePop';

export type GameFactory = () => Game;

export const GAME_REGISTRY: Record<string, GameFactory> = {
  'fruit-slash': () => new FruitSlash(),
  'jump-rope': () => new JumpRope(),
  'soccer-kick': () => new SoccerKick(),
  'bubble-pop': () => new BubblePop(),
};

/** 按 id 创建游戏；未知 id 回退到切水果 */
export function createGame(id: string): Game {
  return (GAME_REGISTRY[id] ?? GAME_REGISTRY['fruit-slash'])();
}
