/**
 * 足球射门 —— 下肢 / 头部判定示例游戏。
 *
 * 球从右侧飞来，玩家用脚（脚踝）或头把球顶向左侧球门，不能用手。
 * 用关键点直接判定，不依赖 features.wrist，强调下肢关键点的作用。
 */
import { circle, drawSprite, makeSprite, outlinedText, Particles, roundRect } from '../lib/draw';
import { LOGICAL_H, LOGICAL_W, type Stage } from '../lib/stage';
import { LM, POSE_EDGES, visible, type Point } from '../lib/landmarks';
import { HIT } from '../lib/config';
import { hitRadius, insideRect, segmentCircleHit, toWorld } from '../lib/hit';
import { drawBackdrop, type AvatarRenderer } from '../lib/avatar';
import type { Game, GameFrame } from './types';

interface Ball {
  x: number; y: number; vx: number; vy: number;
  r: number; rot: number; vr: number; alive: boolean; hit: boolean; scored: boolean;
}

const GOAL_X = 96;
const GOAL_TOP = 280;
const GOAL_BOTTOM = 500;
const GROUND_Y = 560;

/** 有效击球点：两只脚踝 + 鼻子（不能用手） */
const JOINT_IDS = [LM.leftAnkle, LM.rightAnkle, LM.nose] as const;

function makeBallSprite(): HTMLCanvasElement {
  return makeSprite(128, 128, (c) => {
    circle(c, 64, 64, 56, '#ffffff', '#222', 4);
    c.font = '64px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('⚽', 64, 66);
  });
}

export class SoccerKick implements Game {
  readonly durationSec = 45;
  readonly stars: readonly [number, number, number] = [4, 8, 14];

  private items: Ball[] = [];
  private particles = new Particles();
  private ballSprite: HTMLCanvasElement;
  private elapsed = 0;
  private spawnIn = 1;
  private _score = 0;
  private _combo = 0;
  private _feedback = '';
  private feedbackLeft = 0;

  private showSkeletonFlag = false;
  private lastPoints: Point[][] = [];
  /** 当前替身渲染器（avatar 模式时非 null），update 记录、draw 使用 */
  private avatar: AvatarRenderer | null = null;

  constructor() {
    this.ballSprite = makeBallSprite();
  }

  get score() { return this._score; }
  get combo() { return this._combo; }
  get timeLeft() { return Math.max(0, this.durationSec - this.elapsed); }
  get finished() { return this.elapsed >= this.durationSec; }
  get feedback() { return this.feedbackLeft > 0 ? this._feedback : ''; }

  private say(text: string) { this._feedback = text; this.feedbackLeft = 0.9; }

  private spawn() {
    this.items.push({
      x: LOGICAL_W + 60,
      y: 220 + Math.random() * 180,
      vx: -(240 + Math.random() * 80),
      vy: 0,
      r: 40,
      rot: Math.random() * Math.PI,
      vr: -4,
      alive: true,
      hit: false,
      scored: false,
    });
  }

  update(f: GameFrame): void {
    if (this.finished) return;
    const dt = f.dt;
    this.showSkeletonFlag = f.showSkeleton;
    this.lastPoints = f.points;
    this.avatar = f.avatar;
    this.elapsed += dt;
    this.feedbackLeft -= dt;
    this.particles.update(dt);

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      this.spawnIn = Math.max(1.0, 1.6 - this.elapsed * 0.008);
    }

    const person = f.points[0];

    for (const b of this.items) {
      if (!b.alive) continue;
      b.vy += 900 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y > GROUND_Y) { b.y = GROUND_Y; b.vy *= -0.45; b.vx *= 0.8; }

      // 击球：把球推向左侧球门上方
      if (!b.hit) {
        for (const idx of JOINT_IDS) {
          const j = person?.[idx];
          if (!j) continue;
          const to = toWorld(j);
          const prev = f.prevPerson?.[idx];
          const from = prev && visible(prev) ? toWorld(prev) : to;
          const radius = hitRadius(b.r, HIT.soccerKick, f.features.torso, f.hitMode);
          if (!segmentCircleHit(from, to, { x: b.x, y: b.y }, radius)) continue;
          b.hit = true;
          b.vx = -700;
          b.vy = -260 - Math.random() * 80;
          this.particles.burst(b.x, b.y, '#ffffff', 10);
          this.say('踢得好！');
          break;
        }
      }

