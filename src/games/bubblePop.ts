/**
 * 戳泡泡 —— 手部关键点示例游戏。
 *
 * 和切水果一样只吃 GameFrame，但判定改为「手腕碰到泡泡」，
 * 不要求高速挥动，更适合低龄玩家。规则：戳破彩色泡泡得分，
 * 别戳到黑色炸弹泡泡。
 */
import { circle, drawSprite, makeSprite, outlinedText, Particles, roundRect } from '../lib/draw';
import { LOGICAL_H, LOGICAL_W, type Stage } from '../lib/stage';
import { POSE_EDGES, type Point } from '../lib/landmarks';
import type { Game, GameFrame } from './types';

interface Bubble {
  x: number; y: number; r: number;
  vx: number; vy: number; phase: number;
  alive: boolean; bomb: boolean; color: string; sprite: HTMLCanvasElement;
}

const COLORS = ['#ffd93d', '#6bcb77', '#ff6b6b', '#4d96ff', '#a66cff', '#ff9f43'];

function makeBubbleSprite(color: string, bomb: boolean): HTMLCanvasElement {
  return makeSprite(128, 128, (c) => {
    if (bomb) {
      circle(c, 64, 66, 52, '#1f1f2b', '#ffffff55', 4);
      c.font = '700 48px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#fff'; c.fillText('💣', 64, 70);
      return;
    }
    const g = c.createRadialGradient(46, 40, 4, 64, 64, 60);
    g.addColorStop(0, '#ffffffcc');
    g.addColorStop(0.45, `${color}99`);
    g.addColorStop(1, `${color}33`);
    circle(c, 64, 64, 58, g, '#ffffff88', 3);
    circle(c, 46, 44, 12, '#ffffffaa');
  });
}

export class BubblePop implements Game {
  readonly durationSec = 45;
  readonly stars: readonly [number, number, number] = [8, 15, 24];

  private items: Bubble[] = [];
  private particles = new Particles();
  private sprites: HTMLCanvasElement[] = [];
  private bombSprite: HTMLCanvasElement;
  private elapsed = 0;
  private spawnIn = 0.4;
  private _score = 0;
  private _combo = 0;
  private _feedback = '';
  private feedbackLeft = 0;
  private flash = 0;

  private showSkeletonFlag = false;
  private lastPoints: Point[][] = [];
  private lastWrists: Array<Point | null> = [null, null];

  constructor() {
    this.sprites = COLORS.map((c) => makeBubbleSprite(c, false));
    this.bombSprite = makeBubbleSprite('#1f1f2b', true);
  }

  get score() { return this._score; }
  get combo() { return this._combo; }
  get timeLeft() { return Math.max(0, this.durationSec - this.elapsed); }
  get finished() { return this.elapsed >= this.durationSec; }
  get feedback() { return this.feedbackLeft > 0 ? this._feedback : ''; }

  private say(text: string) { this._feedback = text; this.feedbackLeft = 0.9; }

  private spawn() {
    const bomb = Math.random() < 0.12;
    const pick = Math.floor(Math.random() * COLORS.length);
    this.items.push({
      x: 160 + Math.random() * (LOGICAL_W - 320),
      y: LOGICAL_H + 60,
      r: 38 + Math.random() * 18,
      vx: (Math.random() - 0.5) * 40,
      vy: -(80 + Math.random() * 50),
      phase: Math.random() * Math.PI * 2,
      alive: true,
      bomb,
      color: bomb ? '#1f1f2b' : COLORS[pick],
      sprite: bomb ? this.bombSprite : this.sprites[pick],
    });
  }

  update(f: GameFrame): void {
    if (this.finished) return;
    const dt = f.dt;
    this.showSkeletonFlag = f.showSkeleton;
    this.lastPoints = f.points;
    this.lastWrists = f.features.wrist;
    this.elapsed += dt;
    this.feedbackLeft -= dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.particles.update(dt);

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      this.spawnIn = Math.max(0.42, 0.9 - this.elapsed * 0.006);
    }

    for (const b of this.items) {
      if (!b.alive) continue;
      b.phase += dt * 2;
      b.x += b.vx * dt + Math.sin(b.phase) * 18 * dt;
      b.y += b.vy * dt;
      if (b.y < -100) b.alive = false;
    }
    this.items = this.items.filter((b) => b.alive);

    // 戳泡泡：任意一只手碰到即破
    for (const w of this.lastWrists) {
      if (!w) continue;
      const hx = w.x * LOGICAL_W;
      const hy = w.y * LOGICAL_H;
      for (const b of this.items) {
        if (!b.alive) continue;
        if (Math.hypot(b.x - hx, b.y - hy) > b.r + 30) continue;
        b.alive = false;
        this.particles.burst(b.x, b.y, b.color, b.bomb ? 18 : 12);
        if (b.bomb) {
          this._score = Math.max(0, this._score - 2);
          this._combo = 0;
          this.flash = 1;
          this.say('炸弹！-2');
        } else {
          this._combo += 1;
          this._score += this._combo >= 5 ? 2 : 1;
          this.say(this._combo >= 3 ? `连戳 ×${this._combo}` : '戳破啦！');
        }
        break;
      }
    }
  }

  draw(stage: Stage): void {
    const ctx = stage.begin();

    // 背景为下层摄像头视频，仅加一层很淡的冷色调，让泡泡更突出
    ctx.fillStyle = 'rgba(160,233,255,0.12)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    for (const b of this.items) {
      drawSprite(ctx, b.sprite, b.x, b.y, b.r * 2.3, b.r * 2.3);
    }
    this.particles.draw(ctx);

    if (this.showSkeletonFlag) {
      const person = this.lastPoints[0];
      if (person) {
        ctx.strokeStyle = '#2b214088'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (const [a, b] of POSE_EDGES) {
          const p = person[a], q = person[b];
          if (!p || !q) continue;
          ctx.beginPath();
          ctx.moveTo(p.x * LOGICAL_W, p.y * LOGICAL_H);
          ctx.lineTo(q.x * LOGICAL_W, q.y * LOGICAL_H);
          ctx.stroke();
        }
      }
    }

    for (const w of this.lastWrists) {
      if (!w) continue;
      circle(ctx, w.x * LOGICAL_W, w.y * LOGICAL_H, 20, '#ffffff66', '#fff', 4);
      circle(ctx, w.x * LOGICAL_W, w.y * LOGICAL_H, 6, '#fff');
    }

    roundRect(ctx, 24, 20, 250, 74, 18, '#ffffffcc');
    outlinedText(ctx, `分数 ${this._score}`, 148, 56, 34, '#2b2140', '', 0);
    roundRect(ctx, LOGICAL_W - 244, 20, 220, 74, 18, '#ffffffcc');
    outlinedText(ctx, `${Math.ceil(this.timeLeft)} 秒`, LOGICAL_W - 134, 56, 34, '#2b2140', '', 0);
    if (this._combo >= 2) outlinedText(ctx, `连戳 ×${this._combo}`, LOGICAL_W / 2, 120, 46, '#ff8c42');
    if (this.feedback) outlinedText(ctx, this.feedback, LOGICAL_W / 2, 190, 38, '#fff', '#2b2140');

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,70,70,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    }
    if (this.finished) {
      ctx.fillStyle = '#101a2ccc';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      outlinedText(ctx, '时间到！', LOGICAL_W / 2, 280, 78, '#fff', '#2b2140');
      outlinedText(ctx, `本局 ${this._score} 分`, LOGICAL_W / 2, 380, 52, '#ffd93d', '#2b2140');
    }

    stage.end();
  }

  dispose(): void {
    this.items = [];
    this.particles.clear();
  }
}
