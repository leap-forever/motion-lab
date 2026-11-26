/**
 * 切水果 —— 一个完整可玩的示例游戏。
 *
 * 原站是「每个游戏一个 lazy chunk」：game-*.js + sprites-*.js，
 * 共用 stage / draw / art / landmarks 这些基础 chunk。
 * 这里同样把游戏逻辑与引擎分离：本文件只管规则和绘制，
 * 关键点识别、平滑、坐标系变换全在 lib/ 里，换游戏不用改那些。
 */
import { circle, drawSprite, makeSprite, outlinedText, Particles, roundRect } from '../lib/draw';
import { LOGICAL_H, LOGICAL_W, type Stage } from '../lib/stage';
import { POSE_EDGES, type Point } from '../lib/landmarks';
import type { Game, GameFrame } from './types';

interface Item {
  x: number; y: number; vx: number; vy: number;
  r: number; rot: number; vr: number;
  bomb: boolean; color: string; sprite: HTMLCanvasElement;
  alive: boolean;
}

const FRUITS = [
  { color: '#ff6b6b', emoji: '🍎' },
  { color: '#ffd93d', emoji: '🍋' },
  { color: '#6bcb77', emoji: '🥝' },
  { color: '#ff9f43', emoji: '🍊' },
  { color: '#a66cff', emoji: '🍇' },
  { color: '#4d96ff', emoji: '🫐' },
];

function makeFruitSprite(color: string, emoji: string): HTMLCanvasElement {
  return makeSprite(128, 128, (c) => {
    const g = c.createRadialGradient(46, 40, 6, 64, 64, 60);
    g.addColorStop(0, '#ffffffaa');
    g.addColorStop(0.35, color);
    g.addColorStop(1, '#00000033');
    circle(c, 64, 64, 58, g, '#ffffffaa', 4);
    c.font = '52px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(emoji, 64, 68);
  });
}

function makeBombSprite(): HTMLCanvasElement {
  return makeSprite(128, 128, (c) => {
    circle(c, 64, 68, 54, '#2b2b38', '#ffffff66', 4);
    c.strokeStyle = '#c98b3a'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(72, 22); c.quadraticCurveTo(96, 8, 100, 26); c.stroke();
    circle(c, 100, 26, 8, '#ffcf4d');
    c.font = '700 44px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fff'; c.fillText('💣', 60, 72);
  });
}

export class FruitSlash implements Game {
  readonly durationSec = 45;
  readonly stars: readonly [number, number, number] = [6, 12, 20];

  private items: Item[] = [];
  private particles = new Particles();
  private sprites: HTMLCanvasElement[] = [];
  private bombSprite: HTMLCanvasElement;
  private elapsed = 0;
  private spawnIn = 0.3;
  private _score = 0;
  private _combo = 0;
  private _feedback = '';
  private feedbackLeft = 0;
  private flash = 0;
  private lastSlashAt = 0;

  constructor() {
    this.sprites = FRUITS.map((f) => makeFruitSprite(f.color, f.emoji));
    this.bombSprite = makeBombSprite();
  }

  get score() { return this._score; }
  get combo() { return this._combo; }
  get timeLeft() { return Math.max(0, this.durationSec - this.elapsed); }
  get finished() { return this.elapsed >= this.durationSec; }
  get feedback() { return this.feedbackLeft > 0 ? this._feedback : ''; }

  private say(text: string) { this._feedback = text; this.feedbackLeft = 0.9; }

