/** 一组极简绘制工具，全部画在 Stage 的逻辑坐标系里（1280×720） */

export function circle(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  fill: string | CanvasGradient | CanvasPattern, stroke = '', lineWidth = 3,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

export function outlinedText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  size = 40, fill = '#fff', stroke = '#2b2140', lineWidth = 0.18,
): void {
  ctx.save();
  ctx.font = `700 ${size}px system-ui, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = size * lineWidth; ctx.strokeText(text, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
  fill: string, stroke = '', lineWidth = 2,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

/** 离屏缓存：把不变的图形（水果、背景）先画一次，之后只 drawImage */
export function makeSprite(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx);
  return c;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement,
  x: number, y: number, w: number, h: number, rot = 0, alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  ctx.restore();
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  color: string; size: number;
}

/** 切中水果时的汁水粒子，纯 Canvas 2D，没有引依赖 */
export class Particles {
  private items: Particle[] = [];

  burst(x: number, y: number, color: string, count = 14): void {
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const v = 120 + Math.random() * 260;
      this.items.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80,
        life: 0.55 + Math.random() * 0.35, max: 0.9,
        color, size: 4 + Math.random() * 7,
      });
    }
    if (this.items.length > 300) this.items.splice(0, this.items.length - 300);
  }

  update(dt: number): void {
    for (const p of this.items) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 620 * dt; // 重力
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      circle(ctx, p.x, p.y, p.size, p.color);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void { this.items = []; }
}
