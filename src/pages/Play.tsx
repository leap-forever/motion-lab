import { useEffect, useRef, useState } from 'react';
import { api, deviceId } from '../lib/api';
import { loadSettings, PlayController, type RuntimeState, type Settings } from '../lib/controller';
import SettingsPanel from '../components/SettingsPanel';

const INIT: RuntimeState = {
  phase: 'idle', message: '', camFps: 0, inferFps: 0, delegate: '', simd: false,
  gpu: '', poseModel: 'lite', score: 0, timeLeft: 45, combo: 0, feedback: '',
  framing: '', lighting: '', error: '', persons: 0,
};

export default function Play() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ctrlRef = useRef<PlayController | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [state, setState] = useState<RuntimeState>(INIT);
  const [result, setResult] = useState<{ stars: number; rank: number; score: number } | null>(null);
  const [note, setNote] = useState('');

  // 组件卸载时必须停摄像头，否则标签页关了灯还亮着
  useEffect(() => () => ctrlRef.current?.stop(), []);

  const begin = async () => {
    if (!canvasRef.current || !videoRef.current) return;
    setNote('');
    try {
      const t = await api.consumeTrial(deviceId());
      if (!t.allowed) { setNote('今天的 2 次免登录试玩已用完。'); return; }
    } catch (err) {
      setNote(`后端没连上（${String((err as Error).message)}）。请先运行 npm run api`);
      return;
    }

    ctrlRef.current?.stop();
    setState({ ...INIT, phase: 'loading', message: '准备中…' });
    setResult(null);

    const ctrl = new PlayController({
      canvas: canvasRef.current,
      video: videoRef.current,
      settings,
      onState: (patch) => setState((s) => ({ ...s, ...patch })),
      onFinish: async (score, durationMs) => {
        try {
          const r = await api.submitScore({
            game: 'fruit-slash',
            nickname: localStorage.getItem('motion-lab:nickname') || '小玩家',
            score, durationMs, deviceId: deviceId(),
          });
          setResult({ stars: r.stars, rank: r.rank, score });
        } catch {
          setResult({ stars: 0, rank: 0, score });
          setNote('成绩没存上（后端离线？），本局分数仍显示在下面。');
        }
      },
    });
    ctrlRef.current = ctrl;
    await ctrl.start();
  };

  const again = () => {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    setState({ ...INIT });
    setResult(null);
    // 等一拍让摄像头轨道彻底释放，再重新申请
    window.setTimeout(() => void begin(), 120);
  };

  const idle = state.phase === 'idle' || state.phase === 'error';
  const loading = state.phase === 'loading';

  return (
    <div className="page play-page">
      <div className="play-head">
        <h1>切水果 <small>Fruit Slash</small></h1>
        <div className="hud-chips">
          <span>采集 {state.camFps || '—'} fps</span>
          <span>推理 {state.inferFps || '—'} fps</span>
          <span>{state.delegate || '—'} · {state.poseModel}</span>
          <span>{state.persons} 人</span>
          <span>SIMD {state.simd ? '✓' : '×'}</span>
        </div>
      </div>

      <div className="stage-wrap">
        <canvas ref={canvasRef} className="game-canvas" />

        <video ref={videoRef} className="cam-preview" autoPlay muted playsInline />
        <div className="cam-label">本地预览 · 不上传</div>

        {(idle || loading || state.phase === 'finished') && (
          <div className="overlay">
            {idle && (
              <div className="overlay-card wide">
                <h2>挥手切开飞起来的水果</h2>
                <p>站在摄像头前 2 米左右，让上半身和双手都在画面里。首次启动要下载 WASM 与姿态模型，耐心等几秒。</p>
                <SettingsPanel value={settings} onChange={setSettings} />
                <button className="primary" onClick={() => void begin()}>开始游戏</button>
                {note && <p className="warn">{note}</p>}
                {state.phase === 'error' && <p className="warn">出错了：{state.error}</p>}
              </div>
            )}
            {loading && <div className="overlay-card"><h2>正在准备…</h2><p>{state.message}</p></div>}
            {state.phase === 'finished' && (
              <div className="overlay-card">
                <h2>时间到！</h2>
                <p className="big-score">{result?.score ?? state.score} 分</p>
                <p>{'★'.repeat(result?.stars ?? 0)}{'☆'.repeat(3 - (result?.stars ?? 0))} · 榜单第 {result?.rank ?? '—'} 名</p>
                <button className="primary" onClick={again}>再来一局</button>
                <a className="ghost" href="/app">回大厅</a>
                {note && <p className="warn">{note}</p>}
              </div>
            )}
          </div>
        )}

        {state.phase === 'running' && (
          <div className="live-hud">
            <b>{state.score} 分</b>
            <span>{state.timeLeft}s</span>
            {state.feedback && <em>{state.feedback}</em>}
            {state.framing && state.framing !== '站位 OK' && <p className="tip">📐 {state.framing}</p>}
            {state.lighting && <p className="tip">💡 {state.lighting}</p>}
          </div>
        )}
      </div>

      <p className="tiny">
        GPU：{state.gpu || '检测中'} · 摄像头画面只进本地 &lt;video&gt; 与 canvas；模型推理在本机 WASM 中完成。
      </p>
    </div>
  );
}