  private spawn() {
    const bomb = Math.random() < 0.18;
    const pick = Math.floor(Math.random() * FRUITS.length);
    this.items.push({
      x: 180 + Math.random() * (LOGICAL_W - 360),
      y: LOGICAL_H + 80,
      vx: (Math.random() - 0.5) * 260,
      vy: -(760 + Math.random() * 260),
      r: 46 + Math.random() * 12,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 3,
      bomb,
      color: bomb ? '#2b2b38' : FRUITS[pick].color,
      sprite: bomb ? this.bombSprite : this.sprites[pick],
      alive: true,
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
      // 越到后面节奏越快，和原站「连击越长越快」一个意思
      this.spawnIn = Math.max(0.42, 0.95 - this.elapsed * 0.008);
    }

    for (const it of this.items) {
      if (!it.alive) continue;
      it.vy += 1180 * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vr * dt;
      if (it.y > LOGICAL_H + 120 && it.vy > 0) {
        it.alive = false;
        if (!it.bomb && this._combo > 2) { this._combo = 0; this.say('漏掉了，连击断啦'); }
      }
    }
    this.items = this.items.filter((it) => it.alive);

    // 挥手判定：一次高速挥动只算一次，避免同一帧连切好几个
    if (f.slashes.length && f.now - this.lastSlashAt > 110) {
      for (const s of f.slashes) {
        const hx = s.x * LOGICAL_W;
        const hy = s.y * LOGICAL_H;
        let hit = false;
        for (const it of this.items) {
          if (!it.alive) continue;
          if (Math.hypot(it.x - hx, it.y - hy) > it.r + 74) continue;
          it.alive = false;
          hit = true;
          this.particles.burst(it.x, it.y, it.color, it.bomb ? 20 : 14);
          if (it.bomb) {
            this._score = Math.max(0, this._score - 3);
            this._combo = 0;
            this.flash = 1;
            this.say('哎呀，是炸弹！-3');
          } else {
            this._combo += 1;
            this._score += this._combo >= 5 ? 2 : 1;
            this.say(this._combo >= 3 ? `连击 ×${this._combo}` : '切得漂亮！');
          }
          break;
        }
        if (hit) { this.lastSlashAt = f.now; break; }
      }
    }
  }

  draw(stage: Stage): void {
    const ctx = stage.begin();

    // 背景：纯 Canvas 2D 画的天与地，不依赖任何图片资源
    const sky = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    sky.addColorStop(0, '#87ceeb');
    sky.addColorStop(0.72, '#d9f2ff');
    sky.addColorStop(1, '#bde6a8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = '#8fd06f';
    ctx.beginPath();
    ctx.moveTo(0, 640);
    ctx.quadraticCurveTo(320, 580, 640, 640);
    ctx.quadraticCurveTo(960, 700, LOGICAL_W, 620);
    ctx.lineTo(LOGICAL_W, LOGICAL_H); ctx.lineTo(0, LOGICAL_H); ctx.closePath(); ctx.fill();

    for (const it of this.items) {
      drawSprite(ctx, it.sprite, it.x, it.y, it.r * 2.4, it.r * 2.4, it.rot);
    }
    this.particles.draw(ctx);

    // 骨架（调试用，设置里可关）
    if (this.showSkeletonFlag) {
      const person = this.lastPoints[0];
      if (person) {
        ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 5; ctx.lineCap = 'round';
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

    // 手部光标
    for (const w of this.lastWrists) {
      if (!w) continue;
      circle(ctx, w.x * LOGICAL_W, w.y * LOGICAL_H, 22, '#ffffff55', '#fff', 4);
      circle(ctx, w.x * LOGICAL_W, w.y * LOGICAL_H, 7, '#fff');
    }

    // HUD
    roundRect(ctx, 24, 20, 250, 74, 18, '#ffffffcc');
    outlinedText(ctx, `分数 ${this._score}`, 148, 56, 34, '#2b2140', '', 0);
    roundRect(ctx, LOGICAL_W - 244, 20, 220, 74, 18, '#ffffffcc');
    outlinedText(ctx, `${Math.ceil(this.timeLeft)} 秒`, LOGICAL_W - 134, 56, 34, '#2b2140', '', 0);
    if (this._combo >= 2) outlinedText(ctx, `连击 ×${this._combo}`, LOGICAL_W / 2, 120, 46, '#ff8c42');
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

  // draw 里用到的两帧前状态，由 update 记录
  private showSkeletonFlag = false;
  private lastPoints: Point[][] = [];
  private lastWrists: Array<Point | null> = [null, null];

  dispose(): void {
    this.items = [];
    this.particles.clear();
  }
}
