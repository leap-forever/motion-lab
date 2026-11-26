'use client';

import { useEffect, useState } from 'react';
import { listCameras } from '@/src/lib/camera';
import { MODEL_BYTES, type PoseModel } from '@/src/lib/config';
import type { Settings } from '@/src/lib/controller';

interface Props {
  value: Settings;
  onChange: (s: Settings) => void;
  disabled?: boolean;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** 把原站「设置」里最关键的几个模型/性能开关摆到台面上 */
export default function SettingsPanel({ value, onChange, disabled }: Props) {
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => { listCameras().then(setCams).catch(() => {}); }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="settings">
      <label>
        识别模型
        <select disabled={disabled} value={value.model} onChange={(e) => set('model', e.target.value as PoseModel)}>
          {(['lite', 'full', 'heavy'] as PoseModel[]).map((m) => (
            <option key={m} value={m}>{m} · {mb(MODEL_BYTES[m])}</option>
          ))}
        </select>
        <small>低配机器选 lite；原站默认 full，设备检测发现 &lt;15fps 会建议切 lite</small>
      </label>

      <label>
        目标推理帧率 <b>{value.targetFps} fps</b>
        <input disabled={disabled} type="range" min={10} max={30} step={2}
          value={value.targetFps} onChange={(e) => set('targetFps', Number(e.target.value))} />
        <small>FrameGate 的上限；摄像头实际帧率更低时以实际为准</small>
      </label>

      <label>
        摄像头
        <select disabled={disabled} value={value.cameraId || ''} onChange={(e) => set('cameraId', e.target.value)}>
          <option value="">系统默认</option>
          {cams.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `摄像头 ${i + 1}`}</option>)}
        </select>
      </label>

      <label>
        最大检测人数
        <select disabled={disabled} value={value.numPoses} onChange={(e) => set('numPoses', Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} 人</option>)}
        </select>
        <small>对应 MediaPipe 的 numPoses；多留一个槽位更不容易丢人</small>
      </label>

      <label className="check">
        <input disabled={disabled} type="checkbox" checked={value.showSkeleton}
          onChange={(e) => set('showSkeleton', e.target.checked)} />
        显示骨架（调试）
      </label>
    </div>
  );
}
