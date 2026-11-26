/**
 * 游戏清单与服务端常量。由 server/index.mjs 抽出，供 Route Handlers 共享。
 */

export interface GameInfo {
  id: string;
  name: string;
  nameEn: string;
  age: number[];
  type: string;
  energy: string;
  duration: number;
  stars: number[];
  shot: string;
  desc: string;
  playable: boolean;
}

export const BUILD = 'lab-0.1.0';

export const GAMES: GameInfo[] = [
  {
    id: 'fruit-slash', name: '切水果', nameEn: 'Fruit Slash', age: [6, 14],
    type: 'hands', energy: 'moderate', duration: 45, stars: [6, 12, 20],
    shot: '/assets/shots/fruit-slash.jpg',
    desc: '挥手切开飞起来的水果，别碰到炸弹。', playable: true,
  },
  {
    id: 'jump-rope', name: '跳绳冠军', nameEn: 'Jump Rope Champ', age: [6, 14],
    type: 'legs', energy: 'high', duration: 60, stars: [10, 20, 35],
    shot: '/assets/shots/jump-rope.jpg',
    desc: '绳子扫到脚下时起跳，连击越长节奏越快。', playable: false,
  },
  {
    id: 'soccer-kick', name: '足球射门', nameEn: 'Soccer Shootout', age: [4, 10],
    type: 'legs', energy: 'high', duration: 45, stars: [4, 8, 14],
    shot: '/assets/shots/soccer-kick.jpg',
    desc: '用脚、膝盖和头把球顶进球门，不能用手。', playable: false,
  },
  {
    id: 'bubble-pop', name: '戳泡泡', nameEn: 'Bubble Pop', age: [3, 7],
    type: 'hands', energy: 'light', duration: 45, stars: [8, 15, 24],
    shot: '/assets/shots/bubble-pop.jpg',
    desc: '伸手戳破小青蛙吹出来的泡泡。', playable: false,
  },
];

export function starsFor(game: GameInfo, score: number): number {
  const [one, two, three] = game.stars;
  return score >= three ? 3 : score >= two ? 2 : score >= one ? 1 : 0;
}
