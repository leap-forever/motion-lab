/**
 * Canvas 2D 舞台。
 *
 * 逻辑坐标固定成 1280×720，但有两套到屏幕的映射：
 *   - 世界层：对齐 <video object-fit:cover> 的实际显示矩形，关键点 / 游戏物体与背景同坐标系；
 *   - HUD 层：对齐视口内 16:9 安全区，避免全屏裁剪时贴边的分数和计时被切掉。
 *
 * 关键点仍是视频帧的 0..1 归一化坐标，mirrored() 已处理 CSS scaleX(-1)；
 * 因此把 1280×720 世界矩形映射到视频显示矩形，就能让骨架与摄像头画面重合。
 */
export const LOGICAL_W = 1280;
export const LOGICAL_H = 720;

export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  W = 1; H = 1; dpr = 1;
  /** HUD 安全区：逻辑坐标 → 屏幕坐标 */
  scale = 1; ox = 0; oy = 0;
  /** 世界层：逻辑坐标 → 摄像头 cover 显示矩形，横纵缩放可能不同 */
  scaleX = 1; scaleY = 1; worldX = 0; worldY = 0;
  private videoW = LOGICAL_W;
  private videoH = LOGICAL_H;
  private ro: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // alpha:true：让 Canvas 透明，下层放摄像头 <video> 作背景
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
    this.canvas = canvas;
    this.ctx = ctx;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
  }

  /** 摄像头真实分辨率变化时调用；0 表示元数据还没准备好，沿用上次值 */
  setVideoSize(width: number, height: number): void {
    if (width > 0 && height > 0) {
      this.videoW = width;
      this.videoH = height;
    }
    this.resize();
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

    // HUD：始终把 16:9 逻辑矩形完整放在视口内
    this.scale = Math.min(this.W / LOGICAL_W, this.H / LOGICAL_H);
    this.ox = (this.W - LOGICAL_W * this.scale) / 2;
    this.oy = (this.H - LOGICAL_H * this.scale) / 2;

    // 世界：复刻 CSS object-fit:cover。cover 用 max()，裁剪偏移可能为负；
    // 视频元素整体 scaleX(-1) 后，mirrored() 的 x 仍按同一矩形线性映射。
    const cover = Math.max(this.W / this.videoW, this.H / this.videoH);
    const drawW = this.videoW * cover;
    const drawH = this.videoH * cover;
    this.worldX = (this.W - drawW) / 2;
    this.worldY = (this.H - drawH) / 2;
    this.scaleX = drawW / LOGICAL_W;
    this.scaleY = drawH / LOGICAL_H;
  }

  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.worldX + x * this.scaleX, y: this.worldY + y * this.scaleY };
  }

  fromScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.worldX) / this.scaleX, y: (y - this.worldY) / this.scaleY };
  }

  private applyWorld(): void {
    const { ctx } = this;
    ctx.setTransform(
      this.dpr * this.scaleX, 0,
      0, this.dpr * this.scaleY,
      this.dpr * this.worldX, this.dpr * this.worldY,
    );
    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.clip();
  }

  private applyHud(): void {
    const { ctx } = this;
    ctx.setTransform(
      this.dpr * this.scale, 0,
      0, this.dpr * this.scale,
      this.dpr * this.ox, this.dpr * this.oy,
    );
    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.clip();
  }

  /** 每帧开头：清屏 + 切到「与摄像头画面对齐」的世界坐标系 */
  begin(): CanvasRenderingContext2D {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.save();
    this.applyWorld();
    return ctx;
  }

  /** 画 HUD 前调用：在不清屏的前提下切到视口内安全区 */
  beginHud(): CanvasRenderingContext2D {
    const { ctx } = this;
    ctx.restore();
    ctx.save();
    this.applyHud();
    return ctx;
  }

  /** 每帧结尾调用，与 begin / beginHud 的 save 配对 */
  end(): void {
    this.ctx.restore();
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
  }
}
