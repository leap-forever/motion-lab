/**
 * 摄像头采集层。
 *
 * 和原站 media-Ci7gRuAS.js 对齐的几个点：
 *   1. 只请求 video，audio 明确关掉（隐私 + 少一条权限弹窗）；
 *   2. 1280×720 @ 30fps 是 ideal 不是 exact —— 低端设备自动降档，不会直接失败；
 *   3. 指定了 deviceId 但设备被拔掉时，NotFound/Overconstrained 自动回退默认摄像头；
 *   4. 用 requestVideoFrameCallback 量真实帧率，而不是假设「摄像头一定是 30fps」。
 */

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number; presentedFrames?: number }) => void) => number;
};

export interface CameraHandle {
  video: HTMLVideoElement;
  stream: MediaStream;
  width: number;
  height: number;
  stop: () => void;
}

const CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

export async function openCamera(deviceId?: string, host?: HTMLVideoElement): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('这个浏览器不支持摄像头 API（需要 HTTPS 或 localhost）');
  }

  const base = deviceId
    ? { ...CONSTRAINTS, deviceId: { exact: deviceId } }
    : { ...CONSTRAINTS, facingMode: 'user' as const };

  const request = () => navigator.mediaDevices.getUserMedia({ video: base, audio: false });

  let stream: MediaStream;
  try {
    stream = await request();
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (deviceId && (name === 'NotFoundError' || name === 'OverconstrainedError')) {
      // 之前选的摄像头没了 —— 退回默认，并让 UI 提示用户
      stream = await navigator.mediaDevices.getUserMedia({
        video: { ...CONSTRAINTS, facingMode: 'user' },
        audio: false,
      });
    } else {
      throw err;
    }
  }

  // host 由 React 传入：这样预览小窗和推理用的是同一个 <video>，不会有两路解码
  const video = host ?? document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise<void>((done, fail) => {
    video.onloadedmetadata = () => { video.play().then(() => done()).catch(fail); };
    video.onerror = () => fail(new Error('摄像头画面打不开'));
    setTimeout(() => fail(new Error('摄像头启动超时')), 8000);
  });

  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();

  return {
    video,
    stream,
    width: settings?.width || video.videoWidth || 1280,
    height: settings?.height || video.videoHeight || 720,
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return [];
  }
}

/**
 * 实测摄像头帧率。requestVideoFrameCallback 每送来一帧才回调一次，
 * 所以数它比数 rAF 准得多：rAF 是 60Hz，跟摄像头喂帧的节奏不是一回事。
 */
export function measureFps(video: HTMLVideoElement, ms = 1000): Promise<number> {
  const v = video as VideoWithRVFC;
  const started = performance.now();
  return new Promise((resolve) => {
    let frames = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(frames * 1000 / Math.max(1, performance.now() - started));
    };
    if (typeof v.requestVideoFrameCallback === 'function') {
      const tick = () => {
        frames += 1;
        if (performance.now() - started < ms) v.requestVideoFrameCallback!(tick);
        else finish();
      };
      v.requestVideoFrameCallback(tick);
      setTimeout(finish, ms + 120);
    } else {
      // 兜底：靠 currentTime 变化计数（分辨率低，但至少不会假死）
      let last = video.currentTime;
      const id = window.setInterval(() => {
        if (video.currentTime !== last) { last = video.currentTime; frames += 1; }
      }, 8);
      setTimeout(() => { clearInterval(id); finish(); }, ms);
    }
  });
}

/** 显卡加速检测：原站 device-check 里用 WebGL2 + WEBGL_debug_renderer_info 判软渲染 */
export function probeWebGL2(): { ok: boolean; renderer?: string; software?: boolean } {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { ok: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    const software = /swiftshader|llvmpipe|software|microsoft basic/i.test(renderer);
    return { ok: true, renderer, software };
  } catch {
    return { ok: false };
  }
}

/**
 * WASM SIMD 探测：这段字节就是原站 vision chunk 里 Tc() 用的最小模块，
 * 含一条 v128 指令，不支持 SIMD 的引擎会 validate 失败。
 * 教学版只把它显示出来，实际选哪份 wasm 由 FilesetResolver 内部决定。
 */
export async function probeSimd(): Promise<boolean> {
  const bytes = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
    3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
  ]);
  try {
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

export function deviceSummary() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: nav.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    userAgent: navigator.userAgent,
    secureContext: window.isSecureContext,
  };
}
