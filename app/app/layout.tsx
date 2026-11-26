'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import '../../src/styles.css';
import SwRegister from '@/components/SwRegister';

/**
 * 应用层外壳（路由 /app/*）：顶栏 + 页脚 + Service Worker 注册。
 * 对应原 src/App.tsx 的 chrome 部分，路由切换交给 Next 文件路由，当前页高亮用 usePathname。
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  const onHome = pathname === '/app' || pathname === '/app/';
  const onCheck = pathname.startsWith('/app/check');

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-dot" />
          Motion Lab
          <small>体感实验台</small>
        </a>
        <nav>
          <a href="/" className="">内容站</a>
          <a href="/app" className={onHome ? 'active' : ''}>游戏大厅</a>
          <a href="/app/check" className={onCheck ? 'active' : ''}>设备检测</a>
        </nav>
        <span className="badge">净室教学复刻 · 仅供本地学习</span>
      </header>

      <main>{children}</main>

      <footer className="foot">
        摄像头画面只在本机处理，不上传 · 项目为架构学习用途，素材来自 dongdongpark.com
      </footer>

      <SwRegister />
    </div>
  );
}
