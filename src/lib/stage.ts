/**
 * Canvas 2D 舞台。
 *
 * 原站 stage-iJ4xjUfD.js 也是这个类：DPR 上限 2、16:9 letterbox、
 * 逻辑坐标与屏幕坐标互转、离屏 canvas 缓存精灵。
 * 这里把逻辑坐标固定成 1280×720（比它的 0..1 归一化更好读），
 * 所有游戏代码只跟逻辑坐标打交道，不用关心窗口多大。
 */
export const LOGICAL_W = 1280;
export const LOGICAL_H = 720;

export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  W = 1; H = 1; dpr = 1;
  scale = 1; ox = 0; oy = 0;
  private ro: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
    this.canvas = canvas;
    this.ctx = ctx;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    // 上限 2：4K 屏上再往上加像素只是白烧 GPU，识别也跟不上
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(this.W * this.dpr);
    const ph = Math.round(this.H * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.scale = Math.min(this.W / LOGICAL_W, this.H / LOGICAL_H);
    this.ox = (this.W - LOGICAL_W * this.scale) / 2;
    this.oy = (this.H - LOGICAL_H * this.scale) / 2;
  }

  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }

  fromScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  }

  /** 每帧开头调用：清屏 + 铺黑边 + 切到逻辑坐标系 */
  begin(): CanvasRenderingContext2D {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#101a2c';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.clip();
    return ctx;
  }

  /** 每帧结尾调用，与 begin 的 save 配对 */
  end(): void {
    this.ctx.restore();
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
  }
}
