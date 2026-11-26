'use client';

import { useState } from 'react';
import { deviceSummary, listCameras, measureFps, openCamera, probeSimd, probeWebGL2 } from '@/src/lib/camera';
import { analyseLighting } from '@/src/lib/framing';

interface Row { label: string; value: string; level: 'ok' | 'warn' | 'bad' | 'info'; tip?: string }

/** 设备检测（原 src/pages/Check.tsx）：对应原站 /check */
export default function CheckPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const out: Row[] = [];
    const push = (r: Row) => { out.push(r); setRows([...out]); };

    push({ label: '安全上下文', value: window.isSecureContext ? '是（HTTPS / localhost）' : '否',
      level: window.isSecureContext ? 'ok' : 'bad',
      tip: window.isSecureContext ? undefined : '摄像头 API 只在 HTTPS 或 localhost 下可用' });
    push({ label: 'mediaDevices.getUserMedia', value: !!navigator.mediaDevices?.getUserMedia ? '支持' : '不支持',
      level: !!navigator.mediaDevices?.getUserMedia ? 'ok' : 'bad', tip: '换用最新版 Chrome / Edge' });
    push({ label: 'WebAssembly', value: typeof WebAssembly !== 'undefined' ? '支持' : '不支持',
      level: typeof WebAssembly !== 'undefined' ? 'ok' : 'bad' });

    const simd = await probeSimd();
    push({ label: 'WASM SIMD', value: simd ? '支持 → 用 vision_wasm_internal.wasm' : '不支持 → 回落 nosimd 版',
      level: simd ? 'ok' : 'warn', tip: simd ? undefined : '推理会慢一些，建议把识别模型调成 lite' });

    const gpu = probeWebGL2();
    push({ label: 'GPU delegate（WebGL2）', value: gpu.ok ? (gpu.renderer || '可用') : '不可用 → 回落 CPU',
      level: gpu.ok ? (gpu.software ? 'warn' : 'ok') : 'warn',
      tip: gpu.software ? '检测到软渲染：到浏览器设置里打开「图形加速」并重启' : undefined });

    const info = deviceSummary();
    push({ label: 'CPU / 内存', value: `${info.cores ?? '?'} 核 · ${info.memoryGb ?? '?'} GB`,
      level: (info.cores ?? 8) >= 4 ? 'ok' : 'warn' });

    const cams = await listCameras();
    push({ label: '摄像头', value: cams.length ? `${cams.length} 个：${cams[0].label || '默认设备'}` : '未发现',
      level: cams.length ? 'ok' : 'bad' });

    if (cams.length > 0 && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      let cam;
      try {
        cam = await openCamera();
        const fps = await measureFps(cam.video, 1000);
        push({ label: '摄像头实测帧率', value: `${fps.toFixed(1)} fps`,
          level: fps >= 20 ? 'ok' : fps >= 12 ? 'warn' : 'bad',
          tip: fps < 15 ? '关掉其它标签页、插上电源；还是慢就把推理帧率调低' : undefined });

        // 光照：把画面缩到 64×36 再统计灰度，别扫全分辨率
        const c = document.createElement('canvas');
        c.width = 64; c.height = 36;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(cam.video, 0, 0, 64, 36);
          const light = analyseLighting(ctx.getImageData(0, 0, 64, 36));
          push({ label: '光照', value: light.issue
            ? `亮度 ${light.luma.toFixed(0)} · 对比 ${light.contrast.toFixed(0)}`
            : `正常（亮度 ${light.luma.toFixed(0)}）`,
            level: light.issue ? 'warn' : 'ok', tip: light.text || undefined });
        }
      } catch (err) {
        push({ label: '摄像头打开', value: String((err as Error).message), level: 'bad',
          tip: '检查权限、镜头盖，或确认没有别的程序占用摄像头' });
      } finally {
        cam?.stop();
      }
    }

    push({ label: '结论', value: out.some((r) => r.level === 'bad')
      ? '有阻断项，先修好上面标红的行'
      : out.some((r) => r.level === 'warn') ? '可以玩，但建议按提示调一下' : '环境良好，直接开玩',
      level: out.some((r) => r.level === 'bad') ? 'bad' : 'info' });
    setRunning(false);
  };

  return (
    <div className="page narrow">
      <h1>设备检测</h1>
      <p className="muted">原站 /check 也是这个思路：先把「识别不准」归因到浏览器、显卡、帧率、光照和站位，再让用户自己修环境，而不是硬调模型。</p>
      <button className="primary" onClick={run} disabled={running}>{running ? '检测中…' : '开始一分钟检测'}</button>

      {rows.length > 0 && (
        <table className="check-table">
          <thead><tr><th>项目</th><th>结果</th><th>建议</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className={r.level}>
                <td>{r.label}</td>
                <td>{r.value}</td>
                <td>{r.tip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
