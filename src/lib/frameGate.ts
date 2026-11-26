/**
 * 帧节流器 —— 整个项目最值得学的一个小类。
 *
 * 问题：摄像头 30fps、rAF 60fps、模型推理可能只要 12ms 也可能要 90ms。
 * 如果每帧 rAF 都跑一次 detectForVideo：
 *   - 摄像头没送新帧时，会对同一帧重复推理，白烧 CPU；
 *   - 推理变慢时会堆积请求，越跑越卡。
 *
 * 原站 vision-CD0XLpSO.js 开头的那个 class 就是干这个的，思路是：
 *   A. 记录每个「摄像头新帧」到达的时间与帧号；
 *   B. 如果帧号可用，用帧号差反推真实 camFps，判断这一秒是不是收到了足够的新帧；
 *   C. 帧号不可用（或采集时钟异常）时，退回按 targetFps 做时间节流；
 *   D. 只有「有新帧」且「到了该推理的时刻」，due() 才放行。
 *
 * 这里是按同样思路重写的净室实现，变量命名故意保持直白，方便对照读。
 */
interface Tick {
  at: number;
  frameNo: number | null;
}

export class FrameGate {
  /** 最近 1 秒内摄像头送来的新帧 */
  private ticks: Tick[] = [];
  /** 上次放行之后，有没有新帧进来 */
  private fresh = false;
  /** 下一次允许推理的时间戳 */
  private nextAt = 0;
  private interval = 0;
  /** 实测摄像头帧率，UI 可以直接显示 */
  camFps = 0;
  /** 累计放行的推理次数，用来算真实推理 fps */
  inferred = 0;

  /** 每当摄像头真的送来一帧就调用（rAF 里判断 video.currentTime 变化，或用 RVFC 回调） */
  frame(at: number, frameNo: number | null = null): void {
    this.ticks.push({ at, frameNo });
    this.fresh = true;
  }

  /** 用帧号差判断「这一秒摄像头是不是按目标帧率稳定供帧」 */
  private exact(at: number, targetFps: number): boolean {
    const buf = this.ticks;
    while (buf.length && at - buf[0].at > 1000) buf.shift();
    // 样本太少、或 250ms 没新帧：认为采集时钟不可信，交给时间节流
    if (buf.length < 5 || at - buf[buf.length - 1].at > 250) {
      this.camFps = 0;
      return false;
    }
    const first = buf[0].frameNo;
    const last = buf[buf.length - 1].frameNo;
    if (first !== null && last !== null) {
      const counted = last - first + 1;
      if (counted >= buf.length) {
        this.camFps = Math.min(120, counted);
        return buf.length >= counted * 0.8;
      }
    }
    this.camFps = 0;
    return buf.length >= targetFps * 0.8 && buf.length <= targetFps * 1.25;
  }

  /**
   * 这一帧要不要跑推理。
   * @param at        performance.now()
   * @param targetFps 目标推理帧率（低配设备可以调低）
   * @param force     强制模式（设备检测页用：宁可多算也要量到真实耗时）
   */
  due(at: number, targetFps: number, force = false): boolean {
    const clockTrusted = this.exact(at, targetFps);
    // 采集时钟可信却没有新帧 → 直接跳过，避免重复推理
    if (clockTrusted && !this.fresh) return false;

    const nextInterval = force ? 100 : clockTrusted ? 0 : 1000 / Math.max(1, targetFps);
    if (nextInterval < this.interval) this.nextAt = Math.min(this.nextAt, at);
    this.interval = nextInterval;

    if (nextInterval) {
      if (at + 2 < this.nextAt) return false;
      this.nextAt = Math.max(this.nextAt, at - nextInterval) + nextInterval;
    }
    this.fresh = false;
    this.inferred += 1;
    return true;
  }

  reset(): void {
    this.ticks = [];
    this.fresh = false;
    this.nextAt = 0;
    this.interval = 0;
    this.camFps = 0;
    this.inferred = 0;
  }
}
