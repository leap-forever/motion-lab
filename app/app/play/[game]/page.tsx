'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, deviceId } from '@/src/lib/api';
import { loadSettings, type RuntimeState, type Settings } from '@/src/lib/controller';
import { GAMES } from '@/lib/games';
import GameStage, { type GameStageHandle } from '@/components/GameStage';
import SettingsPanel from '@/components/SettingsPanel';

const INIT: RuntimeState = {
  phase: 'idle', message: '', camFps: 0, inferFps: 0, delegate: '', simd: false,
  gpu: '', poseModel: 'lite', score: 0, timeLeft: 45, combo: 0, feedback: '',
  framing: '', lighting: '', error: '', persons: 0,
};

interface Result {
  stars: number;
  rank: number;
  score: number;
}

/**
 * 游戏路由页：保留页面级 UI（标题 / 设置 / HUD / 结束面板 / 成绩提交），
 * 舞台本体交给可复用的 GameStage。
 */
export default function PlayPage() {
  const params = useParams();
  const rawId = params?.game;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : 'fruit-slash';
  const game = GAMES.find((g) => g.id === id) ?? GAMES[0];

  const stageRef = useRef<GameStageHandle>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [state, setState] = useState<RuntimeState>({ ...INIT, timeLeft: game.duration });
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState('');

  const onStatePatch = (patch: Partial<RuntimeState>) => {
    setState((s) => ({ ...s, ...patch }));
  };

  const submitScore = async (score: number, durationMs: number) => {
    try {
      const r = await api.submitScore({
        game: game.id,
        nickname: localStorage.getItem('motion-lab:nickname') || '小玩家',
        score, durationMs, deviceId: deviceId(),
      });
      setResult({ stars: r.stars, rank: r.rank, score });
    } catch {
      setResult({ stars: 0, rank: 0, score });
      setNote('成绩没存上（后端离线？），本局分数仍显示在下面。');
    }
  };

  const begin = async () => {
    setNote('');
    setState({ ...INIT, timeLeft: game.duration, phase: 'loading', message: '准备中…' });
    setResult(null);
    await stageRef.current?.begin();
  };

  const again = () => {
    stageRef.current?.stop();
    setState({ ...INIT, timeLeft: game.duration });
    setResult(null);
    // 等一拍让摄像头轨道彻底释放，再重新申请
    window.setTimeout(() => void begin(), 120);
  };

  const idle = state.phase === 'idle' || state.phase === 'error';
  const loading = state.phase === 'loading';

  return (
    <div className="page play-page">
      <div className="play-head">
        <h1>{game.name} <small>{game.nameEn}</small></h1>
        <div className="hud-chips">
          <span>采集 {state.camFps || '—'} fps</span>
          <span>推理 {state.inferFps || '—'} fps</span>
          <span>{state.delegate || '—'} · {state.poseModel}</span>
          <span>{state.persons} 人</span>
          <span>SIMD {state.simd ? '✓' : '×'}</span>
        </div>
      </div>

      <GameStage
        key={game.id}
        ref={stageRef}
        gameId={game.id}
        settings={settings}
        onState={onStatePatch}
        onFinish={submitScore}
      >
        {(idle || loading || state.phase === 'finished') && (
          <div className="overlay">
            {idle && (
              <div className="overlay-card wide">
                <h2>{game.name}</h2>
                <p>{game.desc}。站在摄像头前 2 米左右，让上半身和双手都在画面里。首次启动要下载 WASM 与姿态模型，耐心等几秒。</p>
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
      </GameStage>

      <p className="tiny">
        GPU：{state.gpu || '检测中'} · 摄像头画面只进本地 &lt;video&gt; 与 canvas；模型推理在本机 WASM 中完成。
      </p>
    </div>
  );
}