      // 进球判定：球心落在球门矩形内（省略左边，保持与原来一致）
      if (b.hit && !b.scored
        && insideRect({ x: b.x, y: b.y }, { right: GOAL_X + 20, top: GOAL_TOP, bottom: GOAL_BOTTOM })) {
        b.scored = true;
        b.alive = false;
        this._combo += 1;
        this._score += this._combo >= 5 ? 2 : 1;
        this.particles.burst(GOAL_X + 40, (GOAL_TOP + GOAL_BOTTOM) / 2, '#ffd93d', 18);
        this.say(this._combo >= 3 ? `连进 ×${this._combo}` : '进球！');
      }

      if (b.x < -120 || b.y > LOGICAL_H + 120) {
        b.alive = false;
        if (b.hit && !b.scored && this._combo > 2) { this._combo = 0; this.say('没进，连击断了'); }
      }
    }
    this.items = this.items.filter((b) => b.alive);
  }

  draw(stage: Stage): void {
    const ctx = stage.begin();

    // 替身模式：自绘背景 + 关键点驱动的小人（判定坐标不变）
    if (this.avatar) {
      drawBackdrop(ctx);
      this.avatar.draw(ctx);
    }

    // 背景为下层摄像头视频；画半透明地面与球场参考线
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, GROUND_Y, LOGICAL_W, LOGICAL_H - GROUND_Y);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(LOGICAL_W, GROUND_Y); ctx.stroke();

    // 球门
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(GOAL_X, GROUND_Y);
    ctx.lineTo(GOAL_X, GOAL_TOP);
    ctx.lineTo(GOAL_X + 120, GOAL_TOP);
    ctx.lineTo(GOAL_X + 120, GOAL_BOTTOM);
    ctx.stroke();
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(GOAL_X, GOAL_TOP, 120, GOAL_BOTTOM - GOAL_TOP);

    for (const b of this.items) {
      drawSprite(ctx, this.ballSprite, b.x, b.y,
        b.r * HIT.soccerKick.spriteScale, b.r * HIT.soccerKick.spriteScale, b.rot);
    }
    this.particles.draw(ctx);

    // 骨架（调试；替身模式下替身本身就是骨架的可视化，不重复画）
    if (this.showSkeletonFlag && !this.avatar) {
      const person = this.lastPoints[0];
      if (person) {
        ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 5; ctx.lineCap = 'round';
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

    // 击球点光标：脚踝 + 头
    const person = this.lastPoints[0];
    if (person) {
      for (const idx of [LM.leftAnkle, LM.rightAnkle, LM.nose]) {
        const p = person[idx];
        if (!p) continue;
        circle(ctx, p.x * LOGICAL_W, p.y * LOGICAL_H, 18, '#ffffff55', '#fff', 3);
      }
    }

    if (this.finished) {
      ctx.fillStyle = '#101a2ccc';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    }

    // HUD 用视口内安全区，避免全屏裁剪时贴边元素被切掉
    stage.beginHud();
    roundRect(ctx, 24, 20, 250, 74, 18, '#ffffffcc');
    outlinedText(ctx, `分数 ${this._score}`, 148, 56, 34, '#2b2140', '', 0);
    roundRect(ctx, LOGICAL_W - 244, 20, 220, 74, 18, '#ffffffcc');
    outlinedText(ctx, `${Math.ceil(this.timeLeft)} 秒`, LOGICAL_W - 134, 56, 34, '#2b2140', '', 0);
    if (this._combo >= 2) outlinedText(ctx, `连进 ×${this._combo}`, LOGICAL_W / 2, 120, 46, '#ff8c42');
    if (this.feedback) outlinedText(ctx, this.feedback, LOGICAL_W / 2, 190, 38, '#fff', '#2b2140');
    if (this.finished) {
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
