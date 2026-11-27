/**
 * 跳绳冠军 —— 下肢 / 起跳判定示例游戏。
 *
 * 用 features.jump（垂直速度归一化）检测起跳瞬间：绳子每次荡到最低点时，
 * 玩家在空中就计一次成功，没跳起来就断连击。连击越长绳子越快。
 */
import { circle, outlinedText, Particles, roundRect } from '../lib/draw';
import { LOGICAL_H, LOGICAL_W, type Stage } from '../lib/stage';
import { POSE_EDGES, type Point } from '../lib/landmarks';
import type { Game, GameFrame } from './types';

export class JumpRope implements Game {
  readonly durationSec = 60;
  readonly stars: readonly [number, number, number] = [10, 20, 35];

  private particles = new Particles();
  private elapsed = 0;
  private _score = 0;
  private _combo = 0;
  private _feedback = '';
  private feedbackLeft = 0;
  private flash = 0;

  private ropePhase = 0;
  private ropeSpeed = 3;
  private ropeR = 180;
  private cx = LOGICAL_W / 2;
  private cy = LOGICAL_H * 0.62;
  private airborne = false;
  private airborneUntil = 0;
  private triggered = false;

  private showSkeletonFlag = false;
  private lastPoints: Point[][] = [];

  get score() { return this._score; }
  get combo() { return this._combo; }
  get timeLeft() { return Math.max(0, this.durationSec - this.elapsed); }
  get finished() { return this.elapsed >= this.durationSec; }
  get feedback() { return this.feedbackLeft > 0 ? this._feedback : ''; }

  private say(text: string) { this._feedback = text; this.feedbackLeft = 0.9; }

  update(f: GameFrame): void {
    if (this.finished) return;
    const dt = f.dt;
    this.showSkeletonFlag = f.showSkeleton;
    this.lastPoints = f.points;
    this.elapsed += dt;
    this.feedbackLeft -= dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.particles.update(dt);

    this.cx = f.features.centre.x * LOGICAL_W;
    this.cy = f.features.centre.y * LOGICAL_H;
    this.ropeR = Math.max(140, f.features.torso * LOGICAL_H);

    // jump 是归一化垂直速度；超过阈值视为这一刻在空中，并给 0.35s 惯性窗口
    if (f.features.jump > 0.3) this.airborneUntil = f.now + 350;
    this.airborne = f.now < this.airborneUntil;

    this.ropeSpeed = Math.min(8, 3 + this._combo * 0.18);
    this.ropePhase += this.ropeSpeed * dt;
    const sin = Math.sin(this.ropePhase);

    // 绳子荡到最低点（sin 接近 1）时判定一次，一个周期只判一次
    if (f.features.present) {
      if (sin > 0.9 && !this.triggered) {
        this.triggered = true;
        if (this.airborne) {
          this._combo += 1;
          this._score += this._combo >= 5 ? 2 : 1;
          this.particles.burst(this.cx, this.cy + this.ropeR, '#ffd93d', 12);
          this.say(this._combo >= 3 ? `连跳 ×${this._combo}` : '跳得漂亮！');
        } else {
          this._combo = 0;
          this.flash = 1;
          this.say('绊到绳子了');
        }
      }
      if (sin < 0.2) this.triggered = false;
    } else {
      this.triggered = false;
    }
  }

  draw(stage: Stage): void {
    const ctx = stage.begin();

    const bg = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    bg.addColorStop(0, '#3b4a6b');
    bg.addColorStop(0.7, '#5b6b8c');
    bg.addColorStop(1, '#8a7d6b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.fillStyle = '#00000022';
    ctx.fillRect(0, this.cy + this.ropeR, LOGICAL_W, LOGICAL_H);

    // 玩家骨架
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
    } else {
      circle(ctx, this.cx, this.cy, 40, '#ffffff44', '#fff', 3);
    }

    // 绳子：两端的把手 + 中间一条随相位摆动的曲线
    const left = this.cx - this.ropeR;
    const right = this.cx + this.ropeR;
    const bulgeY = this.cy + this.ropeR * Math.sin(this.ropePhase);
    ctx.strokeStyle = '#d9a06b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(left, this.cy);
    ctx.quadraticCurveTo(this.cx, bulgeY, right, this.cy);
    ctx.stroke();
    circle(ctx, left, this.cy, 12, '#8a5a2b');
    circle(ctx, right, this.cy, 12, '#8a5a2b');

    this.particles.draw(ctx);

    roundRect(ctx, 24, 20, 250, 74, 18, '#ffffffcc');
    outlinedText(ctx, `分数 ${this._score}`, 148, 56, 34, '#2b2140', '', 0);
    roundRect(ctx, LOGICAL_W - 244, 20, 220, 74, 18, '#ffffffcc');
    outlinedText(ctx, `${Math.ceil(this.timeLeft)} 秒`, LOGICAL_W - 134, 56, 34, '#2b2140', '', 0);
    if (this._combo >= 2) outlinedText(ctx, `连跳 ×${this._combo}`, LOGICAL_W / 2, 120, 46, '#ffd93d');
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
    this.particles.clear();
  }
}
