'use client';

import { useEffect, useState } from 'react';
import { api, type GameInfo, type ScoreRow } from '@/src/lib/api';
import { loadSettings, saveSettings } from '@/src/lib/controller';
import SettingsPanel from '@/components/SettingsPanel';

/** 游戏大厅（原 src/pages/Home.tsx） */
export default function HomePage() {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [board, setBoard] = useState<ScoreRow[]>([]);
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    api.games().then((r) => setGames(r.games)).catch(() => {});
    api.leaderboard('fruit-slash').then((r) => setBoard(r.rows)).catch(() => {});
  }, []);

  const updateSettings = (s: typeof settings) => { setSettings(s); saveSettings(s); };

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>用摄像头玩的体感游戏</h1>
          <p>浏览器里跑 MediaPipe 姿态识别，画面不出本机。这个项目把「采集 → 帧节流 → 推理 → 特征 → Canvas 2D 游戏」整条链路摊开给你看。</p>
          <div className="hero-actions">
            <a className="primary" href="/app/play/fruit-slash">开始切水果 →</a>
            <a className="ghost" href="/app/check">先做设备检测</a>
          </div>
          <p className="tiny">免登录、局数不限 · 首次加载需下载约 18MB 的 WASM + 模型</p>
        </div>
        <div className="arch-card">
          <h3>这一版复刻了什么</h3>
          <ol>
            <li>静态内容站 <code>/</code> 与 React PWA <code>/app</code> 分离</li>
            <li><code>requestVideoFrameCallback</code> 实测帧率 + FrameGate 节流</li>
            <li>MediaPipe WASM，GPU → CPU、SIMD → nosimd 双兜底</li>
            <li>33 关键点 → 归一化特征 → Canvas 2D 游戏</li>
            <li>Service Worker 离线缓存 + 最小成绩/榜单 API</li>
          </ol>
          <p className="tiny">代码全自写并带注释；minified chunk 只作为设计参考，没有反编译搬运。</p>
        </div>
      </section>

      <section>
        <h2>游戏</h2>
        <div className="cards">
          {games.map((g) => (
            <article className="card" key={g.id}>
              <img src={g.shot} alt={g.name} loading="lazy" />
              <div className="card-body">
                <h3>{g.name} <small>{g.nameEn}</small></h3>
                <p>{g.desc}</p>
                <div className="tags">
                  <span>{g.age[0]}–{g.age[1]} 岁</span>
                  <span>{g.duration}s</span>
                  <span className={g.playable ? 'ok' : ''}>{g.playable ? '可玩' : '仅展示'}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="two-col">
        <div>
          <h2>运行参数</h2>
          <SettingsPanel value={settings} onChange={updateSettings} />
        </div>
        <div>
          <h2>本周榜单 <small className="tiny">（只显示昵称，不显示设备标识）</small></h2>
          {board.length === 0 ? <p className="muted">还没有成绩，去打一局吧。</p> : (
            <ol className="board">
              {board.map((r, i) => (
                <li key={`${r.nickname}-${r.at}-${i}`}>
                  <span>{i + 1}. {r.nickname}</span>
                  <b>{r.score} 分</b>
                  <span>{'★'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
