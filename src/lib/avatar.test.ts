import { describe, expect, it } from 'vitest';
import { AVATAR_STYLES, PoseSmoother, chase, smoothK } from './avatar';
import type { Point } from './landmarks';

function person(x = 0.5, y = 0.5): Point[] {
  return Array.from({ length: 33 }, () => ({ x, y }));
}

describe('chase', () => {
  it('按比例向目标逼近', () => {
    expect(chase(0, 10, 0.5)).toBe(5);
    expect(chase(0, 10, 0)).toBe(0);
    expect(chase(0, 10, 1)).toBe(10);
  });
});

describe('smoothK', () => {
  it('帧率无关：dt 越大系数越大，dt 很小时趋近 0', () => {
    expect(smoothK(0.001)).toBeLessThan(0.02);
    expect(smoothK(0.001)).toBeLessThan(smoothK(0.05));
    expect(smoothK(0.05)).toBeLessThan(smoothK(0.2));
    expect(smoothK(0.2)).toBeLessThanOrEqual(1);
  });
});

describe('PoseSmoother', () => {
  it('初始为空，首帧直接取值', () => {
    const s = new PoseSmoother();
    expect(s.get()).toBeNull();
    s.push(person(0.3, 0.4), 0.05);
    const got = s.get()!;
    expect(got.length).toBe(33);
    expect(got[0].x).toBeCloseTo(0.3);
    expect(got[0].y).toBeCloseTo(0.4);
  });

  it('指数收敛到新位置，不会一步跳到位', () => {
    const s = new PoseSmoother();
    s.push(person(0.2, 0.2), 0.05);
    s.push(person(0.8, 0.8), 0.05);
    const one = s.get()![0].x;
    expect(one).toBeGreaterThan(0.2);
    expect(one).toBeLessThan(0.8);
    for (let i = 0; i < 100; i += 1) s.push(person(0.8, 0.8), 0.05);
    expect(s.get()![0].x).toBeCloseTo(0.8, 2);
  });

  it('重复 push 相同姿态时保持不变', () => {
    const s = new PoseSmoother();
    s.push(person(0.5, 0.5), 0.05);
    const before = s.get()![0].x;
    s.push(person(0.5, 0.5), 0.05);
    expect(s.get()![0].x).toBeCloseTo(before);
  });

  it('可见性不通过的点冻结旧值，其余点正常收敛', () => {
    const s = new PoseSmoother();
    s.push(person(0.5, 0.5), 0.05);
    const moved = person(0.9, 0.9);
    moved[15].visibility = 0.1; // leftWrist 被遮挡
    for (let i = 0; i < 50; i += 1) s.push(moved, 0.05);
    const got = s.get()!;
    expect(got[15].x).toBeCloseTo(0.5);
    expect(got[0].x).toBeCloseTo(0.9, 2);
  });

  it('丢人时保留最后一帧姿态，避免渲染闪断', () => {
    const s = new PoseSmoother();
    s.push(person(0.5, 0.5), 0.05);
    s.push(null, 0.05);
    expect(s.get()).not.toBeNull();
  });

  it('reset 清空状态', () => {
    const s = new PoseSmoother();
    s.push(person(), 0.05);
    s.reset();
    expect(s.get()).toBeNull();
  });
});

describe('AVATAR_STYLES', () => {
  it('至少两套配色，供双人槽位按序取用', () => {
    expect(AVATAR_STYLES.length).toBeGreaterThanOrEqual(2);
    for (const st of AVATAR_STYLES) {
      expect(st.shirt).toBeTruthy();
      expect(st.pants).toBeTruthy();
      expect(st.skin).toBeTruthy();
    }
  });
});
