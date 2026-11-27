import { describe, expect, it } from 'vitest';
import { HIT } from './config';
import {
  circleHit, hitRadius, insideRect, segmentCircleHit, toWorld, torsoFactor,
} from './hit';
import { LOGICAL_H, LOGICAL_W } from './stage';

const p = (x: number, y: number) => ({ x, y });
const origin = p(0, 0);

describe('toWorld', () => {
  it('把归一化关键点映射到 1280×720 世界像素', () => {
    expect(toWorld(p(0, 0))).toEqual(p(0, 0));
    expect(toWorld(p(0.5, 0.5))).toEqual(p(LOGICAL_W / 2, LOGICAL_H / 2));
    expect(toWorld(p(1, 1))).toEqual(p(LOGICAL_W, LOGICAL_H));
  });
});

describe('circleHit', () => {
  const center = p(100, 100);

  it('圆内、边界（含）、圆外', () => {
    expect(circleHit(p(100, 100), center, 10)).toBe(true);
    expect(circleHit(p(110, 100), center, 10)).toBe(true);
    expect(circleHit(p(111, 100), center, 10)).toBe(false);
  });
});

describe('segmentCircleHit', () => {
  const r = 10;

  it('零长度线段退化为点判定（同一姿态被多个 rAF 帧复用时）', () => {
    expect(segmentCircleHit(origin, origin, origin, r)).toEqual({ t: 0, x: 0, y: 0 });
    expect(segmentCircleHit(p(50, 0), p(50, 0), origin, r)).toBeNull();
  });

  it('起点已在圆内立即命中', () => {
    expect(segmentCircleHit(p(0, 0), p(100, 0), origin, r)).toEqual({ t: 0, x: 0, y: 0 });
  });

  it('两端都在圆外但线段穿过圆，返回首次接触点', () => {
    const hit = segmentCircleHit(p(-50, 0), p(50, 0), origin, r);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.4);
    expect(hit!.x).toBeCloseTo(-10);
    expect(hit!.y).toBeCloseTo(0);
  });

  it('与圆相切也算命中', () => {
    expect(segmentCircleHit(p(-50, 10), p(50, 10), origin, r)).not.toBeNull();
  });

  it('线段背离圆不算命中', () => {
    expect(segmentCircleHit(p(20, 20), p(80, 20), origin, r)).toBeNull();
  });

  it('延长线经过圆但线段本身没走到（t>1）不算命中', () => {
    expect(segmentCircleHit(p(-50, 0), p(-20, 0), origin, r)).toBeNull();
  });

  it('接触点落在圆周上', () => {
    const hit = segmentCircleHit(p(-50, 5), p(50, 5), origin, r);
    expect(hit).not.toBeNull();
    expect(Math.hypot(hit!.x, hit!.y)).toBeCloseTo(r, 5);
  });

  it('捕捉低推理帧率下的隧穿：两个端点都漏判，线段判定命中', () => {
    const from = p(-60, 0);
    const to = p(60, 0);
    expect(circleHit(from, origin, r)).toBe(false);
    expect(circleHit(to, origin, r)).toBe(false);
    expect(segmentCircleHit(from, to, origin, r)).not.toBeNull();
  });
});

describe('insideRect', () => {
  const goal = { right: 96 + 20, top: 280, bottom: 500 };

  it('省略的边视为无限远，且用严格不等号', () => {
    expect(insideRect(p(100, 300), goal)).toBe(true);
    expect(insideRect(p(-1e9, 300), goal)).toBe(true);
    expect(insideRect(p(116, 300), goal)).toBe(false);
    expect(insideRect(p(100, 280), goal)).toBe(false);
    expect(insideRect(p(100, 500), goal)).toBe(false);
  });
});

describe('torsoFactor', () => {
  it('默认体态为 1，站近变大、站远变小', () => {
    expect(torsoFactor(0.25)).toBe(1);
    expect(torsoFactor(0.5)).toBe(2);
    expect(torsoFactor(0.125)).toBe(0.5);
  });

  it('极端值被 clamp，无效输入回退默认体态', () => {
    expect(torsoFactor(0.08)).toBe(0.5);
    expect(torsoFactor(1)).toBe(2);
    expect(torsoFactor(0)).toBe(1);
    expect(torsoFactor(NaN)).toBe(1);
    expect(torsoFactor(Infinity)).toBe(1);
  });
});

describe('hitRadius', () => {
  it('legacy 在默认体态下与优化前的 r+容差 完全一致', () => {
    expect(hitRadius(52, HIT.fruitSlash, 0.25, 'legacy')).toBe(52 + 74);
    expect(hitRadius(46, HIT.bubblePop, 0.25, 'legacy')).toBe(46 + 30);
    expect(hitRadius(40, HIT.soccerKick, 0.25, 'legacy')).toBe(40 + 44);
  });

  it('legacy 的容差随躯干缩放', () => {
    expect(hitRadius(52, HIT.fruitSlash, 0.5, 'legacy')).toBe(52 + 74 * 2);
    expect(hitRadius(52, HIT.fruitSlash, 0.125, 'legacy')).toBe(52 + 74 * 0.5);
  });

  it('aligned 严格等于 sprite 视觉半径，不受容差与躯干影响', () => {
    expect(hitRadius(52, HIT.fruitSlash, 0.25, 'aligned')).toBeCloseTo(52 * 2.4 / 2);
    expect(hitRadius(52, HIT.fruitSlash, 0.5, 'aligned')).toBeCloseTo(52 * 2.4 / 2);
    expect(hitRadius(40, HIT.soccerKick, 0.25, 'aligned')).toBeCloseTo(40 * 2.2 / 2);
  });
});
