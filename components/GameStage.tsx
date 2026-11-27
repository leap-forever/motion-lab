'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { PlayController, type Phase, type RuntimeState, type Settings } from '@/src/lib/controller';

interface Props {
  gameId: string;
  phase: Phase;
  settings: Settings;
  onState: (patch: Partial<RuntimeState>) => void;
  onFinish: (score: number, durationMs: number) => void;
  children?: ReactNode;
}

export interface GameStageHandle {
  begin: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
}

/**
 * 可复用的游戏舞台：只负责 canvas / video / 控制器 / 全屏 / 暂停控制。
 *
 * 标题、HUD、设置面板、开始/暂停/结束面板、成绩提交都交给外部页面，
 * 通过 children 插槽覆盖在舞台之上。这样同一个舞台可以嵌到任何页面。
 */
const GameStage = forwardRef<GameStageHandle, Props>(function GameStage(
  { gameId, phase, settings, onState, onFinish, children },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ctrlRef = useRef<PlayController | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => () => {
    ctrlRef.current?.stop();
    if (document.fullscreenElement === stageRef.current) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'paused') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key.toLowerCase() !== 'p') return;
      event.preventDefault();
      const ctrl = ctrlRef.current;
      if (!ctrl) return;
      if (ctrl.isPaused) ctrl.resume();
      else ctrl.pause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const stop = () => {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
  };

  const begin = async () => {
    if (!canvasRef.current || !videoRef.current) return;
    stop();

    const ctrl = new PlayController({
      canvas: canvasRef.current,
      video: videoRef.current,
      settings,
      gameId,
      onState,
      onFinish,
    });
    ctrlRef.current = ctrl;
    await ctrl.start();
  };

  const pause = () => ctrlRef.current?.pause();
  const resume = () => ctrlRef.current?.resume();
  const togglePause = () => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    if (ctrl.isPaused) ctrl.resume();
    else ctrl.pause();
  };

  useImperativeHandle(ref, () => ({ begin, stop, pause, resume, togglePause }));

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const canPause = phase === 'running' || phase === 'paused';

  return (
    <div className="stage-wrap" ref={stageRef}>
      <canvas ref={canvasRef} className="game-canvas" />
      <video ref={videoRef} className="cam-bg" autoPlay muted playsInline />
      <div className="cam-label">本地画面 · 不上传</div>
      <div className="stage-actions">
        {canPause && (
          <button
            type="button"
            className="stage-pause-btn"
            onClick={togglePause}
            aria-pressed={phase === 'paused'}
            title="暂停 / 继续（P）"
          >
            {phase === 'paused' ? '继续' : '暂停'}
          </button>
        )}
        <button type="button" className="stage-fs-btn" onClick={toggleFullscreen}>
          {isFullscreen ? '退出全屏' : '全屏'}
        </button>
      </div>
      {children}
    </div>
  );
});

export default GameStage;
